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

export async function canEditTaskFields(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (actor.role === Role.ADMIN) return true;
  if (task.createdById === actor.id) return true;
  return canEditAnyTask(actor);
}

export async function canChangeTaskStatus(
  actor: TaskActor,
  task: { createdById: string; assigneeId: string },
): Promise<boolean> {
  if (await canEditTaskFields(actor, task)) return true;
  return task.assigneeId === actor.id;
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
