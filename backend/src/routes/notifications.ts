import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function serializeNotification(n: {
  id: string;
  type: string;
  taskId: string | null;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    taskId: n.taskId,
    title: n.title,
    body: n.body,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

router.get("/unread-count", async (req, res) => {
  const count = await prisma.userNotification.count({
    where: { userId: req.user!.sub, readAt: null },
  });
  res.json({ count });
});

router.get("/", async (req, res) => {
  const unreadOnly = req.query.unreadOnly === "true";
  const rows = await prisma.userNotification.findMany({
    where: {
      userId: req.user!.sub,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(rows.map(serializeNotification));
});

router.patch("/:id/read", async (req, res) => {
  const id = String(req.params.id);
  const row = await prisma.userNotification.findFirst({
    where: { id, userId: req.user!.sub },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = await prisma.userNotification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  res.json(serializeNotification(updated));
});

router.post("/read-all", async (req, res) => {
  await prisma.userNotification.updateMany({
    where: { userId: req.user!.sub, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
