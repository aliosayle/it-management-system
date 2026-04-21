const TOKEN_KEY = "auth_token";

const BODY_PREVIEW_MAX = 1200;

/** Parse JSON error bodies from the API (`{ error: string }`, Zod `flatten()`, `{ message }`). */
function formatServerErrorPayload(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) {
    return o.message.trim();
  }
  if (typeof o.error === "string" && o.error.trim()) {
    return o.error.trim();
  }
  if (o.error && typeof o.error === "object") {
    const fe = o.error as {
      formErrors?: unknown;
      fieldErrors?: Record<string, unknown>;
    };
    const parts: string[] = [];
    if (Array.isArray(fe.formErrors)) {
      for (const x of fe.formErrors) {
        if (typeof x === "string" && x.trim()) {
          parts.push(x.trim());
        }
      }
    }
    if (fe.fieldErrors && typeof fe.fieldErrors === "object") {
      for (const [key, val] of Object.entries(fe.fieldErrors)) {
        if (Array.isArray(val)) {
          const msgs = val.filter((x): x is string => typeof x === "string" && x.length > 0);
          if (msgs.length) {
            parts.push(`${key}: ${msgs.join(", ")}`);
          }
        }
      }
    }
    if (parts.length) {
      return parts.join(" · ");
    }
    try {
      return JSON.stringify(o.error);
    } catch {
      return String(o.error);
    }
  }
  return null;
}

function messageFromFailedResponse(status: number, statusText: string, bodyText: string): string {
  const trimmed = bodyText.trim();
  const fallback = trimmed || statusText || `Request failed (${status})`;
  if (!trimmed) {
    return fallback;
  }
  try {
    const j = JSON.parse(trimmed) as unknown;
    const formatted = formatServerErrorPayload(j);
    if (formatted) {
      return formatted.length > BODY_PREVIEW_MAX
        ? `${formatted.slice(0, BODY_PREVIEW_MAX)}…`
        : formatted;
    }
  } catch {
    /* plain text or HTML body */
  }
  if (trimmed.length > BODY_PREVIEW_MAX) {
    return `${trimmed.slice(0, BODY_PREVIEW_MAX)}…`;
  }
  return trimmed;
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token === null) {
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init?.body !== null;
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const t = getToken();
  if (t) {
    headers.set("Authorization", `Bearer ${t}`);
  }
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(messageFromFailedResponse(res.status, res.statusText, text));
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

/** Authenticated GET returning raw bytes (e.g. file download). */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const t = getToken();
  if (t) {
    headers.set("Authorization", `Bearer ${t}`);
  }
  const res = await fetch(path, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromFailedResponse(res.status, res.statusText, text));
  }
  return res.blob();
}
