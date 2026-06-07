import { createCipheriv, randomBytes } from 'crypto';
import {
  decryptCredentials,
  deriveEncryptionKey,
  encryptCredentials,
} from '../../../src/agent/credentials';

describe('credential crypto', () => {
  const key = randomBytes(32);

  it('encrypts and decrypts credential records', () => {
    const credentials = {
      OPENAI_API_KEY: 'sk-test-key',
      AWS_REGION: 'us-east-1',
    };

    const encrypted = encryptCredentials(credentials, key);
    expect(encrypted).not.toContain('sk-test-key');
    expect(decryptCredentials(encrypted, key)).toEqual(credentials);
  });

  it('throws when decrypting with the wrong key', () => {
    const encrypted = encryptCredentials({ GEMINI_API_KEY: 'abc' }, key);
    const wrongKey = randomBytes(32);

    expect(() => decryptCredentials(encrypted, wrongKey)).toThrow();
  });

  it('throws when the encrypted payload format is invalid', () => {
    expect(() => decryptCredentials('not-valid', key)).toThrow(
      'Invalid encrypted credentials payload',
    );
  });

  it('derives a stable-length encryption key from machine metadata', () => {
    const derivedKey = deriveEncryptionKey();
    expect(derivedKey).toHaveLength(32);
    expect(deriveEncryptionKey().equals(derivedKey)).toBe(true);
  });

  it('throws when decrypted credentials are not string values', () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ BAD: 123 }), 'utf8'),
      cipher.final(),
    ]);
    const payload = [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');

    expect(() => decryptCredentials(payload, key)).toThrow('is not a string');
  });
});
