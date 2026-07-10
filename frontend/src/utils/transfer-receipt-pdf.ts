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

function drawUnderlinedField(
  doc: jsPDF,
  label: string,
  value: string,
  labelX: number,
  baselineY: number,
  valueX: number,
  lineEndX: number,
) {
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.text(label, labelX, baselineY);

  doc.setFont(FONT, "normal");
  if (value) {
    const size = fitFontSize(doc, value, lineEndX - valueX - 1, 11);
    doc.setFontSize(size);
    doc.text(value, valueX, baselineY, { baseline: "alphabetic" });
    doc.setFontSize(11);
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(valueX, baselineY + 1.4, lineEndX, baselineY + 1.4);
}

function drawWrappedField(
  doc: jsPDF,
  label: string,
  value: string,
  labelX: number,
  baselineY: number,
  valueX: number,
  lineEndX: number,
  lineGap: number,
): number {
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.text(label, labelX, baselineY);

  doc.setFont(FONT, "normal");
  doc.setFontSize(11);

  const firstLineWidth = lineEndX - valueX - 1;
  const restLineWidth = lineEndX - labelX - 1;
  let currentY = baselineY;

  if (!value) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(valueX, currentY + 1.4, lineEndX, currentY + 1.4);
    return currentY;
  }

  const firstLine = doc.splitTextToSize(value, firstLineWidth)[0] ?? "";
  const remainder = value.slice(firstLine.length).trimStart();
  const restLines = remainder ? doc.splitTextToSize(remainder, restLineWidth) : [];
  const allLines = [firstLine, ...restLines];

  allLines.forEach((line, idx) => {
    const startX = idx === 0 ? valueX : labelX;
    doc.text(line, startX, currentY);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(startX, currentY + 1.4, lineEndX, currentY + 1.4);
    if (idx < allLines.length - 1) {
      currentY += lineGap;
    }
  });

  return currentY;
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
  const titleY = innerY + pad + 6;
  doc.text(title, pageW / 2, titleY, { align: "center" });
  const titleW = doc.getTextWidth(title);
  doc.setLineWidth(0.3);
  doc.line(pageW / 2 - titleW / 2, titleY + 1.5, pageW / 2 + titleW / 2, titleY + 1.5);

  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(appInfo.title, pageW / 2, titleY + 5.5, { align: "center" });

  const leftColEnd = contentX + contentW * 0.55;
  const rightColStart = contentX + contentW * 0.58;
  const rightColEnd = contentRight;

  let y = titleY + 14;

  const receiptNoLabelW = doc.getTextWidth("Receipt No. ");
  drawUnderlinedField(
    doc,
    "Receipt No.",
    receipt.movementId,
    contentX,
    y,
    contentX + receiptNoLabelW,
    leftColEnd,
  );

  const dateLabel = "Date & time: ";
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.text(dateLabel, rightColStart, y);
  const dateValueX = rightColStart + doc.getTextWidth(dateLabel);
  doc.setFont(FONT, "normal");
  doc.text(formatReceiptDate(receipt.issuedAt), dateValueX, y);
  doc.setLineWidth(0.25);
  doc.line(dateValueX, y + 1.4, rightColEnd, y + 1.4);

  y += 11;

  const issuedByLabelW = doc.getTextWidth("Issued by: ");
  drawUnderlinedField(
    doc,
    "Issued by:",
    receipt.issuedBy,
    contentX,
    y,
    contentX + issuedByLabelW,
    leftColEnd,
  );

  const typeLabel = "Movement: ";
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.text(typeLabel, rightColStart, y);
  const typeValueX = rightColStart + doc.getTextWidth(typeLabel);
  doc.setFont(FONT, "normal");
  const movementLabel = movementTypeLabel(receipt.movementType);
  doc.text(movementLabel, typeValueX, y);
  doc.setLineWidth(0.25);
  doc.line(typeValueX, y + 1.4, rightColEnd, y + 1.4);

  y += 11;

  const sourceLabelW = doc.getTextWidth("From: ");
  drawUnderlinedField(
    doc,
    "From:",
    receipt.source,
    contentX,
    y,
    contentX + sourceLabelW,
    contentRight,
  );
  y += 11;

  const destLabelW = doc.getTextWidth("To: ");
  drawUnderlinedField(
    doc,
    "To:",
    receipt.destination,
    contentX,
    y,
    contentX + destLabelW,
    contentRight,
  );
  y += 13;

  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.text("Items transferred", contentX, y);
  y += 5;
  y = drawProductTable(doc, contentX, y, contentW, receipt);

  if (receipt.note?.trim()) {
    const noteLabelW = doc.getTextWidth("Note: ") + 1;
    y = drawWrappedField(
      doc,
      "Note:",
      receipt.note.trim(),
      contentX,
      y,
      contentX + noteLabelW,
      contentRight,
      6,
    );
    y += 8;
  }

  const sigHeight = 30;
  const sigY = innerY + innerH - pad - sigHeight;
  drawSignatureFooter(doc, contentX, sigY, contentW, sigHeight);

  const safeId = receipt.movementId.replace(/[^a-z0-9-_]/gi, "_").slice(0, 24);
  const safeSku = receipt.productSku.replace(/[^a-z0-9-_]/gi, "_").slice(0, 24);
  doc.save(`TransferReceipt_${safeSku}_${safeId}.pdf`);
}

export function maybeDownloadTransferReceipt(
  payload: { transferReceipt?: TransferReceipt | null } | null | undefined,
): void {
  if (payload?.transferReceipt) {
    downloadTransferReceiptPdf(payload.transferReceipt);
  }
}
