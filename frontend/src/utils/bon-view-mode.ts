export type BonViewMode = "pdf" | "image" | "unsupported";

export function bonViewModeFromFileName(fileName: string): BonViewMode {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(lower)) {
    return "image";
  }
  return "unsupported";
}

export function bonViewModeFromBlob(fileName: string, blob: Blob): BonViewMode {
  const fromName = bonViewModeFromFileName(fileName);
  if (fromName !== "unsupported") {
    return fromName;
  }
  if (blob.type === "application/pdf") {
    return "pdf";
  }
  if (blob.type.startsWith("image/")) {
    return "image";
  }
  return "unsupported";
}
