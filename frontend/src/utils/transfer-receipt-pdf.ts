import jsPDF from "jspdf";
import appInfo from "../app-info";
import { movementTypeLabel } from "../constants/movement-types";

export type TransferReceipt = {
  movementId: string;
  movementType: string;
  quantity: number;
  balanceAfter: number;
  issuedAt: string | Date;
  note: string | null;
  productSku: string;
  productName: string;
  issuedBy: string;
  source: string;
  destination: string;
};

const FONT = "helvetica";
const FIELD_FONT_SIZE = 10;
const ROW_GAP = 10;
const WRAP_LINE_GAP = 5;

function formatReceiptDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human-readable receipt number from issue timestamp (no internal IDs). */
function formatReceiptNumber(issuedAt: string | Date): string {
  const d = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  if (Number.isNaN(d.getTime())) {
    return "TR-UNKNOWN";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `TR-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fitFontSize(doc: jsPDF, text: string, maxWidth: number, base: number, min = 6): number {
  let size = base;
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

function drawFieldRow(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  const labelText = `${label}:`;
  doc.setFont(FONT, "bold");
  doc.setFontSize(FIELD_FONT_SIZE);
  doc.text(labelText, x, y);

  const valueX = x + doc.getTextWidth(labelText) + 2;
  const maxW = Math.max(12, x + width - valueX);
  doc.setFont(FONT, "normal");

  const lines = (
    value.trim() ? doc.splitTextToSize(value.trim(), maxW) : [""]
  ) as string[];
  let lineY = y;

  lines.forEach((line, idx) => {
    if (idx > 0) {
      lineY += WRAP_LINE_GAP;
    }
    if (line) {
      const size = fitFontSize(doc, line, maxW, FIELD_FONT_SIZE, 7);
      doc.setFontSize(size);
      doc.text(line, valueX, lineY);
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(valueX, lineY + 1.4, x + width, lineY + 1.4);
  });

  return lineY + ROW_GAP;
}

function drawWrappedNote(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  doc.setFont(FONT, "bold");
  doc.setFontSize(FIELD_FONT_SIZE);
  doc.text(`${label}:`, x, y);

  doc.setFont(FONT, "normal");
  doc.setFontSize(FIELD_FONT_SIZE);
  const lines = doc.splitTextToSize(value.trim(), width) as string[];
  let lineY = y + 5;
  lines.forEach((line) => {
    doc.text(line, x, lineY);
    lineY += WRAP_LINE_GAP;
  });
  return lineY + 4;
}

function drawSignatureFooter(doc: jsPDF, x: number, y: number, totalWidth: number, height: number) {
  const colW = totalWidth / 2;
  const titles = ["ISSUED BY", "RECEIVED BY"];
  const subtitles = ["Warehouse / issuer", "Destination / recipient"];

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(x, y, totalWidth, height);
  doc.line(x + colW, y, x + colW, y + height);

  doc.setFont(FONT, "bold");
  doc.setFontSize(8.5);
  titles.forEach((title, i) => {
    const cx = x + colW * i + colW / 2;
    doc.text(title, cx, y + 5, { align: "center" });
    doc.text(subtitles[i], cx, y + 9, { align: "center" });
  });
}

function drawProductTable(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  receipt: TransferReceipt,
): number {
  const rowH = 8;
  const headerH = 9;
  const colWidths = [width * 0.18, width * 0.42, width * 0.2, width * 0.2];
  const headers = ["SKU", "Product", "Qty issued", "Balance after"];
  const values = [
    receipt.productSku,
    receipt.productName,
    formatQuantity(receipt.quantity),
    formatQuantity(receipt.balanceAfter),
  ];

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, headerH + rowH);

  let colX = x;
  headers.forEach((header, idx) => {
    doc.setFont(FONT, "bold");
    doc.setFontSize(9);
    doc.text(header, colX + 2, y + 6);
    if (idx < headers.length - 1) {
      doc.line(colX + colWidths[idx], y, colX + colWidths[idx], y + headerH + rowH);
    }
    colX += colWidths[idx];
  });

  doc.line(x, y + headerH, x + width, y + headerH);

  colX = x;
  values.forEach((value, idx) => {
    doc.setFont(FONT, "normal");
    const size = fitFontSize(doc, value, colWidths[idx] - 4, 10, 7);
    doc.setFontSize(size);
    doc.text(value, colX + 2, y + headerH + 5.5);
    colX += colWidths[idx];
  });

  return y + headerH + rowH + 8;
}

export function downloadTransferReceiptPdf(receipt: TransferReceipt): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const borderInset = 10;
  const pad = 8;
  const innerX = borderInset;
  const innerY = borderInset;
  const innerW = pageW - borderInset * 2;
  const innerH = pageH - borderInset * 2;
  const contentX = innerX + pad;
  const contentRight = innerX + innerW - pad;
  const contentW = contentRight - contentX;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(innerX, innerY, innerW, innerH);

  const title = "STOCK TRANSFER RECEIPT";
  doc.setFont(FONT, "bold");
  doc.setFontSize(14);
  const titleY = innerY + pad + 8;
  doc.text(title, pageW / 2, titleY, { align: "center" });
  const titleW = doc.getTextWidth(title);
  doc.setLineWidth(0.3);
  doc.line(pageW / 2 - titleW / 2, titleY + 1.5, pageW / 2 + titleW / 2, titleY + 1.5);

  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(appInfo.title, pageW / 2, titleY + 7, { align: "center" });

  const receiptNo = formatReceiptNumber(receipt.issuedAt);
  let y = titleY + 16;

  y = drawFieldRow(doc, "Receipt No.", receiptNo, contentX, y, contentW);
  y = drawFieldRow(doc, "Date & time", formatReceiptDate(receipt.issuedAt), contentX, y, contentW);
  y = drawFieldRow(doc, "Issued by", receipt.issuedBy, contentX, y, contentW);
  y = drawFieldRow(
    doc,
    "Movement",
    movementTypeLabel(receipt.movementType),
    contentX,
    y,
    contentW,
  );
  y = drawFieldRow(doc, "From", receipt.source, contentX, y, contentW);
  y = drawFieldRow(doc, "To", receipt.destination, contentX, y, contentW);

  y += 2;
  doc.setFont(FONT, "bold");
  doc.setFontSize(FIELD_FONT_SIZE);
  doc.text("Items transferred", contentX, y);
  y += 6;
  y = drawProductTable(doc, contentX, y, contentW, receipt);

  if (receipt.note?.trim()) {
    y = drawWrappedNote(doc, "Note", receipt.note, contentX, y, contentW);
  }

  const sigHeight = 30;
  const sigY = innerY + innerH - pad - sigHeight;
  drawSignatureFooter(doc, contentX, sigY, contentW, sigHeight);

  const safeSku = receipt.productSku.replace(/[^a-z0-9-_]/gi, "_").slice(0, 32);
  const safeNo = receiptNo.replace(/[^a-z0-9-_]/gi, "_");
  doc.save(`TransferReceipt_${safeSku}_${safeNo}.pdf`);
}

const OUTBOUND_MOVEMENT_TYPES = new Set(["OUT", "SCRAP", "LOSS"]);

export type MovementHistoryRow = {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  user?: { displayName: string; email: string };
};

export function canReprintTransferReceipt(movementType: string): boolean {
  return OUTBOUND_MOVEMENT_TYPES.has(movementType);
}

export function parseDestinationFromMovementNote(
  note: string | null,
  movementType: string,
): string {
  if (!note?.trim()) {
    return canReprintTransferReceipt(movementType)
      ? "General issue / external"
      : "—";
  }
  const text = note.trim();
  if (text.startsWith("Personnel bin ·")) {
    const rest = text.slice("Personnel bin ·".length);
    const name = rest.split(" · ")[0]?.trim();
    return name ? `Personal bin — ${name}` : "Personal bin";
  }
  if (text.startsWith("Site bin ·")) {
    const rest = text.slice("Site bin ·".length);
    const label = rest.split(" · ")[0]?.trim();
    return label ? `Site bin — ${label}` : "Site bin";
  }
  return text;
}

export function buildTransferReceiptFromMovement(
  movement: MovementHistoryRow,
  product: { sku: string; name: string },
): TransferReceipt | null {
  if (!canReprintTransferReceipt(movement.type)) {
    return null;
  }
  return {
    movementId: movement.id,
    movementType: movement.type,
    quantity: movement.quantity,
    balanceAfter: movement.balanceAfter,
    issuedAt: movement.createdAt,
    note: movement.note,
    productSku: product.sku,
    productName: product.name,
    issuedBy: movement.user?.displayName?.trim() || movement.user?.email || "—",
    source: "Warehouse",
    destination: parseDestinationFromMovementNote(movement.note, movement.type),
  };
}

export function reprintTransferReceiptFromMovement(
  movement: MovementHistoryRow,
  product: { sku: string; name: string },
): boolean {
  const receipt = buildTransferReceiptFromMovement(movement, product);
  if (!receipt) {
    return false;
  }
  downloadTransferReceiptPdf(receipt);
  return true;
}

export function maybeDownloadTransferReceipt(
  payload: { transferReceipt?: TransferReceipt | null } | null | undefined,
): void {
  if (payload?.transferReceipt) {
    downloadTransferReceiptPdf(payload.transferReceipt);
  }
}
