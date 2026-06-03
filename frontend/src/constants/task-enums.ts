export const TASK_STATUS_OPTIONS = [
  { value: "OPEN", text: "Open" },
  { value: "IN_PROGRESS", text: "In progress" },
  { value: "ON_HOLD", text: "On hold" },
  { value: "PENDING_REVIEW", text: "Pending review" },
  { value: "DONE", text: "Done" },
  { value: "CANCELLED", text: "Cancelled" },
] as const;

export const TASK_PRIORITY_OPTIONS = [
  { value: "LOW", text: "Low" },
  { value: "NORMAL", text: "Normal" },
  { value: "HIGH", text: "High" },
  { value: "URGENT", text: "Urgent" },
] as const;

export type TaskScope = "mine" | "assigned" | "created" | "all";

export const TASK_SCOPE_OPTIONS: { value: TaskScope; text: string }[] = [
  { value: "mine", text: "My tasks" },
  { value: "assigned", text: "Assigned to me" },
  { value: "created", text: "Created by me" },
  { value: "all", text: "All tasks" },
];

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_OPTIONS.find((o) => o.value === status)?.text ?? status;
}

export function taskPriorityLabel(priority: string): string {
  return TASK_PRIORITY_OPTIONS.find((o) => o.value === priority)?.text ?? priority;
}
