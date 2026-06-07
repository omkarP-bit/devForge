import { AgentTimeoutError } from '../../utils/errors';

export const CHAT_TIMEOUT_MS = 30_000;

/**
 * Wraps a promise with a timeout. Rejects with AgentTimeoutError on expiry.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  providerName: string,
  timeoutMs: number = CHAT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AgentTimeoutError(
          `${providerName} request timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
