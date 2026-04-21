import type { User } from "../types";
import { apiFetch, setToken } from "./client";

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: User["role"];
  };
};

export async function signIn(email: string, password: string) {
  try {
    const data = (await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })) as LoginResponse;

    setToken(data.token);

    const user: User = {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.displayName,
      role: data.user.role,
      avatarUrl: "https://js.devexpress.com/Demos/WidgetsGallery/JSDemos/images/employees/06.png",
    };

    return {
      isOk: true as const,
      data: user,
    };
  } catch (e: unknown) {
    return {
      isOk: false as const,
      message: e instanceof Error ? e.message : "Authentication failed",
    };
  }
}

export async function getUser() {
  try {
    const t = typeof window !== "undefined" ? sessionStorage.getItem("auth_token") : null;
    if (!t) {
      return { isOk: false as const };
    }
    const data = (await apiFetch("/api/auth/me")) as {
      id: string;
      email: string;
      displayName: string;
      role: User["role"];
    };

    const user: User = {
      id: data.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      avatarUrl: "https://js.devexpress.com/Demos/WidgetsGallery/JSDemos/images/employees/06.png",
    };

    return {
      isOk: true as const,
      data: user,
    };
  } catch {
    return {
      isOk: false as const,
    };
  }
}

export async function createAccount(_email: string, _password: string) {
  return {
    isOk: false as const,
    message: "Registration is disabled in this MVP",
  };
}

export async function changePassword(_email: string, _recoveryCode?: string) {
  return {
    isOk: false as const,
    message: "Not available in this MVP",
  };
}

export async function resetPassword(_email: string) {
  return {
    isOk: false as const,
    message: "Not available in this MVP",
  };
}
