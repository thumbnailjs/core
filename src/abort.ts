// ---------------------------------------------------------------------------
// Abort helpers shared by the pipeline and the built-in renderers
// ---------------------------------------------------------------------------

/** The error to throw/reject with when `signal` fired. */
export function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Aborted", "AbortError");
}

/** Throw the signal's abort reason if it has already fired. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

/**
 * Race a task against an AbortSignal: reject with the abort reason as soon as
 * the signal fires, even when the underlying work cannot be cancelled (canvas
 * encode, image decode, a custom renderer that ignores `signal`). The losing
 * task's eventual settlement is swallowed so it never surfaces as an
 * unhandled rejection.
 */
export function raceWithAbort<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortError(signal));
      task.catch(() => {}); // detach — the task may still settle later
    };
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}
