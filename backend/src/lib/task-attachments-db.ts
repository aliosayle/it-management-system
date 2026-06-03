import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

/** Row shape for `task_attachments` (snake_case columns, same pattern as `purchases` / `tasks`). */
export type TaskAttachmentRow = {
  id: string;
  task_id: string;
  stored_path: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_id: string;
  created_at: Date;
};

export async function listTaskAttachments(
  taskId: string,
): Promise<TaskAttachmentRow[]> {
  return prisma.$queryRaw<TaskAttachmentRow[]>`
    SELECT
      id,
      task_id,
      stored_path,
      original_name,
      mime_type,
      file_size,
      uploaded_by_id,
      created_at
    FROM task_attachments
    WHERE task_id = ${taskId}
    ORDER BY created_at ASC
  `;
}

export async function getTaskAttachmentById(
  attachmentId: string,
  taskId: string,
): Promise<TaskAttachmentRow | null> {
  const rows = await prisma.$queryRaw<TaskAttachmentRow[]>`
    SELECT
      id,
      task_id,
      stored_path,
      original_name,
      mime_type,
      file_size,
      uploaded_by_id,
      created_at
    FROM task_attachments
    WHERE id = ${attachmentId} AND task_id = ${taskId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function insertTaskAttachment(
  input: {
    taskId: string;
    storedPath: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    uploadedById: string;
  },
  db: Db = prisma,
): Promise<TaskAttachmentRow> {
  const id = randomUUID();
  const createdAt = new Date();
  await db.$executeRaw`
    INSERT INTO task_attachments (
      id,
      task_id,
      stored_path,
      original_name,
      mime_type,
      file_size,
      uploaded_by_id,
      created_at
    ) VALUES (
      ${id},
      ${input.taskId},
      ${input.storedPath},
      ${input.originalName},
      ${input.mimeType},
      ${input.fileSize},
      ${input.uploadedById},
      ${createdAt}
    )
  `;
  return {
    id,
    task_id: input.taskId,
    stored_path: input.storedPath,
    original_name: input.originalName,
    mime_type: input.mimeType,
    file_size: input.fileSize,
    uploaded_by_id: input.uploadedById,
    created_at: createdAt,
  };
}

export async function deleteTaskAttachment(attachmentId: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM task_attachments WHERE id = ${attachmentId}
  `;
}

export async function attachmentUploaderNames(
  uploadedByIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!uploadedByIds.length) return map;
  const users = await prisma.user.findMany({
    where: { id: { in: uploadedByIds } },
    select: { id: true, displayName: true },
  });
  for (const u of users) {
    map.set(u.id, u.displayName);
  }
  return map;
}

export function serializeTaskAttachmentApi(
  row: TaskAttachmentRow,
  uploadedByName: string,
) {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    uploadedById: row.uploaded_by_id,
    uploadedByName,
  };
}
