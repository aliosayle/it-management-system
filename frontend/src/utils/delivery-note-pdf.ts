import jsPDF from "jspdf";

export type DeliveryNoteLine = {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type DeliveryNote = {
  id: string;
  issuedAt: string | Date;
  issuedBy: string;
  destination: string;
  notes: string | null;
  grandTotal: number;
  lines: DeliveryNoteLine[];
};

const FONT = "helvetica";
const FIELD_FONT_SIZE = 10;
const ROW_GAP = 10;
const WRAP_LINE_GAP = 5;
const HEADER_TITLE = "IT DEPARTMENT";

function formatReceiptDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value);
  }
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReceiptNumber(issuedAt: string | Date): string {
  const d = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  if (Number.isNaN(d.getTime())) {
    return "BL-INCONNU";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `BL-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
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
  const labelText = `${label} :`;
  doc.setFont(FONT, "bold");
  doc.setFontSize(FIELD_FONT_SIZE);
  doc.text(labelText, x, y);

  const valueX = x + doc.getTextWidth(labelText) + 2;
  const maxW = Math.max(12, x + width - valueX);
  doc.setFont(FONT, "normal");

  const lines = (value.trim() ? doc.splitTextToSize(value.trim(), maxW) : [""]) as string[];
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
  doc.text(`${label} :`, x, y);

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
  const titles = ["ÉMIS PAR", "REÇU PAR"];
  const subtitles = ["Dépôt / émetteur", "Destination / destinataire"];

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

function noteShowsPrices(note: DeliveryNote): boolean {
  if (note.lines.length === 0) {
    return false;
  }
  return note.lines.some((l) => l.unitPrice !== 0 || l.lineTotal !== 0);
}

function drawLinesTable(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  lines: DeliveryNoteLine[],
  grandTotal: number,
  showPrices: boolean,
): number {
  const rowH = 8;
  const headerH = 9;

  if (!showPrices) {
    const colWidths = [width * 0.22, width * 0.58, width * 0.2];
    const headers = ["Réf.", "Désignation", "Qté"];
    const tableH = headerH + rowH * lines.length;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(x, y, width, tableH);

    let colX = x;
    headers.forEach((header, idx) => {
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.text(header, colX + 2, y + 6);
      if (idx < headers.length - 1) {
        doc.line(colX + colWidths[idx], y, colX + colWidths[idx], y + tableH);
      }
      colX += colWidths[idx];
    });

    doc.line(x, y + headerH, x + width, y + headerH);

    let rowY = y + headerH;
    lines.forEach((line) => {
      const values = [line.sku, line.productName, formatQuantity(line.quantity)];
      colX = x;
      values.forEach((value, idx) => {
        doc.setFont(FONT, "normal");
        const size = fitFontSize(doc, value, colWidths[idx] - 4, 9, 6);
        doc.setFontSize(size);
        if (idx === 2) {
          doc.text(value, colX + colWidths[idx] - 2, rowY + 5.5, { align: "right" });
        } else {
          doc.text(value, colX + 2, rowY + 5.5);
        }
        colX += colWidths[idx];
      });
      doc.line(x, rowY + rowH, x + width, rowY + rowH);
      rowY += rowH;
    });

    return y + tableH + 8;
  }

  const colWidths = [width * 0.14, width * 0.36, width * 0.14, width * 0.18, width * 0.18];
  const headers = ["Réf.", "Désignation", "Qté", "P.U.", "Montant"];

  const tableH = headerH + rowH * lines.length + rowH + 4;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, tableH);

  let colX = x;
  headers.forEach((header, idx) => {
    doc.setFont(FONT, "bold");
    doc.setFontSize(9);
    doc.text(header, colX + 2, y + 6);
    if (idx < headers.length - 1) {
      doc.line(colX + colWidths[idx], y, colX + colWidths[idx], y + tableH);
    }
    colX += colWidths[idx];
  });

  doc.line(x, y + headerH, x + width, y + headerH);

  let rowY = y + headerH;
  lines.forEach((line) => {
    const values = [
      line.sku,
      line.productName,
      formatQuantity(line.quantity),
      formatMoney(line.unitPrice),
      formatMoney(line.lineTotal),
    ];
    colX = x;
    values.forEach((value, idx) => {
      doc.setFont(FONT, "normal");
      const size = fitFontSize(doc, value, colWidths[idx] - 4, 9, 6);
      doc.setFontSize(size);
      const alignRight = idx >= 2;
      if (alignRight) {
        doc.text(value, colX + colWidths[idx] - 2, rowY + 5.5, { align: "right" });
      } else {
        doc.text(value, colX + 2, rowY + 5.5);
      }
      colX += colWidths[idx];
    });
    doc.line(x, rowY + rowH, x + width, rowY + rowH);
    rowY += rowH;
  });

  const totalY = rowY;
  doc.setFont(FONT, "bold");
  doc.setFontSize(10);
  doc.text("Total général", x + 2, totalY + 5.5);
  doc.text(formatMoney(grandTotal), x + width - 2, totalY + 5.5, { align: "right" });

  return y + tableH + 8;
}

export function deliveryNoteFromDetail(detail: {
  id: string;
  createdAt: string;
  destinationSummary: string;
  notes: string | null;
  grandTotal: number;
  createdBy: { displayName: string; email: string };
  lines: Array<{
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}): DeliveryNote {
  return {
    id: detail.id,
    issuedAt: detail.createdAt,
    issuedBy: detail.createdBy.displayName?.trim() || detail.createdBy.email || "—",
    destination: detail.destinationSummary,
    notes: detail.notes,
    grandTotal: detail.grandTotal,
    lines: detail.lines.map((l) => ({
      sku: l.sku,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}

export function downloadDeliveryNotePdf(note: DeliveryNote): void {
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

  const title = "BON DE LIVRAISON";
  doc.setFont(FONT, "bold");
  doc.setFontSize(14);
  const titleY = innerY + pad + 8;
  doc.text(title, pageW / 2, titleY, { align: "center" });
  const titleW = doc.getTextWidth(title);
  doc.setLineWidth(0.3);
  doc.line(pageW / 2 - titleW / 2, titleY + 1.5, pageW / 2 + titleW / 2, titleY + 1.5);

  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(HEADER_TITLE, pageW / 2, titleY + 7, { align: "center" });

  const receiptNo = formatReceiptNumber(note.issuedAt);
  let y = titleY + 16;

  y = drawFieldRow(doc, "N° bon", receiptNo, contentX, y, contentW);
  y = drawFieldRow(doc, "Date et heure", formatReceiptDate(note.issuedAt), contentX, y, contentW);
  y = drawFieldRow(doc, "Émis par", note.issuedBy, contentX, y, contentW);
  y = drawFieldRow(doc, "Destination", note.destination, contentX, y, contentW);

  y += 2;
  doc.setFont(FONT, "bold");
  doc.setFontSize(FIELD_FONT_SIZE);
  doc.text("Articles livrés", contentX, y);
  y += 6;
  const showPrices = noteShowsPrices(note);
  y = drawLinesTable(doc, contentX, y, contentW, note.lines, note.grandTotal, showPrices);

  if (note.notes?.trim()) {
    y = drawWrappedNote(doc, "Remarques", note.notes, contentX, y, contentW);
  }

  const sigHeight = 30;
  const sigY = innerY + innerH - pad - sigHeight;
  drawSignatureFooter(doc, contentX, sigY, contentW, sigHeight);

  const safeNo = receiptNo.replace(/[^a-z0-9-_]/gi, "_");
  doc.save(`BonLivraison_${safeNo}.pdf`);
}
