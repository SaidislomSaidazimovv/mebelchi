// Pinch / wheel / drag zoom+pan for an SVG that draws in a fixed user-space.
// Returns a viewBox string + pointer handlers to spread on the <svg>. Taps are
// preserved: a gesture that actually moves is flagged as a pan and the trailing
// click is swallowed (onClickCapture) so it doesn't also select/edit. `scale`
// (current width / initial width) lets callers keep label/handle sizes constant
// on screen by multiplying by it.
import { useEffect, useRef, useState } from "react";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function useSvgZoom(initial: Box, resetKey: unknown) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<Box>(initial);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinchD = useRef(0);
  const down = useRef<{ x: number; y: number } | null>(null);
  const panned = useRef(false);
  const initRef = useRef(initial);
  initRef.current = initial;

  // re-fit when the underlying drawing changes shape (new run / room)
  useEffect(() => {
    setVb(initRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };
  const twoDist = () => {
    const v = [...ptrs.current.values()];
    return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
  };
  const twoMid = () => {
    const v = [...ptrs.current.values()];
    return { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const p = toSvg(cx, cy);
    setVb((v) => {
      const fx = (p.x - v.x) / v.w;
      const fy = (p.y - v.y) / v.h;
      const min = initRef.current.w * 0.25;
      const max = initRef.current.w * 4;
      const nw = Math.min(max, Math.max(min, v.w * factor));
      const nh = nw * (v.h / v.w);
      return { x: p.x - fx * nw, y: p.y - fy * nh, w: nw, h: nh };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
    panned.current = false;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) pinchD.current = twoDist();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size >= 2) {
      const nd = twoDist();
      if (pinchD.current > 0) {
        const m = twoMid();
        zoomAt(m.x, m.y, pinchD.current / (nd || 1));
      }
      pinchD.current = nd;
      panned.current = true;
    } else {
      if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 4) panned.current = true;
      const rect = svgRef.current?.getBoundingClientRect();
      const k = vb.w / (rect?.width || 1);
      setVb((v) => ({ ...v, x: v.x - (e.clientX - prev.x) * k, y: v.y - (e.clientY - prev.y) * k }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchD.current = 0;
    down.current = null;
  };
  const onWheel = (e: React.WheelEvent) => zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 0.9);
  const onClickCapture = (e: React.MouseEvent) => {
    if (panned.current) {
      e.stopPropagation();
      panned.current = false;
    }
  };

  return {
    svgRef,
    vbStr: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    scale: vb.w / initial.w,
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel, onClickCapture },
  };
}
