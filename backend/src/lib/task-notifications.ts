import { UserNotificationType } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function notifyUser(params: {
  userId: string;
  type: UserNotificationType;
  taskId: string;
  title: string;
  body?: string | null;
}) {
  await prisma.userNotification.create({
    data: {
      userId: params.userId,
      type: params.type,
      taskId: params.taskId,
      title: params.title,
      body: params.body ?? null,
    },
  });
}

export async function notifyTaskAssigned(params: {
  assigneeId: string;
  creatorId: string;
  taskId: string;
  title: string;
  creatorName: string;
}) {
  if (params.assigneeId === params.creatorId) return;
  await notifyUser({
    userId: params.assigneeId,
    type: UserNotificationType.TASK_ASSIGNED,
    taskId: params.taskId,
    title: "New task assigned",
    body: `${params.creatorName} assigned you: ${params.title}`,
  });
}

export async function notifyTaskReassigned(params: {
  assigneeId: string;
  taskId: string;
  title: string;
  actorName: string;
}) {
  await notifyUser({
    userId: params.assigneeId,
    type: UserNotificationType.TASK_ASSIGNED,
    taskId: params.taskId,
    title: "Task reassigned to you",
    body: `${params.actorName} reassigned: ${params.title}`,
  });
}

export async function notifyTaskComment(params: {
  recipientId: string;
  taskId: string;
  title: string;
  actorName: string;
}) {
  await notifyUser({
    userId: params.recipientId,
    type: UserNotificationType.TASK_COMMENT,
    taskId: params.taskId,
    title: "New comment on task",
    body: `${params.actorName} commented on: ${params.title}`,
  });
}

export async function notifyTaskStatus(params: {
  recipientId: string;
  taskId: string;
  title: string;
  actorName: string;
  statusLabel: string;
}) {
  await notifyUser({
    userId: params.recipientId,
    type: UserNotificationType.TASK_STATUS,
    taskId: params.taskId,
    title: "Task status updated",
    body: `${params.actorName} set "${params.title}" to ${params.statusLabel}`,
  });
}

export async function notifyTaskSubmittedForReview(params: {
  recipientId: string;
  taskId: string;
  title: string;
  assigneeName: string;
}) {
  if (!params.recipientId) return;
  // TASK_STATUS: works with any deployed Prisma client (TASK_SUBMITTED_FOR_REVIEW needs prisma generate).
  await notifyUser({
    userId: params.recipientId,
    type: UserNotificationType.TASK_STATUS,
    taskId: params.taskId,
    title: "Task submitted for review",
    body: `${params.assigneeName} submitted "${params.title}" for your review. Please review and complete the task.`,
  });
}

export async function notifyFollowUpScheduled(params: {
  assigneeId: string;
  taskId: string;
  title: string;
  actorName: string;
  scheduledAt: Date;
}) {
  await notifyUser({
    userId: params.assigneeId,
    type: UserNotificationType.TASK_FOLLOW_UP_DUE,
    taskId: params.taskId,
    title: "Follow-up scheduled",
    body: `${params.actorName} scheduled a follow-up on "${params.title}" for ${scheduledAtLabel(params.scheduledAt)}`,
  });
}

function scheduledAtLabel(d: Date): string {
  return d.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
