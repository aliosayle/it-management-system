import { apiFetch } from "./client";

export type NotificationRow = {
  id: string;
  type: string;
  taskId: string | null;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function fetchUnreadNotificationCount(): Promise<number> {
  const data = (await apiFetch("/api/notifications/unread-count")) as { count: number };
  return data.count;
}

export async function fetchNotifications(unreadOnly = false): Promise<NotificationRow[]> {
  const q = unreadOnly ? "?unreadOnly=true" : "";
  return apiFetch(`/api/notifications${q}`) as Promise<NotificationRow[]>;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/notifications/read-all", { method: "POST" });
}
