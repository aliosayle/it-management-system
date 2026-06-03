import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { canDo, loadPermissionsForUser } from "./permissions.js";

export type TaskActor = {
  id: string;
  role: Role;
};

export async function getTaskActor(userId: string): Promise<TaskActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  return user;
}

export async function canReadAllTasks(actor: TaskActor): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  const perms = await loadPermissionsForUser(actor.id, actor.role);
  return canDo(perms, "tasks", "read");
}

export async function canAccessTasksModule(actor: TaskActor): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  const perms = await loadPermissionsForUser(actor.id, actor.role);
  return canDo(perms, "tasks", "view") || canDo(perms, "tasks", "read");
}

export async function canCreateTask(actor: TaskActor): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  const perms = await loadPermissionsForUser(actor.id, actor.role);
  return canDo(perms, "tasks", "add");
}

export async function canEditAnyTask(actor: TaskActor): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  const perms = await loadPermissionsForUser(actor.id, actor.role);
  return canDo(perms, "tasks", "edit");
}

export async function canDeleteAnyTask(actor: TaskActor): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  const perms = await loadPermissionsForUser(actor.id, actor.role);
  return canDo(perms, "tasks", "delete");
}

export function isTaskParticipant(
  task: { createdById: string; assigneeId: string },
  actorId: string,
): boolean {
  return task.createdById === actorId || task.assigneeId === actorId;
}

export async function canViewTask(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  if (isTaskParticipant(task, actor.id)) return true;
  return canReadAllTasks(actor);
}

export async function canManageTask(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  if (task.createdById === actor.id) return true;
  return canEditAnyTask(actor);
}

/** @deprecated use canManageTask */
export const canEditTaskFields = canManageTask;

export async function isTaskAssignee(
  actor: TaskActor,
  task: { assigneeId: string },
): Promise<boolean> {
  return task.assigneeId === actor.id;
}

/** Assignee-only work UI (not admin/creator/tasks.edit). */
export async function isAssigneeWorkMode(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (!(await isTaskAssignee(actor, task))) return false;
  return !(await canManageTask(actor, task));
}

export async function canUploadTaskAttachment(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (!(await canViewTask(actor, task))) return false;
  if (await canManageTask(actor, task)) return true;
  return task.assigneeId === actor.id;
}

export async function canChangeTaskStatus(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (await canManageTask(actor, task)) return true;
  return task.assigneeId === actor.id;
}

export type TaskViewerRole = "manager" | "assignee" | "observer";

export async function resolveTaskViewerRole(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<TaskViewerRole> {
  if (await canManageTask(actor, task)) return "manager";
  if (task.assigneeId === actor.id) return "assignee";
  return "observer";
}

export async function canDeleteTask(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  if (task.createdById === actor.id) return true;
  return canDeleteAnyTask(actor);
}

export type TaskListScope = "all" | "mine" | "assigned" | "created";

export function taskListWhere(
  actor: TaskActor,
  scope: TaskListScope,
  readAll: boolean,
) {
  if (readAll && scope === "all") {
    return {};
  }
  if (scope === "assigned") {
    return { assigneeId: actor.id };
  }
  if (scope === "created") {
    return { createdById: actor.id };
  }
  if (scope === "mine" || !readAll) {
    return {
      OR: [{ assigneeId: actor.id }, { createdById: actor.id }],
    };
  }
  return {
    OR: [{ assigneeId: actor.id }, { createdById: actor.id }],
  };
}
