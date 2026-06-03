import { Router } from "express";
import { z } from "zod";
import {
  TaskActivityType,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requirePermission } from "../lib/permissions.js";
import { requireAuth } from "../middleware/auth.js";
import {
  canAccessTasksModule,
  canChangeTaskStatus,
  canCreateTask,
  canDeleteTask,
  canEditTaskFields,
  canReadAllTasks,
  canViewTask,
  getTaskActor,
  taskListWhere,
  type TaskListScope,
} from "../lib/task-access.js";
import {
  notifyFollowUpScheduled,
  notifyTaskAssigned,
  notifyTaskComment,
  notifyTaskReassigned,
  notifyTaskStatus,
} from "../lib/task-notifications.js";

const router = Router();
router.use(requireAuth);

const taskInclude = {
  createdBy: { select: { id: true, displayName: true, email: true } },
  assignee: { select: { id: true, displayName: true, email: true } },
  site: { select: { id: true, name: true, company: { select: { name: true } } } },
  personnel: { select: { id: true, firstName: true, lastName: true } },
  product: { select: { id: true, sku: true, name: true } },
  purchase: { select: { id: true, bonOriginalName: true } },
} as const;

function statusLabel(s: TaskStatus): string {
  return s.replace(/_/g, " ").toLowerCase();
}

function serializeTaskListRow(task: {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  createdById: string;
  assigneeId: string;
  siteId: string | null;
  personnelId: string | null;
  productId: string | null;
  purchaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; displayName: string; email: string };
  assignee: { id: string; displayName: string; email: string };
  site: { id: string; name: string; company: { name: string } } | null;
  personnel: { id: string; firstName: string; lastName: string } | null;
  product: { id: string; sku: string; name: string } | null;
  purchase: { id: string; bonOriginalName: string } | null;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    createdById: task.createdById,
    assigneeId: task.assigneeId,
    createdByName: task.createdBy.displayName,
    assigneeName: task.assignee.displayName,
    siteId: task.siteId,
    siteLabel: task.site
      ? `${task.site.company.name} / ${task.site.name}`
      : null,
    personnelId: task.personnelId,
    personnelName: task.personnel
      ? `${task.personnel.firstName} ${task.personnel.lastName}`.trim()
      : null,
    productId: task.productId,
    productLabel: task.product ? `${task.product.sku} — ${task.product.name}` : null,
    purchaseId: task.purchaseId,
    purchaseLabel: task.purchase?.bonOriginalName ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function serializeActivity(a: {
  id: string;
  type: TaskActivityType;
  body: string | null;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  createdAt: Date;
  createdBy: { id: string; displayName: string };
}) {
  return {
    id: a.id,
    type: a.type,
    body: a.body,
    fromStatus: a.fromStatus,
    toStatus: a.toStatus,
    createdAt: a.createdAt,
    createdById: a.createdBy.id,
    createdByName: a.createdBy.displayName,
  };
}

function serializeFollowUp(f: {
  id: string;
  scheduledAt: Date;
  completedAt: Date | null;
  note: string | null;
  createdAt: Date;
  assignee: { id: string; displayName: string };
  createdBy: { id: string; displayName: string };
}) {
  return {
    id: f.id,
    scheduledAt: f.scheduledAt,
    completedAt: f.completedAt,
    note: f.note,
    createdAt: f.createdAt,
    assigneeId: f.assignee.id,
    assigneeName: f.assignee.displayName,
    createdByName: f.createdBy.displayName,
  };
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(512),
  description: z.string().trim().optional().nullable(),
  assigneeId: z.string().min(1),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.coerce.date().optional().nullable(),
  siteId: z.string().optional().nullable(),
  personnelId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  purchaseId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(512).optional(),
  description: z.string().trim().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.coerce.date().optional().nullable(),
  assigneeId: z.string().min(1).optional(),
  siteId: z.string().optional().nullable(),
  personnelId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  purchaseId: z.string().optional().nullable(),
});

const commentSchema = z.object({
  body: z.string().trim().min(1),
});

const followUpSchema = z.object({
  scheduledAt: z.coerce.date(),
  note: z.string().trim().optional().nullable(),
  assigneeId: z.string().optional(),
});

function parseScope(raw: unknown): TaskListScope {
  const s = typeof raw === "string" ? raw : "mine";
  if (s === "all" || s === "assigned" || s === "created" || s === "mine") {
    return s;
  }
  return "mine";
}

router.get("/meta/assignees", requireAuth, async (req, res) => {
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const canPick =
    (await canCreateTask(actor)) ||
    (await canEditAnyTask(actor)) ||
    actor.role === "ADMIN";
  if (!canPick) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const users = await prisma.user.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, email: true },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      label: `${u.displayName} (${u.email})`,
      displayName: u.displayName,
      email: u.email,
    })),
  );
});

router.get("/", requireAuth, async (req, res) => {
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await canAccessTasksModule(actor))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const readAll = await canReadAllTasks(actor);
  let scope = parseScope(req.query.scope);
  if (scope === "all" && !readAll) {
    scope = "mine";
  }
  const where = taskListWhere(actor, scope, readAll);
  const rows = await prisma.task.findMany({
    where,
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    include: taskInclude,
  });
  res.json(rows.map(serializeTaskListRow));
});

router.post("/", requirePermission("tasks", "add"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const actor = await getTaskActor(req.user!.sub);
  if (!actor || !(await canCreateTask(actor))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const data = parsed.data;
  const creator = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { displayName: true },
  });
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        assigneeId: data.assigneeId,
        createdById: actor.id,
        priority: data.priority ?? TaskPriority.NORMAL,
        dueAt: data.dueAt ?? null,
        siteId: data.siteId ?? null,
        personnelId: data.personnelId ?? null,
        productId: data.productId ?? null,
        purchaseId: data.purchaseId ?? null,
      },
      include: taskInclude,
    });
    await tx.taskActivity.create({
      data: {
        taskId: created.id,
        type: TaskActivityType.ASSIGNMENT,
        body: `Assigned to ${created.assignee.displayName}`,
        createdById: actor.id,
      },
    });
    return created;
  });

  await notifyTaskAssigned({
    assigneeId: task.assigneeId,
    creatorId: actor.id,
    taskId: task.id,
    title: task.title,
    creatorName: creator?.displayName ?? "Someone",
  });

  res.status(201).json(serializeTaskListRow(task));
});

router.get("/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      followUps: {
        orderBy: { scheduledAt: "asc" },
        include: {
          assignee: { select: { id: true, displayName: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
      },
      activities: {
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: { select: { id: true, displayName: true } },
        },
      },
    },
  });
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canViewTask(actor, task))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({
    ...serializeTaskListRow(task),
    followUps: task.followUps.map(serializeFollowUp),
    activities: task.activities.map(serializeActivity),
  });
});

router.patch("/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canViewTask(actor, existing))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const data = parsed.data;
  const wantsFieldEdit =
    data.title !== undefined ||
    data.description !== undefined ||
    data.priority !== undefined ||
    data.dueAt !== undefined ||
    data.assigneeId !== undefined ||
    data.siteId !== undefined ||
    data.personnelId !== undefined ||
    data.productId !== undefined ||
    data.purchaseId !== undefined;

  if (wantsFieldEdit && !(await canEditTaskFields(actor, existing))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (data.status !== undefined && !(await canChangeTaskStatus(actor, existing))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const actorUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { displayName: true },
  });
  const actorName = actorUser?.displayName ?? "Someone";

  const updated = await prisma.$transaction(async (tx) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueAt !== undefined) patch.dueAt = data.dueAt;
    if (data.siteId !== undefined) patch.siteId = data.siteId;
    if (data.personnelId !== undefined) patch.personnelId = data.personnelId;
    if (data.productId !== undefined) patch.productId = data.productId;
    if (data.purchaseId !== undefined) patch.purchaseId = data.purchaseId;
    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.completedAt =
        data.status === TaskStatus.DONE
          ? new Date()
          : data.status === existing.status
            ? existing.completedAt
            : null;
      if (data.status !== TaskStatus.DONE && existing.status === TaskStatus.DONE) {
        patch.completedAt = null;
      }
    }

    const row = await tx.task.update({
      where: { id },
      data: patch,
      include: taskInclude,
    });

    if (data.status !== undefined && data.status !== existing.status) {
      await tx.taskActivity.create({
        data: {
          taskId: id,
          type: TaskActivityType.STATUS_CHANGE,
          body: `Status changed to ${statusLabel(data.status)}`,
          fromStatus: existing.status,
          toStatus: data.status,
          createdById: actor.id,
        },
      });
    } else if (wantsFieldEdit) {
      await tx.taskActivity.create({
        data: {
          taskId: id,
          type: TaskActivityType.EDIT,
          body: "Task details updated",
          createdById: actor.id,
        },
      });
    }

    if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
      await tx.taskActivity.create({
        data: {
          taskId: id,
          type: TaskActivityType.ASSIGNMENT,
          body: `Reassigned to ${row.assignee.displayName}`,
          createdById: actor.id,
        },
      });
    }

    return row;
  });

  if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
    await notifyTaskReassigned({
      assigneeId: data.assigneeId,
      taskId: id,
      title: updated.title,
      actorName,
    });
  }
  if (data.status !== undefined && data.status !== existing.status) {
    const notifyId =
      actor.id === existing.createdById ? existing.assigneeId : existing.createdById;
    if (notifyId !== actor.id) {
      await notifyTaskStatus({
        recipientId: notifyId,
        taskId: id,
        title: updated.title,
        actorName,
        statusLabel: statusLabel(data.status),
      });
    }
  }

  res.json(serializeTaskListRow(updated));
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canDeleteTask(actor, existing))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await prisma.task.delete({ where: { id } });
  res.status(204).send();
});

router.post("/:id/comments", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canViewTask(actor, task))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const actorUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { displayName: true },
  });
  const activity = await prisma.taskActivity.create({
    data: {
      taskId: id,
      type: TaskActivityType.COMMENT,
      body: parsed.data.body,
      createdById: actor.id,
    },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
  const recipientId =
    actor.id === task.createdById ? task.assigneeId : task.createdById;
  if (recipientId !== actor.id) {
    await notifyTaskComment({
      recipientId,
      taskId: id,
      title: task.title,
      actorName: actorUser?.displayName ?? "Someone",
    });
  }
  res.status(201).json(serializeActivity(activity));
});

router.post("/:id/follow-ups", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const actor = await getTaskActor(req.user!.sub);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canViewTask(actor, task))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const assigneeId = parsed.data.assigneeId ?? task.assigneeId;
  const actorUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { displayName: true },
  });
  const followUp = await prisma.$transaction(async (tx) => {
    const row = await tx.taskFollowUp.create({
      data: {
        taskId: id,
        scheduledAt: parsed.data.scheduledAt,
        note: parsed.data.note ?? null,
        createdById: actor.id,
        assigneeId,
      },
      include: {
        assignee: { select: { id: true, displayName: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
    await tx.taskActivity.create({
      data: {
        taskId: id,
        type: TaskActivityType.FOLLOW_UP_SCHEDULED,
        body: parsed.data.note
          ? `Follow-up scheduled: ${parsed.data.note}`
          : "Follow-up scheduled",
        createdById: actor.id,
      },
    });
    return row;
  });

  if (assigneeId !== actor.id) {
    await notifyFollowUpScheduled({
      assigneeId,
      taskId: id,
      title: task.title,
      actorName: actorUser?.displayName ?? "Someone",
      scheduledAt: parsed.data.scheduledAt,
    });
  }

  res.status(201).json(serializeFollowUp(followUp));
});

router.patch("/:id/follow-ups/:followUpId", requireAuth, async (req, res) => {
    const taskId = String(req.params.id);
    const followUpId = String(req.params.followUpId);
    const actor = await getTaskActor(req.user!.sub);
    if (!actor) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!(await canViewTask(actor, task))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const existing = await prisma.taskFollowUp.findFirst({
      where: { id: followUpId, taskId },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.completedAt) {
      res.status(400).json({ error: "Follow-up already completed" });
      return;
    }
    const followUp = await prisma.$transaction(async (tx) => {
      const row = await tx.taskFollowUp.update({
        where: { id: followUpId },
        data: { completedAt: new Date() },
        include: {
          assignee: { select: { id: true, displayName: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
      });
      await tx.taskActivity.create({
        data: {
          taskId,
          type: TaskActivityType.FOLLOW_UP_COMPLETED,
          body: existing.note
            ? `Follow-up completed: ${existing.note}`
            : "Follow-up completed",
          createdById: actor.id,
        },
      });
      return row;
    });
    res.json(serializeFollowUp(followUp));
});

export default router;
