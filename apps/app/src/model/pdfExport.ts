import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export interface PdfSpec {
  columns: string[];
  rows: string[][];
}

export interface PdfExportInput {
  fileName: string;
  title: string;
  project: string;
  date: string;
  partsCount?: number;
  spec?: PdfSpec;
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

function drawSpec(doc: jsPDF, spec: PdfSpec, pw: number, ph: number): void {
  const margin = 12;
  const tableW = pw - margin * 2;
  const colW = tableW / spec.columns.length;
  let y = margin + 8;
  doc.setFontSize(15);
  doc.text("Spetsifikatsiya", margin, y);
  y += 8;
  doc.setFontSize(8);
  spec.columns.forEach((c, i) => doc.text(c, margin + i * colW + 1, y));
  y += 2;
  doc.setDrawColor(20);
  doc.line(margin, y, pw - margin, y);
  y += 4;
  for (const row of spec.rows) {
    if (y > ph - margin) {
      doc.addPage();
      y = margin + 8;
    }
    row.forEach((cell, i) => doc.text(cell, margin + i * colW + 1, y));
    y += 5;
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
