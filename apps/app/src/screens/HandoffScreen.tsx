// Phase Е — "Передача / Готово к станку": the factory handoff. Shows architectural
// drawings (FacePlan + TopPlan, IKEA-style) + the real production package (cut list +
// hardware) derived from the run, with PNG / CSV downloads. DXF / SWJ008 / native share
// are the next phases.

import { useCallback, useMemo, useRef, useState } from "react";
import { useStore, HW_GRADE_LABEL } from "../store";
import { useT } from "../i18n/useT";
import { production, productionCSV } from "../model/cncExport";
import { panelsDXF } from "../model/dxfExport";
import { blockCutList } from "../three/estimate";
import { machiningReport, runSWJ008 } from "../model/machining";
import { DrawingSheet } from "../components/DrawingSheet";
import { TopPlanSheet } from "../components/TopPlanSheet";
import { WorktopSheet } from "../components/WorktopSheet";
import { DrillSheet } from "../components/DrillSheet";
import { VariantScene, type SceneApi } from "../three/VariantScene";
import { FLOOR_COVERINGS } from "../model/floors";
import type { Cabinet } from "../model/cabinet";

export function HandoffScreen() {
  const t = useT();
  const cabs = useStore((s) => s.cabs);
  const projectBlocks = useStore((s) => s.projectBlocks);
  const ceiling = useStore((s) => s.ceiling);
  const roomName = useStore((s) => s.roomName);
  const points = useStore((s) => s.roomPoints);
  const openings = useStore((s) => s.openings);
  const waterWall = useStore((s) => s.waterWall);
  const layout = useStore((s) => s.runLayout);
  const interiorWalls = useStore((s) => s.interiorWalls);
  const fittings = useStore((s) => s.fittings);
  const wallSurfaces = useStore((s) => s.wallSurfaces);
  const style = useStore((s) => s.runStyle);
  const floorCovering = useStore((s) => s.floorCovering);
  const hwGrade = useStore((s) => s.hwGrade);
  const hardened = useStore((s) => s.hardened);
  const settings = useStore((s) => s.settings);
  const flash = useStore((s) => s.flash);
  const gradeLabel = HW_GRADE_LABEL[hwGrade];
  const fromLine = [settings.company, settings.name, settings.phone].filter(Boolean).join(" · ");
  const project = roomName || "Кухня";
  const coveringColor = FLOOR_COVERINGS[floorCovering]?.color ?? "#ecd9b4";
  const sceneApi = useRef<SceneApi | null>(null);
  const onApi = useCallback((api: SceneApi | null) => { sceneApi.current = api; }, []);

  const [allPanels, setAllPanels] = useState(false);
  const [allHw, setAllHw] = useState(false);
  const PREVIEW = 4;
  const prod = useMemo(() => production(cabs), [cabs]);
  // placed karkas blocks — their cut list joins the factory package (D2)
  const blockRows = useMemo(() => projectBlocks.map((b) => ({ name: b.name, rows: blockCutList(b.karkasJson) })).filter((b) => b.rows.length > 0), [projectBlocks]);
  const blockPanelCount = blockRows.reduce((s, b) => s + b.rows.length, 0);
  // run the drilling solver + safety gate over the whole run (the machine-ready plan)
  const machining = useMemo(() => machiningReport(cabs), [cabs]);
  // shared module numbering (same order as the cut list) so a module has ONE number
  // across the cut list, FacePlan and TopPlan
  const numberOf = useMemo(() => {
    const m = new Map<string, number>();
    cabs.filter((c) => !c.furniture).forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [cabs]);
  // the wall run with the most modules = the FacePlan elevation
  const drawRun = useMemo(() => {
    const tiled = cabs.filter((c) => c.x != null && c.px == null && !c.furniture && c.appliance !== "filler");
    if (!tiled.length) return null;
    const byRun = new Map<number, Cabinet[]>();
    for (const c of tiled) {
      const r = c.run ?? 0;
      const arr = byRun.get(r) ?? [];
      arr.push(c);
      byRun.set(r, arr);
    }
    let best: Cabinet[] = [];
    for (const arr of byRun.values()) if (arr.length > best.length) best = arr;
    return { cabs: best, wallLen: Math.max(...best.map((c) => (c.x as number) + c.w), 1) };
  }, [cabs]);

  if (!prod || !drawRun) {
    return (
      <section className="screen">
        <div className="qnum">{t.handoff.num}</div>
        <h1 className="h1">{t.handoff.emptyTitle}</h1>
        <p className="sub" style={{ marginTop: 12 }}>{t.handoff.emptySub}</p>
      </section>
    );
  }

  const today = new Date().toLocaleDateString("ru-RU");

  const downloadText = (text: string, file: string, mime: string, ok: string, bom = true) => {
    try {
      // BOM helps Excel read Cyrillic CSV; but a DXF must start with "0\nSECTION", so opt-out there
      const url = URL.createObjectURL(new Blob([(bom ? "﻿" : "") + text], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      a.click();
      URL.revokeObjectURL(url);
      flash(ok);
    } catch {
      flash(t.handoff.tDlFail);
    }
  };
  // CSV carries the engineering spec (grade + усиление) as a header so it travels to the factory
  const specHeader = `${fromLine ? `${t.handoff.csvFrom};${fromLine}\r\n` : ""}${t.handoff.csvSpec};${project}\r\n${t.handoff.csvGrade};${gradeLabel}\r\n${t.handoff.csvReinforce};${hardened ? t.handoff.yes : t.handoff.no}\r\n\r\n`;
  const downloadCSV = () => downloadText(specHeader + productionCSV(prod), "mebelchi-spec.csv", "text/csv;charset=utf-8", t.handoff.tCsv);
  const downloadDXF = () => {
    const dxf = panelsDXF(cabs);
    if (dxf) downloadText(dxf, "mebelchi-panels.dxf", "application/dxf", t.handoff.tDxf, false);
  };
  // SWJ008 machine file — the engine only emits it if the safety gate passed
  const downloadSWJ008 = () => {
    const xml = runSWJ008(cabs);
    if (!xml) {
      flash(t.handoff.tSwjBlocked);
      return;
    }
    downloadText(xml, "mebelchi-swj008.xml", "application/xml", t.handoff.tSwj, false);
  };

  // Share the factory package via the OS share sheet — the user picks Telegram. Web Share
  // (level 2, files) works in mobile browsers + the Capacitor WebView, but phones reject
  // custom MIME types (application/dxf etc.), so we tag the text files as text/plain (keeping
  // the real .xml/.dxf extension the factory needs) and filter to only the files THIS device
  // will accept; anything it won't share is downloaded so nothing is lost.
  const shareFiles = async () => {
    const xml = runSWJ008(cabs); // only present if the safety gate passed
    const dxf = panelsDXF(cabs);
    const all: File[] = [];
    if (xml) all.push(new File([xml], "mebelchi-swj008.xml", { type: "text/plain" }));
    if (dxf) all.push(new File([dxf], "mebelchi-panels.dxf", { type: "text/plain" }));
    all.push(new File(["﻿" + specHeader + productionCSV(prod)], "mebelchi-spec.csv", { type: "text/csv" }));

    const nav = navigator as Navigator & {
      canShare?: (d?: { files?: File[] }) => boolean;
      share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    const title = `Mebelchi · ${project}`;
    const text = `${project} — ${t.handoff.hardware}: ${gradeLabel}. SWJ008 · DXF · CSV.`;
    const downloadAll = () => {
      if (xml) downloadSWJ008();
      if (dxf) downloadText(dxf, "mebelchi-panels.dxf", "application/dxf", "", false);
      downloadCSV();
    };

    if (nav.share && nav.canShare) {
      const ok = all.filter((f) => nav.canShare!({ files: [f] }));
      if (ok.length) {
        try {
          await nav.share({ files: ok, title, text });
          if (ok.length < all.length) {
            downloadAll(); // grab the ones the device wouldn't share
            flash(t.handoff.tSharePartial);
          } else {
            flash(t.handoff.tShared);
          }
          return;
        } catch (e) {
          if ((e as { name?: string })?.name === "AbortError") return; // user cancelled
          // any other error → fall through to a plain download
        }
      }
    }
    downloadAll();
    flash(t.handoff.tShareUnavail);
  };
  // multi-page PDF: open a print window with every drawing on its own A4 page (the user
  // saves it as PDF). Library-free; the native app would use a Capacitor print/share plugin.
  const printPDF = () => {
    const img3d = sceneApi.current?.captureDataUrl();
    const svgs = ["draw-face", "draw-top", "draw-wt", "draw-drill"]
      .map((id) => document.getElementById(id) as unknown as SVGSVGElement | null)
      .filter((el): el is SVGSVGElement => !!el)
      .map((el) => {
        const vb = el.viewBox.baseVal;
        const clone = el.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("width", String(vb.width));
        clone.setAttribute("height", String(vb.height));
        return new XMLSerializer().serializeToString(clone);
      });
    const w = window.open("", "_blank");
    if (!w) {
      flash(t.handoff.tPopup);
      return;
    }
    const page3d = img3d
      ? `<div class="pg"><div class="s3d"><img src="${img3d}"/><div class="cap">Mebelchi · ${project} · ${t.handoff.view3d} · ${today}</div></div></div>`
      : "";
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mebelchi — ${project}</title><style>` +
        "@page{size:A4 landscape;margin:8mm}html,body{margin:0;padding:0;font-family:Inter,sans-serif}" +
        ".pg{page-break-after:always;page-break-inside:avoid;break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center;height:96vh;box-sizing:border-box;overflow:hidden}" +
        ".pg:last-child{page-break-after:auto}.pg svg{max-width:100%;max-height:96vh;height:auto}" +
        ".s3d{max-width:100%;max-height:96vh;display:flex;flex-direction:column;align-items:center}.s3d img{max-width:100%;max-height:84vh;width:auto;height:auto;display:block;border:2px solid #222}.cap{align-self:stretch;text-align:center;padding:12px;font-weight:600;border:2px solid #222;border-top:none}</style></head><body>" +
        page3d +
        svgs.map((s) => `<div class="pg">${s}</div>`).join("") +
        "<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>",
    );
    w.document.close();
  };

  const downloadPNG = (svgId: string, file: string) => {
    const el = document.getElementById(svgId) as unknown as SVGSVGElement | null;
    if (!el) return;
    const vb = el.viewBox.baseVal;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(vb.width));
    clone.setAttribute("height", String(vb.height));
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const targetW = 1800;
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = Math.round((targetW * vb.height) / vb.width);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        URL.revokeObjectURL(a.href);
        flash(t.handoff.tDrawDl);
      }, "image/png");
    };
    img.onerror = () => flash(t.handoff.tImgFail);
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  };
  const download3D = () => {
    const url = sceneApi.current?.captureDataUrl();
    if (!url) {
      flash(t.handoff.t3dNotReady);
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "mebelchi-3d.png";
    a.click();
    flash(t.handoff.t3dDl);
  };

  return (
    <section className="screen ho-screen">
      <div className="qnum">{t.handoff.num}</div>
      <h1 className="h1">{t.handoff.title}</h1>

      <div className="ho-spec">
        <span>{t.handoff.hardware}: <b>{gradeLabel}</b></span>
        <span>{t.handoff.reinforce}: <b>{hardened ? t.handoff.yes : t.handoff.no}</b></span>
      </div>

      <div className="cost-sec-title" style={{ marginTop: 16 }}>{t.handoff.view3d}</div>
      <div className="ho-3d">
        <VariantScene
          points={points}
          ceiling={ceiling}
          openings={openings}
          coveringColor={coveringColor}
          floorId={FLOOR_COVERINGS[floorCovering]?.id}
          interiorWalls={interiorWalls}
          fittings={fittings}
          wallSurfaces={wallSurfaces}
          waterWall={waterWall}
          layout={layout}
          style={style}
          cabs={cabs}
          mode="real"
          nav
          onApi={onApi}
        />
      </div>
      <button className="ho-download ho-download-2" onClick={download3D} type="button">{t.handoff.dl3d}</button>

      <div className="cost-sec-title">{t.handoff.drawFace}</div>
      <div className="ho-draw">
        <DrawingSheet svgId="draw-face" cabs={drawRun.cabs} wallLen={drawRun.wallLen} ceiling={ceiling} numberOf={numberOf} project={project} view={t.handoff.vFace} date={today} />
      </div>
      <button className="ho-download ho-download-2" onClick={() => downloadPNG("draw-face", "mebelchi-facade.png")} type="button">{t.handoff.dlFace}</button>

      <div className="cost-sec-title">{t.handoff.drawTop}</div>
      <div className="ho-draw">
        <TopPlanSheet svgId="draw-top" points={points} cabs={cabs} openings={openings} waterWall={waterWall} layout={layout} numberOf={numberOf} runIds={new Set(drawRun.cabs.map((c) => c.id))} project={project} view={t.handoff.vTop} date={today} />
      </div>
      <button className="ho-download ho-download-2" onClick={() => downloadPNG("draw-top", "mebelchi-topplan.png")} type="button">{t.handoff.dlTop}</button>

      <div className="cost-sec-title">{t.handoff.drawWorktop}</div>
      <div className="ho-draw">
        <WorktopSheet svgId="draw-wt" cabs={drawRun.cabs} wallLen={drawRun.wallLen} project={project} view={t.handoff.vWorktop} date={today} />
      </div>
      <button className="ho-download ho-download-2" onClick={() => downloadPNG("draw-wt", "mebelchi-worktop.png")} type="button">{t.handoff.dlWorktop}</button>

      {machining && (
        <>
          <div className="cost-sec-title">{t.handoff.drawDrill}</div>
          <div className="ho-draw">
            <DrillSheet svgId="draw-drill" parts={machining.parts} project={project} date={today} />
          </div>
          <button className="ho-download ho-download-2" onClick={() => downloadPNG("draw-drill", "mebelchi-drill.png")} type="button">{t.handoff.dlDrill}</button>
        </>
      )}

      <button className="ho-download" style={{ marginTop: 18 }} onClick={printPDF} type="button">{t.handoff.dlPdf}</button>

      <div className="ho-stats">
        <div className="ho-stat"><span className="ho-stat-n">{prod.panels.length + blockPanelCount}</span><span className="ho-stat-l">{t.handoff.parts}</span></div>
        <div className="ho-stat"><span className="ho-stat-n">{prod.boardM2}</span><span className="ho-stat-l">{t.handoff.boardM2}</span></div>
        <div className="ho-stat"><span className="ho-stat-n">{prod.moduleCount}</span><span className="ho-stat-l">{t.handoff.modules}</span></div>
      </div>

      {machining && (
        <>
          <div className="cost-sec-title">{t.handoff.control}</div>
          <div className={`ho-preflight ${machining.ok ? "ok" : "bad"}`}>
            <div className="ho-pf-head">
              <span className="ho-pf-icon">{machining.ok ? "✓" : "!"}</span>
              <span>{machining.ok ? t.handoff.checksPassed : t.handoff.checksFailed}</span>
              <span className="ho-pf-meta">{t.handoff.countMeta(machining.partCount, machining.holeCount)}</span>
            </div>
            {!machining.ok && (
              <ul className="ho-pf-list">
                {machining.findings.slice(0, 8).map((f) => (
                  <li key={f.op_id ?? f.code + f.part_id}>{f.message_ru}</li>
                ))}
              </ul>
            )}
          </div>
          <button className="ho-download" disabled={!machining.ok} onClick={downloadSWJ008} type="button">
            {t.handoff.swj}{machining.ok ? "" : t.handoff.swjBlocked}
          </button>
        </>
      )}

      <div className="ho-actions">
        <button className="ho-download" onClick={downloadCSV} type="button">{t.handoff.csv}</button>
        <button className="ho-download ho-download-2" onClick={downloadDXF} type="button">{t.handoff.dxf}</button>
      </div>

      <button className="ho-download ho-share" onClick={shareFiles} type="button">{t.handoff.share}</button>

      <div className="cost-sec-title">{t.handoff.cutMap}</div>
      <div className="ho-table">
        <div className="ho-row ho-head">
          <span className="ho-c-part">{t.handoff.colPart}</span>
          <span className="ho-c-mat">{t.handoff.colMat}</span>
          <span className="ho-c-dim">{t.handoff.colDim}</span>
        </div>
        {(allPanels ? prod.panels : prod.panels.slice(0, PREVIEW)).map((r, i) => (
          <div className="ho-row" key={i}>
            <span className="ho-c-part">{r.part}<span className="ho-c-mod">{r.module}</span></span>
            <span className="ho-c-mat">{r.material}</span>
            <span className="ho-c-dim">{r.lengthMm}×{r.widthMm}×{r.thicknessMm}</span>
          </div>
        ))}
      </div>
      {prod.panels.length > PREVIEW && (
        <button className="ho-more" onClick={() => setAllPanels((v) => !v)} type="button">
          {allPanels ? t.handoff.collapse : t.handoff.showAll(prod.panels.length)}
        </button>
      )}

      {/* karkas blocks — their solved cut list, so the factory package is complete (D2) */}
      {blockRows.map((b) => (
        <div key={b.name}>
          <div className="cost-sec-title">🧩 {b.name}</div>
          <div className="ho-table">
            <div className="ho-row ho-head">
              <span className="ho-c-part">{t.handoff.colPart}</span>
              <span className="ho-c-mat">{t.handoff.colMat}</span>
              <span className="ho-c-dim">{t.handoff.colDim}</span>
            </div>
            {b.rows.map((r, i) => (
              <div className="ho-row" key={i}>
                <span className="ho-c-part">{r.part}</span>
                <span className="ho-c-mat">{r.material}</span>
                <span className="ho-c-dim">{r.lengthMm}×{r.widthMm}×{r.thicknessMm}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="cost-sec-title">{t.handoff.hwList}</div>
      <div className="ho-items">
        {(allHw ? prod.hardware : prod.hardware.slice(0, PREVIEW)).map((h) => (
          <div className="cost-item" key={h.name}>
            <span className="cost-item-name">{h.name}</span>
            <span className="cost-item-amt">{h.qty} {t.handoff.pcs}</span>
          </div>
        ))}
      </div>
      {prod.hardware.length > PREVIEW && (
        <button className="ho-more" onClick={() => setAllHw((v) => !v)} type="button">
          {allHw ? t.handoff.collapse : t.handoff.showAll(prod.hardware.length)}
        </button>
      )}

      <p className="cost-note">{t.handoff.note}</p>
    </section>
  );
}
