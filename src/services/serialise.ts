/**
 * Creates an independent promise-chain serialiser.
 * Each call to the returned function queues behind the previous one.
 * Multiple serialisers operate independently (no shared lock).
 */
export function createSerialiser() {
  let lock: Promise<void> = Promise.resolve();
  return function serialise<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: (() => void) | undefined;
    const prev = lock;
    lock = new Promise<void>((r) => {
      resolve = r;
    });
    return prev.then(fn).finally(() => resolve?.());
  };
}
