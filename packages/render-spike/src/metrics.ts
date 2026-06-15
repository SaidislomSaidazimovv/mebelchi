// Live performance metrics + on-screen overlay. Large and readable so it's legible
// on a phone held at arm's length, and mirrored to console for capture over USB
// (chrome://inspect).

export class Metrics {
  private frames: number[] = []; // recent frame times (ms)
  private readonly cap = 600;
  private last = 0;

  /** Call once per rendered frame; returns the frame time in ms. */
  tick(now: number): number {
    const dt = this.last ? now - this.last : 16.7;
    this.last = now;
    this.frames.push(dt);
    if (this.frames.length > this.cap) this.frames.shift();
    return dt;
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
  /** 1% low FPS = FPS at the 99th-percentile (slowest) frame time. */
  onePercentLowFps(): number {
    const p99 = this.percentile(0.99);
    return p99 ? 1000 / p99 : 0;
  }
  frameMs(): number {
    return this.frames.length ? this.frames[this.frames.length - 1]! : 0;
  }
  frameMsP95(): number {
    return this.percentile(0.95);
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
  textures: number;
}

export function makeOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.id = "metrics";
  el.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:10",
    "font:600 15px/1.35 ui-monospace,Menlo,Consolas,monospace",
    "color:#0f0", "background:rgba(0,0,0,0.72)", "padding:8px 10px",
    "white-space:pre-wrap", "pointer-events:none", "text-shadow:0 1px 2px #000",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

export function renderOverlay(
  el: HTMLDivElement,
  m: Metrics,
  stats: RenderStats,
  memMB: number,
  status: string,
): void {
  const fps = m.avgFps();
  const low = m.onePercentLowFps();
  const color = fps >= 30 ? "#3f6" : fps >= 22 ? "#fd3" : "#f55";
  el.style.color = color;
  el.textContent =
    `FPS ${fps.toFixed(0)}  (1% low ${low.toFixed(0)})   frame ${m.frameMs().toFixed(1)}ms  p95 ${m.frameMsP95().toFixed(1)}ms\n` +
    `draws ${stats.calls}   tris ${stats.triangles.toLocaleString()}   geom ${stats.geometries}  tex ${stats.textures}  mem ~${memMB.toFixed(0)}MB\n` +
    status;
}
