import { AgentTimeoutError } from '../../../src/utils/errors';
import { withTimeout } from '../../../src/agent/providers/timeout';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves when the promise completes before the timeout', async () => {
    const promise = withTimeout(Promise.resolve('ok'), 'test-provider', 1000);
    await expect(promise).resolves.toBe('ok');
  });

  it('rejects with AgentTimeoutError when the promise exceeds the timeout', async () => {
    const promise = withTimeout(
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('late'), 2000);
      }),
      'test-provider',
      1000,
    );

    const expectation = expect(promise).rejects.toBeInstanceOf(AgentTimeoutError);
    jest.advanceTimersByTime(1000);
    await expectation;
  });
});
