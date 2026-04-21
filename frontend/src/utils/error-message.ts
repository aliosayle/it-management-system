/**
 * Turn any thrown value or DevExtreme error payload into a single string for toasts.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err == null || err === "") {
    return fallback;
  }
  if (typeof err === "string") {
    const t = err.trim();
    return t || fallback;
  }
  if (err instanceof Error) {
    const t = err.message?.trim();
    return t || fallback;
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) {
      return m.trim();
    }
  }
  return fallback;
}

/** `onDataErrorOccurred` passes `e.error` as Error, string, or (rarely) another shape. */
export function getDataGridErrorMessage(e: { error?: unknown }): string {
  return getErrorMessage(e.error, "Request failed");
}
