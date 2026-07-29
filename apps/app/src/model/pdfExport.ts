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
  materials?: { name: string; code: string }[];
  svgs: string[];
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
    doc.text(`Detallar: ${input.partsCount}`, pw / 2, cy + 22, { align: "center" });
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

function drawSpec(doc: jsPDF, spec: PdfSpec, pw: number, ph: number): void {
  const margin = 12;
  const tableW = pw - margin * 2;
  const colW = tableW / spec.columns.length;
  const last = spec.columns.length - 1;
  let y = margin + 8;
  doc.setFontSize(15);
  doc.text("Spetsifikatsiya", margin, y);
  y += 8;
  doc.setFontSize(8);
  spec.columns.forEach((c, i) => doc.text(c, margin + i * colW + 1, y));
  y += 2;
  doc.setDrawColor(20);
  doc.line(margin, y, pw - margin, y);
  y += 5;
  for (const row of spec.rows) {
    if (y > ph - margin) {
      doc.addPage();
      y = margin + 8;
    }
    doc.setFontSize(8);
    row.cells.forEach((cell, i) => {
      if (i === last && row.bands) return;
      doc.text(cell, margin + i * colW + 1, y);
    });
    if (row.bands) {
      const kx = margin + last * colW + 1;
      drawKantenbild(doc, kx, y - 3, 4, 3, row.bands);
      if (row.edgeName) {
        doc.setFontSize(6);
        doc.text(row.edgeName, kx + 5.5, y - 0.5);
        doc.setFontSize(8);
      }
    }
    y += 6.5;
  }
}

function drawHardware(doc: jsPDF, hardware: { name: string; qty: number }[], pw: number, ph: number): void {
  const margin = 12;
  let y = margin + 8;
  doc.setFontSize(15);
  doc.text("Furnitura", margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.text("Nomi", margin, y);
  doc.text("Soni", margin + 160, y);
  y += 2;
  doc.setDrawColor(20);
  doc.line(margin, y, pw - margin, y);
  y += 6;
  for (const h of hardware) {
    if (y > ph - margin) {
      doc.addPage();
      y = margin + 8;
    }
    doc.text(h.name, margin, y);
    doc.text(String(h.qty), margin + 160, y);
    y += 6;
  }
}

function drawMaterials(doc: jsPDF, materials: { name: string; code: string }[], pw: number, ph: number): void {
  const margin = 12;
  let y = margin + 8;
  doc.setFontSize(15);
  doc.text("Materiallar", margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.text("Nomi", margin, y);
  doc.text("Kod", margin + 160, y);
  y += 2;
  doc.setDrawColor(20);
  doc.line(margin, y, pw - margin, y);
  y += 6;
  for (const m of materials) {
    if (y > ph - margin) {
      doc.addPage();
      y = margin + 8;
    }
    doc.text(m.name, margin, y);
    doc.text(m.code, margin + 160, y);
    y += 6;
  }
}

async function addSvgPage(doc: jsPDF, holder: HTMLDivElement, svg: string, pw: number, ph: number): Promise<void> {
  holder.innerHTML = svg;
  const el = holder.querySelector("svg") as SVGSVGElement | null;
  if (!el) return;
  el.setAttribute("font-family", "Roboto");
  el.querySelectorAll("text").forEach((t) => t.setAttribute("font-family", "Roboto"));
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
  doc.addPage();
  await svg2pdf(el, doc, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
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

  drawTitle(doc, input, pw, ph);
  if (input.spec && input.spec.rows.length) {
    doc.addPage();
    drawSpec(doc, input.spec, pw, ph);
  }
  if (input.hardware && input.hardware.length) {
    doc.addPage();
    drawHardware(doc, input.hardware, pw, ph);
  }
  if (input.materials && input.materials.length) {
    doc.addPage();
    drawMaterials(doc, input.materials, pw, ph);
  }

  const holder = document.createElement("div");
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none");
  document.body.appendChild(holder);
  try {
    for (const svg of input.svgs) {
      await addSvgPage(doc, holder, svg, pw, ph);
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
