/**
 * Executes an async operation with a real AbortController timeout so SDK/fetch
 * requests are actively cancelled on expiration rather than leaking in background.
 */
export async function withAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new Error(timeoutMessage);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(timeoutError);
          controller.abort(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    if (timedOut) {
      throw timeoutError;
    }
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
