// Phase 0.5 — live performance overlay. Adapted from the proven render-spike
// metrics. It is the acceptance instrument: it proves ≥30 fps on the Redmi and,
// crucially, that `geom` (geometry count) stays CONSTANT during an edit — a climb
// means a rebuild leaked in (the render-rule violation the whole architecture
// forbids). Large and readable at arm's length; mirrored to the DOM only.

/** Rolling frame-time stats. */
export class Metrics {
  private frames: number[] = [];
  private readonly cap = 600;
  private last = 0;

  /** Call once per rendered frame. */
  tick(now: number): void {
    const dt = this.last ? now - this.last : 16.7;
    this.last = now;
    this.frames.push(dt);
    if (this.frames.length > this.cap) this.frames.shift();
  }

  private percentile(p: number): number {
    if (!this.frames.length) return 0;
    const s = [...this.frames].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
  }

  avgFps(): number {
    if (!this.frames.length) return 0;
    const mean = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    return 1000 / mean;
  }
  /** 1% low = FPS at the 99th-percentile (slowest) frame. */
  onePercentLowFps(): number {
    const p99 = this.percentile(0.99);
    return p99 ? 1000 / p99 : 0;
  }
  frameMs(): number {
    return this.frames.length ? this.frames[this.frames.length - 1]! : 0;
  }
  reset(): void {
    this.frames = [];
    this.last = 0;
  }
}

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
}

export function makeOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:10",
    "font:600 14px/1.35 ui-monospace,Menlo,Consolas,monospace",
    "background:rgba(0,0,0,0.72)", "padding:7px 10px",
    "white-space:pre", "pointer-events:none", "text-shadow:0 1px 2px #000",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

/** Draw the overlay. Colour flips red under 30 fps so the acceptance bar is obvious. */
export function drawOverlay(el: HTMLDivElement, m: Metrics, stats: RenderStats): void {
  const fps = m.avgFps();
  const low = m.onePercentLowFps();
  el.style.color = fps >= 30 ? "#3f6" : fps >= 22 ? "#fd3" : "#f55";
  el.textContent =
    `FPS ${fps.toFixed(0)}  (1% low ${low.toFixed(0)})   frame ${m.frameMs().toFixed(1)}ms\n` +
    `draws ${stats.calls}   tris ${stats.triangles.toLocaleString()}   geom ${stats.geometries}`;
}
