const TOKEN_KEY = "auth_token";

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
    let message = text || res.statusText;
    try {
      const j = JSON.parse(text) as { error?: unknown };
      if (j && typeof j.error === "string") {
        message = j.error;
      }
    } catch {
      /* keep text */
    }
    throw new Error(message);
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
    let message = text || res.statusText;
    try {
      const j = JSON.parse(text) as { error?: unknown };
      if (j && typeof j.error === "string") {
        message = j.error;
      }
    } catch {
      /* keep text */
    }
    throw new Error(message);
  }
  return res.blob();
}
