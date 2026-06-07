import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from 'crypto';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'devforge-v2';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;

export function deriveEncryptionKey(): Buffer {
  const material = `${os.hostname()}:${os.platform()}`;
  return pbkdf2Sync(material, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export function encryptCredentials(
  credentials: Record<string, string>,
  key: Buffer = deriveEncryptionKey(),
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptCredentials(
  payload: string,
  key: Buffer = deriveEncryptionKey(),
): Record<string, string> {
  const [ivEncoded, authTagEncoded, ciphertextEncoded] = payload.split(':');

  if (!ivEncoded || !authTagEncoded || !ciphertextEncoded) {
    throw new Error('Invalid encrypted credentials payload');
  }

  const iv = Buffer.from(ivEncoded, 'base64');
  const authTag = Buffer.from(authTagEncoded, 'base64');
  const ciphertext = Buffer.from(ciphertextEncoded, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    'utf8',
  );
  const parsed: unknown = JSON.parse(decrypted);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Decrypted credentials are not a valid object');
  }

  const record: Record<string, string> = {};
  for (const [field, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`Decrypted credential "${field}" is not a string`);
    }
    record[field] = value;
  }

  return record;
}
