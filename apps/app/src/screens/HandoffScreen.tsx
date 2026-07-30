// Phase Е — "Передача / Готово к станку": the factory handoff. Shows architectural
// drawings (FacePlan + TopPlan, IKEA-style) + the real production package (cut list +
// hardware) derived from the run, with PNG / CSV downloads. DXF / SWJ008 / native share
// are the next phases.

import { useCallback, useMemo, useRef, useState } from "react";
import { useStore, HW_GRADE_LABEL } from "../store";
import { useT } from "../i18n/useT";
import { production, productionCSV } from "../model/cncExport";
import { panelsDXF } from "../model/dxfExport";
import { unifiedCutList, unifiedHardware, unifiedDrilledParts, positionMap } from "../three/handoffCutList";
import { bandsLabel } from "../three/specCsv";
import { BOARDS, EDGES } from "../three/materials";
import { machiningReport, runSWJ008 } from "../model/machining";
import { DrawingSheet } from "../components/DrawingSheet";
import { TopPlanSheet } from "../components/TopPlanSheet";
import { WorktopSheet } from "../components/WorktopSheet";
import { SectionSheet } from "../components/SectionSheet";
import { DrillSheet, drillGroups, DRILL_PER_PAGE } from "../components/DrillSheet";
import { CabinetPassport } from "../components/CabinetPassport";
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
  const unified = useMemo(() => unifiedCutList(cabs, projectBlocks), [cabs, projectBlocks]);
  const unifiedCount = unified.rows.reduce((n, r) => n + r.qty, 0);
  const hw = useMemo(() => unifiedHardware(cabs, projectBlocks), [cabs, projectBlocks]);
  const materials = useMemo(() => {
    const bId = new Map(BOARDS.map((b) => [b.name, b.id]));
    const eId = new Map(EDGES.map((e) => [e.name, e.id]));
    const decors = [...new Set(unified.rows.map((r) => r.materialName))].map((n) => ({ name: n, code: bId.get(n) ?? "—" }));
    const edges = [...new Set(unified.rows.map((r) => r.edgeName).filter((n): n is string => !!n))].map((n) => ({ name: n, code: eId.get(n) ?? "—" }));
    return [...decors, ...edges];
  }, [unified]);
  const drilled = useMemo(() => unifiedDrilledParts(cabs, projectBlocks), [cabs, projectBlocks]);
  const posMap = useMemo(() => positionMap(unified.rows), [unified]);
  const passportCabs = useMemo(() => {
    const seen = new Map<string, { cab: Cabinet; qty: number }>();
    const out: { cab: Cabinet; qty: number }[] = [];
    for (const c of cabs) {
      if (c.furniture || c.appliance === "filler") continue;
      const k = `${c.kind}|${c.w}|${c.h}|${c.depth ?? ""}|${c.fill}|${c.count}|${c.div}`;
      const g = seen.get(k);
      if (g) {
        g.qty += 1;
        continue;
      }
      const ng = { cab: c, qty: 1 };
      seen.set(k, ng);
      out.push(ng);
    }
    return out;
  }, [cabs]);
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
    // No kitchen run yet — but if karkas blocks are placed, still hand off THEIR cut lists.
    return (
      <section className="screen">
        <div className="qnum">{t.handoff.num}</div>
        <h1 className="h1">{t.handoff.emptyTitle}</h1>
        <p className="sub" style={{ marginTop: 12 }}>{t.handoff.emptySub}</p>
        {unified.rows.length > 0 && (
          <div className="ho-table">
            <div className="ho-row ho-head">
              <span className="ho-c-part">{t.handoff.colPart}</span>
              <span className="ho-c-mat">{t.handoff.colMat}</span>
              <span className="ho-c-dim">{t.handoff.colDim}</span>
            </div>
            {unified.rows.map((r) => (
              <div className="ho-row" key={r.ids[0]}>
                <span className="ho-c-part">{r.qty > 1 ? `${r.name} ×${r.qty}` : r.name}</span>
                <span className="ho-c-mat">{r.materialName}</span>
                <span className="ho-c-dim">{r.l_mm}×{r.w_mm}×{r.t_mm}</span>
              </div>
            ))}
          </div>
        )}
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
  const printPDF = async () => {
    const drillIds = Array.from(document.querySelectorAll('[id^="draw-drill-"]')).map((e) => e.id);
    const passportIds = Array.from(document.querySelectorAll('[id^="draw-passport-"]')).map((e) => e.id);
    const svgs = ["draw-face", "draw-top", "draw-wt", "draw-section", ...drillIds, ...passportIds]
      .map((id) => document.getElementById(id) as unknown as SVGSVGElement | null)
      .filter((el): el is SVGSVGElement => !!el)
      .map((el) => {
        const vb = el.viewBox.baseVal;
        const clone = el.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("width", String(vb.width));
        clone.setAttribute("height", String(vb.height));
        return new XMLSerializer().serializeToString(clone);
      });
    const spec = unified.rows.length
      ? {
          columns: ["#", "Деталь", "Материал", "Готовый", "Черновой", "Распил", "Кромка"],
          rows: unified.rows.map((r, i) => ({
            cells: [
              String(i + 1),
              r.qty > 1 ? `${r.name} ×${r.qty}` : r.name,
              r.materialName,
              `${r.l_mm}×${r.w_mm}×${r.t_mm}`,
              `${r.rohL_mm}×${r.rohW_mm}`,
              `${r.cutL_mm}×${r.cutW_mm}`,
              bandsLabel(r.bands),
            ],
            bands: r.bands,
            edgeName: r.edgeName,
          }))
        }
      : undefined;
    try {
      const { exportDrawingsPdf } = await import("../model/pdfExport");
      await exportDrawingsPdf({
        fileName: `Mebelchi-${project}.pdf`,
        title: "Mebelchi",
        project,
        date: today,
        partsCount: unifiedCount || undefined,
        spec,
        hardware: hw.lines,
        materials,
        svgs,
      });
    } catch {
      flash(t.handoff.tPopup);
    }
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
      <div style={{ position: "absolute", left: -99999, top: 0, width: 1400 }} aria-hidden="true">
        <DrawingSheet svgId="draw-face" cabs={drawRun.cabs} wallLen={drawRun.wallLen} ceiling={ceiling} numberOf={numberOf} project={project} view="Фасад" date={today} />
        <TopPlanSheet svgId="draw-top" points={points} cabs={cabs} openings={openings} waterWall={waterWall} layout={layout} numberOf={numberOf} runIds={new Set(drawRun.cabs.map((c) => c.id))} project={project} view="Вид сверху" date={today} />
        <WorktopSheet svgId="draw-wt" cabs={drawRun.cabs} wallLen={drawRun.wallLen} project={project} view="Столешница" date={today} />
        <SectionSheet svgId="draw-section" cabs={drawRun.cabs} numberOf={numberOf} project={project} view="Разрез" date={today} />
        {drilled.length > 0 && Array.from({ length: Math.max(1, Math.ceil(drillGroups(drilled).length / DRILL_PER_PAGE)) }).map((_, i) => (
          <DrillSheet key={i} svgId={`draw-drill-${i}`} parts={drilled} project={project} date={today} page={i} posOf={posMap} />
        ))}
        {passportCabs.map((g, i) => (
          <CabinetPassport key={`pp${i}`} svgId={`draw-passport-${i}`} cab={g.cab} artNo={i + 1} qty={g.qty} project={project} date={today} />
        ))}
      </div>

      <button className="ho-download" style={{ marginTop: 18 }} onClick={printPDF} type="button">{t.handoff.dlPdf}</button>

      <div className="ho-stats">
        <div className="ho-stat"><span className="ho-stat-n">{unifiedCount}</span><span className="ho-stat-l">{t.handoff.parts}</span></div>
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
        {(allPanels ? unified.rows : unified.rows.slice(0, PREVIEW)).map((r) => (
          <div className="ho-row" key={r.ids[0]}>
            <span className="ho-c-part">{r.qty > 1 ? `${r.name} ×${r.qty}` : r.name}</span>
            <span className="ho-c-mat">{r.materialName}</span>
            <span className="ho-c-dim">{r.l_mm}×{r.w_mm}×{r.t_mm}</span>
          </div>
        ))}
      </div>
      {unified.rows.length > PREVIEW && (
        <button className="ho-more" onClick={() => setAllPanels((v) => !v)} type="button">
          {allPanels ? t.handoff.collapse : t.handoff.showAll(unified.rows.length)}
        </button>
      )}
      {unified.fallback.length > 0 && (
        <div style={{ fontSize: 12, color: "#a06a00", marginTop: 6 }}>⚠ {unified.fallback.length} modul eski hisobda (fallback)</div>
      )}

      <div className="cost-sec-title">{t.handoff.hwList}</div>
      <div className="ho-items">
        {(allHw ? hw.lines : hw.lines.slice(0, PREVIEW)).map((h) => (
          <div className="cost-item" key={h.name}>
            <span className="cost-item-name">{h.name}</span>
            <span className="cost-item-amt">{h.qty} {t.handoff.pcs}</span>
          </div>
        ))}
      </div>
      {hw.lines.length > PREVIEW && (
        <button className="ho-more" onClick={() => setAllHw((v) => !v)} type="button">
          {allHw ? t.handoff.collapse : t.handoff.showAll(hw.lines.length)}
        </button>
      )}

      <p className="cost-note">{t.handoff.note}</p>
    </section>
  );
}
