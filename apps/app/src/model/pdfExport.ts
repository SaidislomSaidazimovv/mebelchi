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
  drawings?: string[];
  drills?: string[];
  passports?: string[];
  noTitle?: boolean;
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

function drawTitle(doc: jsPDF, input: PdfExportInput, pw: number, ph: number): void {
  const cy = ph / 2;
  doc.setFontSize(46);
  doc.text(input.title, pw / 2, cy - 22, { align: "center" });
  doc.setFontSize(22);
  doc.text(input.project, pw / 2, cy, { align: "center" });
  doc.setFontSize(12);
  doc.text(input.date, pw / 2, cy + 14, { align: "center" });
  if (input.partsCount != null) {
    doc.text(`Деталей: ${input.partsCount}`, pw / 2, cy + 22, { align: "center" });
  }
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
    doc.setFontSize(8);
    spec.columns.forEach((c, i) => doc.text(c, margin + i * colW + 1, y0 + 8));
    doc.setDrawColor(20);
    doc.line(margin, y0 + 10, pw - margin, y0 + 10);
    return y0 + 15;
  };
  let y = header(margin + 8);
  for (const row of spec.rows) {
    if (y > ph - margin) {
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
    doc.setFontSize(9);
    doc.text("Наименование", margin, y0 + 8);
    doc.text("Кол-во", margin + 160, y0 + 8);
    doc.setDrawColor(20);
    doc.line(margin, y0 + 10, pw - margin, y0 + 10);
    return y0 + 16;
  };
  let y = header(margin + 8);
  for (const h of hardware) {
    if (y > ph - margin) {
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
    doc.setFontSize(9);
    doc.text("Код", margin, y0 + 8);
    doc.text("Наименование", nameX, y0 + 8);
    doc.setDrawColor(20);
    doc.line(margin, y0 + 10, pw - margin, y0 + 10);
    return y0 + 16;
  };
  let y = header(margin + 8);
  for (const m of materials) {
    if (y > ph - margin) {
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

async function addSvgPage(doc: jsPDF, holder: HTMLDivElement, svg: string, pw: number, ph: number, newPage = true): Promise<void> {
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
  let w = pw;
  let h = pw / ratio;
  if (h > ph) {
    h = ph;
    w = ph * ratio;
  }
  if (w >= pw * 0.3) {
    if (newPage) doc.addPage();
    await svg2pdf(el, doc, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    return;
  }
  const fw = pw;
  const fh = pw / ratio;
  const npages = Math.ceil(fh / ph);
  for (let i = 0; i < npages; i++) {
    if (newPage || i > 0) doc.addPage();
    await svg2pdf(el, doc, { x: 0, y: -i * ph, width: fw, height: fh });
  }
}

async function addSvgCell(doc: jsPDF, holder: HTMLDivElement, svg: string, x: number, y: number, cw: number, ch: number): Promise<void> {
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
  const aw = vb && vb.width ? vb.width : cw;
  const ah = vb && vb.height ? vb.height : ch;
  const ratio = aw / ah;
  let w = cw;
  let h = cw / ratio;
  if (h > ch) {
    h = ch;
    w = ch * ratio;
  }
  await svg2pdf(el, doc, { x: x + (cw - w) / 2, y: y + (ch - h) / 2, width: w, height: h });
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
    drawTitle(doc, input, pw, ph);
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
    for (const svg of input.svgs) {
      await addSvgPage(doc, holder, svg, pw, ph, !firstFree);
      firstFree = false;
    }
  } finally {
    document.body.removeChild(holder);
  }

  return doc;
}

export async function exportDrawingsPdf(input: PdfExportInput): Promise<void> {
  const doc = await buildDrawingsPdf(input);
  await deliver(doc, input.fileName);
}

export async function buildCompactPdf(input: PdfExportInput): Promise<jsPDF> {
  const fontBase64 = await loadFontBase64();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto", "normal");

  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  let firstFree = true;
  const page = (): void => {
    if (!firstFree) doc.addPage();
    firstFree = false;
  };
  const tag = (name: string): void => {
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(name, pw - 8, 8, { align: "right" });
    doc.setTextColor(20);
  };

  const holder = document.createElement("div");
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none");
  document.body.appendChild(holder);

  const grid = async (items: string[], head: string): Promise<void> => {
    const gm = 6;
    const top = 18;
    const cw = (pw - gm * 3) / 2;
    const ch = (ph - top - gm * 2) / 2;
    const cells: [number, number][] = [[gm, top], [gm * 2 + cw, top], [gm, top + gm + ch], [gm * 2 + cw, top + gm + ch]];
    for (let i = 0; i < items.length; i += 4) {
      page();
      doc.setFontSize(16);
      doc.text(head, 8, 13);
      for (let j = 0; j < 4; j++) {
        const c = cells[j];
        const d = items[i + j];
        if (c && d) await addSvgCell(doc, holder, d, c[0], c[1], cw, ch);
      }
      tag(head);
    }
  };

  try {
    const drawings = input.drawings ?? [];
    if (drawings.length) await grid(drawings.slice(0, 4), "Чертежи");
    if (input.spec && input.spec.rows.length) {
      page();
      drawSpec(doc, input.spec, pw, ph);
      tag("Спецификация");
    }
    if (input.hardware && input.hardware.length) {
      page();
      drawHardware(doc, input.hardware, pw, ph);
      tag("Фурнитура");
    }
    if (input.materials && input.materials.length) {
      page();
      drawMaterials(doc, input.materials, pw, ph);
      tag("Материалы");
    }
    const drills = input.drills ?? [];
    if (drills.length) await grid(drills, "Сверловка");
    const passports = input.passports ?? [];
    for (const p of passports) {
      page();
      await addSvgPage(doc, holder, p, pw, ph, false);
    }
    for (const svg of input.svgs) {
      page();
      await addSvgPage(doc, holder, svg, pw, ph, false);
    }
  } finally {
    document.body.removeChild(holder);
  }

  return doc;
}

export async function exportCompactPdf(input: PdfExportInput): Promise<void> {
  const doc = await buildCompactPdf(input);
  await deliver(doc, input.fileName);
}
