import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportData } from "../types";

const pdfText = (value: string) => value.replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?");

export async function renderReportExport(report: ReportData, format: "pdf" | "xlsx") {
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ConstructStock";
    const sheet = workbook.addWorksheet(report.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(report.columns);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF144227" } };
    for (const row of report.rows) sheet.addRow(row);
    sheet.columns.forEach((column) => { column.width = 22; });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, report.rows.length + 1), column: report.columns.length } };
    const bytes = await workbook.xlsx.writeBuffer();
    return { bytes: new Uint8Array(bytes), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  }

  if (report.rows.length > 500) throw new Error("PDF exports are limited to 500 rows. Narrow the report filters.");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 841.89, pageHeight = 595.28, margin = 32, rowHeight = 23;
  const columnWidth = (pageWidth - margin * 2) / report.columns.length;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const drawHeader = () => {
    page.drawText(pdfText(report.title), { x: margin, y, size: 18, font: bold, color: rgb(0.08, 0.26, 0.15) });
    y -= 20;
    page.drawText(`${report.filters.from} to ${report.filters.to} UTC | ${report.totalRows} rows`, { x: margin, y, size: 9, font });
    y -= 27;
    page.drawRectangle({ x: margin, y: y - 5, width: pageWidth - margin * 2, height: rowHeight, color: rgb(0.08, 0.26, 0.15) });
    report.columns.forEach((column, index) => page.drawText(pdfText(column).slice(0, Math.max(6, Math.floor(columnWidth / 5.3))), { x: margin + index * columnWidth + 3, y: y + 3, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= rowHeight;
  };
  drawHeader();
  for (const [rowIndex, row] of report.rows.entries()) {
    if (y < margin + rowHeight) { page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin; drawHeader(); }
    if (rowIndex % 2 === 0) page.drawRectangle({ x: margin, y: y - 5, width: pageWidth - margin * 2, height: rowHeight, color: rgb(0.96, 0.95, 0.97) });
    row.forEach((cell, index) => page.drawText(pdfText(cell).slice(0, Math.max(6, Math.floor(columnWidth / 4.8))), { x: margin + index * columnWidth + 3, y: y + 3, size: 8, font, color: rgb(0.12, 0.12, 0.13) }));
    y -= rowHeight;
  }
  const bytes = await pdf.save();
  return { bytes, contentType: "application/pdf", extension: "pdf" };
}
