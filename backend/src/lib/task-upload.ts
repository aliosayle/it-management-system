import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function taskUploadRoot(): string {
  const fromEnv = process.env.TASK_UPLOAD_DIR;
  return fromEnv ? path.resolve(fromEnv) : path.join(process.cwd(), "uploads", "tasks");
}

const uploadDir = taskUploadRoot();
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const taskPhotoUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
});

export function resolveTaskAttachmentPath(storedPath: string): string {
  const abs = path.isAbsolute(storedPath)
    ? storedPath
    : path.join(uploadDir, storedPath);
  const normalizedRoot = path.resolve(uploadDir);
  const normalizedFile = path.resolve(abs);
  if (
    normalizedFile !== normalizedRoot &&
    !normalizedFile.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error("Invalid attachment path");
  }
  return normalizedFile;
}
