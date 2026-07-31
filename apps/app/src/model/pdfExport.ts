import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export interface PdfSpecRow {
  cells: string[];
  bands?: boolean[];
  edgeName?: string;
}

export interface PdfSpec {
  columns: string[];
  rows: PdfSpecRow[];
}

export interface PdfExportInput {
  fileName: string;
  title: string;
  project: string;
  date: string;
  partsCount?: number;
  spec?: PdfSpec;
  hardware?: { name: string; qty: number }[];
  materials?: { name: string; code: string; hex?: string }[];
  svgs: string[];
  noTitle?: boolean;
  render?: { url: string; w: number; h: number };
  summary?: { label: string; value: string }[];
  sections?: string[];
}

let fontPromise: Promise<string> | null = null;

function loadFontBase64(): Promise<string> {
  if (!fontPromise) {
    fontPromise = fetch("/fonts/Roboto-Regular.ttf")
      .then((r) => r.arrayBuffer())
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
      })
      .catch((error) => {
        fontPromise = null;
        throw error;
      });
  }
  return fontPromise;
}

const FRAME_M = 8;
const CONTENT_M = 20;
const ACCENT: [number, number, number] = [46, 158, 106];

function accentBar(doc: jsPDF, x: number, y: number, len = 16): void {
  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.setLineWidth(1);
  doc.line(x, y, x + len, y);
  doc.setDrawColor(20);
  doc.setLineWidth(0.2);
}

function pageFrame(doc: jsPDF, pw: number, ph: number): void {
  doc.setDrawColor(170);
  doc.setLineWidth(0.3);
  doc.rect(FRAME_M, FRAME_M, pw - FRAME_M * 2, ph - FRAME_M * 2);
  doc.setDrawColor(20);
  doc.setLineWidth(0.2);
}

function pageFooter(doc: jsPDF, input: PdfExportInput, pw: number, ph: number, pageNo: number, total: number): void {
  const fy = ph - 18;
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(CONTENT_M, fy, pw - CONTENT_M, fy);
  doc.setDrawColor(20);
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text("Mebelchi", CONTENT_M, fy + 6);
  doc.setFontSize(8);
  doc.text(`${pageNo} / ${total}`, pw - CONTENT_M, fy + 6, { align: "right" });
  doc.text(`Проект: ${input.project}   Дата: ${input.date}`, pw / 2, fy + 4, { align: "center" });
  doc.setFontSize(6.5);
  doc.setTextColor(120);
  doc.text("Все размеры в миллиметрах. Перед раскроем проверьте на замере.", pw / 2, fy + 8, { align: "center" });
  doc.setTextColor(0);
}

function paintChrome(doc: jsPDF, input: PdfExportInput, pw: number, ph: number): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    pageFrame(doc, pw, ph);
    pageFooter(doc, input, pw, ph, p, total);
  }
}

function drawCover(doc: jsPDF, input: PdfExportInput, pw: number, ph: number): void {
  doc.setTextColor(120);
  doc.setFontSize(11);
  doc.text("Чертежи", CONTENT_M, 30);
  doc.setTextColor(0);
  doc.setFontSize(40);
  doc.text(input.project, CONTENT_M, 50);
  accentBar(doc, CONTENT_M, 55, 26);
  doc.setTextColor(120);
  doc.setFontSize(11);
  doc.text(`Дата: ${input.date}`, CONTENT_M, 62);
  doc.setTextColor(0);
  const rows = input.summary ?? [];
  if (rows.length) {
    const tx = CONTENT_M;
    const tw = pw - CONTENT_M * 2;
    const rh = 12;
    const ty = 76;
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.rect(tx, ty, tw, rh * rows.length);
    doc.setFontSize(11);
    rows.forEach((row, i) => {
      const ry = ty + i * rh;
      if (i > 0) doc.line(tx, ry, tx + tw, ry);
      doc.text(row.label, tx + 5, ry + rh / 2 + 1.5);
      doc.text(row.value, tx + tw - 5, ry + rh / 2 + 1.5, { align: "right" });
    });
    doc.setDrawColor(20);
  }
}

function drawRenderPage(doc: jsPDF, render: { url: string; w: number; h: number }, pw: number, ph: number): void {
  doc.setTextColor(0);
  doc.setFontSize(15);
  doc.text("3D · Общий вид", CONTENT_M, 30);
  accentBar(doc, CONTENT_M, 34, 18);
  const top = 40;
  const bottom = ph - 26;
  const boxX = CONTENT_M;
  const boxW = pw - CONTENT_M * 2;
  const boxH = bottom - top;
  doc.setFillColor(247, 246, 243);
  doc.rect(boxX, top, boxW, boxH, "F");
  const a = render.w > 0 && render.h > 0 ? render.w / render.h : 1.5;
  let rw = boxW - 16;
  let rh = rw / a;
  if (rh > boxH - 16) {
    rh = boxH - 16;
    rw = rh * a;
  }
  const rx = (pw - rw) / 2;
  const ry = top + (boxH - rh) / 2;
  doc.addImage(render.url, "JPEG", rx, ry, rw, rh);
}

function drawKantenbild(doc: jsPDF, x: number, y: number, w: number, h: number, bands: readonly boolean[]): void {
  doc.setDrawColor(150);
  doc.setLineWidth(0.15);
  doc.rect(x, y, w, h);
  doc.setDrawColor(138, 109, 31);
  doc.setLineWidth(0.7);
  if (bands[0]) doc.line(x, y, x + w, y);
  if (bands[1]) doc.line(x, y + h, x + w, y + h);
  if (bands[2]) doc.line(x + w, y, x + w, y + h);
  if (bands[3]) doc.line(x, y, x, y + h);
  doc.setLineWidth(0.2);
  doc.setDrawColor(20);
}

function fitText(doc: jsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s;
  let t = s;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function drawSpec(doc: jsPDF, spec: PdfSpec, pw: number, ph: number): void {
  const margin = 12;
  const tableW = pw - margin * 2;
  const colW = tableW / spec.columns.length;
  const last = spec.columns.length - 1;
  const header = (y0: number): number => {
    doc.setFontSize(15);
    doc.text("Спецификация", margin, y0);
    accentBar(doc, margin, y0 + 3, 16);
    doc.setFontSize(8);
    spec.columns.forEach((c, i) => doc.text(c, margin + i * colW + 1, y0 + 8));
    doc.setDrawColor(20);
    doc.line(margin, y0 + 10, pw - margin, y0 + 10);
    return y0 + 15;
  };
  let y = header(margin + 8);
  for (const row of spec.rows) {
    if (y > ph - 26) {
      doc.addPage();
      y = header(margin + 8);
    }
    doc.setFontSize(8);
    row.cells.forEach((cell, i) => {
      if (i === last && row.bands) return;
      doc.text(fitText(doc, cell, colW - 2), margin + i * colW + 1, y);
    });
    if (row.bands) {
      const kx = margin + last * colW + 1;
      drawKantenbild(doc, kx, y - 3, 4, 3, row.bands);
      if (row.edgeName) {
        doc.setFontSize(6);
        doc.text(fitText(doc, row.edgeName, colW - 7), kx + 5.5, y - 0.5);
        doc.setFontSize(8);
      }
    }
    y += 6.5;
  }
}

function drawHardware(doc: jsPDF, hardware: { name: string; qty: number }[], pw: number, ph: number): void {
  const margin = 12;
  const nameW = 160 - margin - 4;
  const header = (y0: number): number => {
    doc.setFontSize(15);
    doc.text("Фурнитура", margin, y0);
    accentBar(doc, margin, y0 + 3, 16);
    doc.setFontSize(9);
    doc.text("Наименование", margin, y0 + 8);
    doc.text("Кол-во", margin + 160, y0 + 8);
    doc.setDrawColor(20);
    doc.line(margin, y0 + 10, pw - margin, y0 + 10);
    return y0 + 16;
  };
  let y = header(margin + 8);
  for (const h of hardware) {
    if (y > ph - 26) {
      doc.addPage();
      y = header(margin + 8);
    }
    doc.setFontSize(9);
    doc.text(fitText(doc, h.name, nameW), margin, y);
    doc.text(String(h.qty), margin + 160, y);
    y += 6;
  }
}

function drawMaterials(doc: jsPDF, materials: { name: string; code: string; hex?: string }[], pw: number, ph: number): void {
  const margin = 12;
  const swX = margin + 16;
  const nameX = margin + 26;
  const nameW = pw - nameX - margin;
  const header = (y0: number): number => {
    doc.setFontSize(15);
    doc.text("Материалы", margin, y0);
    accentBar(doc, margin, y0 + 3, 16);
    doc.setFontSize(9);
    doc.text("Код", margin, y0 + 8);
    doc.text("Наименование", nameX, y0 + 8);
    doc.setDrawColor(20);
    doc.line(margin, y0 + 10, pw - margin, y0 + 10);
    return y0 + 16;
  };
  let y = header(margin + 8);
  for (const m of materials) {
    if (y > ph - 26) {
      doc.addPage();
      y = header(margin + 8);
    }
    doc.setFontSize(9);
    doc.text(fitText(doc, m.code, 14), margin, y);
    if (m.hex && /^#[0-9a-fA-F]{6}$/.test(m.hex)) {
      const h = m.hex.slice(1);
      doc.setFillColor(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
      doc.setDrawColor(120);
      doc.rect(swX, y - 3.4, 5, 4.4, "FD");
      doc.setDrawColor(20);
    }
    doc.text(fitText(doc, m.name, nameW), nameX, y);
    y += 6;
  }
}

function drawSection(doc: jsPDF, text: string): void {
  if (!text) return;
  doc.setTextColor(0);
  doc.setFontSize(15);
  doc.text(text, CONTENT_M, 16);
  accentBar(doc, CONTENT_M, 19, 16);
}

async function addSvgPage(doc: jsPDF, holder: HTMLDivElement, svg: string, pw: number, ph: number, newPage = true, section = ""): Promise<void> {
  holder.innerHTML = svg;
  const el = holder.querySelector("svg") as SVGSVGElement | null;
  if (!el) return;
  el.setAttribute("font-family", "Roboto");
  el.querySelectorAll("text").forEach((t) => {
    t.setAttribute("font-family", "Roboto");
    t.removeAttribute("font-weight");
    t.style.removeProperty("font-weight");
  });
  const vb = el.viewBox.baseVal;
  const aw = vb && vb.width ? vb.width : el.clientWidth || pw;
  const ah = vb && vb.height ? vb.height : el.clientHeight || ph;
  const ratio = aw / ah;
  const cx = 12;
  const ctop = 22;
  const cbot = ph - 22;
  const bw = pw - cx * 2;
  const bh = cbot - ctop;
  let w = bw;
  let h = bw / ratio;
  if (h > bh) {
    h = bh;
    w = bh * ratio;
  }
  if (w >= bw * 0.3) {
    if (newPage) doc.addPage();
    drawSection(doc, section);
    await svg2pdf(el, doc, { x: cx + (bw - w) / 2, y: ctop, width: w, height: h });
    return;
  }
  const fw = bw;
  const fh = bw / ratio;
  const npages = Math.ceil(fh / bh);
  for (let i = 0; i < npages; i++) {
    if (newPage || i > 0) doc.addPage();
    drawSection(doc, section);
    await svg2pdf(el, doc, { x: cx, y: ctop - i * bh, width: fw, height: fh });
  }
}

async function deliver(doc: jsPDF, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const uri = doc.output("datauristring");
    const base64 = uri.substring(uri.indexOf(",") + 1);
    const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: fileName, url: written.uri });
    return;
  }
  doc.save(fileName);
}

export async function buildDrawingsPdf(input: PdfExportInput): Promise<jsPDF> {
  const fontBase64 = await loadFontBase64();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto", "normal");

  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  let firstFree = true;
  if (!input.noTitle) {
    drawCover(doc, input, pw, ph);
    firstFree = false;
  }
  if (input.render) {
    if (!firstFree) doc.addPage();
    drawRenderPage(doc, input.render, pw, ph);
    firstFree = false;
  }
  if (input.spec && input.spec.rows.length) {
    doc.addPage();
    drawSpec(doc, input.spec, pw, ph);
    firstFree = false;
  }
  if (input.hardware && input.hardware.length) {
    doc.addPage();
    drawHardware(doc, input.hardware, pw, ph);
    firstFree = false;
  }
  if (input.materials && input.materials.length) {
    doc.addPage();
    drawMaterials(doc, input.materials, pw, ph);
    firstFree = false;
  }

  const holder = document.createElement("div");
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none");
  document.body.appendChild(holder);
  try {
    for (let i = 0; i < input.svgs.length; i++) {
      const svg = input.svgs[i];
      if (svg == null) continue;
      await addSvgPage(doc, holder, svg, pw, ph, !firstFree, input.sections?.[i] ?? "");
      firstFree = false;
    }
  } finally {
    document.body.removeChild(holder);
  }

  paintChrome(doc, input, pw, ph);

  return doc;
}

export async function exportDrawingsPdf(input: PdfExportInput): Promise<void> {
  const doc = await buildDrawingsPdf(input);
  await deliver(doc, input.fileName);
}
