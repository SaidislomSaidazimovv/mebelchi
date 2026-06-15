# Render Spike (R-M7) — Floor-Device FPS Gate

Standalone Three.js spike that tests **only the GPU/render side** of the shipping
architecture on a real $150 Redmi-class Android. Go/no-go before the UI build.

It imports the engine's read-only data + `solvePreview`, generates a **G-shape
kitchen** (13 cabinets / 99 panels / 246 hole markers — real ops from the verified
Layer-1 primitives), and renders it under the strict rules: shared box geometry
transformed (never rebuilt), **no CSG**, holes as `InstancedMesh` markers behind an
X-ray toggle, cheap baked-ish PBR, draw-call discipline.

## Run it on the phone

Same Wi-Fi as the laptop, then:

```bash
cd packages/render-spike
npm install
npm run preview        # or: npm run dev   (both bind 0.0.0.0)
```

Open the printed **`http://<laptop-LAN-IP>:5191/`** in the Redmi's Chrome.
(`npm run build` first if you used `preview`.) For the FPS console logs over USB:
enable USB debugging and open `chrome://inspect` on the laptop.

GitHub Pages alternative: `npm run build` then publish `dist/` (it uses a relative
base, so it works from any static path).

## On screen

- Always-on overlay: FPS + 1% low, frame ms + p95, draw calls, triangles, memory.
- Three stress buttons → results print to screen **and** console:
  - **Orbit 30s** — sustained FPS + 1% low + draw calls during auto-orbit.
  - **Width-drag 15s** — rapidly resizes a central cabinet via the engine preview
    path + **matrix transforms only** (never rebuilds geometry); reports FPS and
    per-update ms. This is the transform-not-rebuild proof.
  - **X-ray toggle** — flips all hole markers on; reports the draw-call delta.
- A live **VERDICT** panel scoring each pass-bar row.

## Read the verdict honestly

`npm run check-scene` prints the **device-independent** budget (draw calls,
triangles) — these are fixed by construction, not by the phone:

| Metric | Measured | Pass bar |
|---|---|---|
| Draw calls, X-ray OFF | **2** | dozens, not hundreds ✅ |
| Draw calls, X-ray ON | **6** (+4 for 246 markers) | instancing holds ✅ |
| Triangles | **1,190** off / **4,142** on | a few thousand ✅ |
| Per parametric update | **~0.12 ms** (max 0.60) | ≤ 4 ms ✅ |
| Geometries during drag | constant (no rebuild) | transform-only ✅ |

**FPS is the one metric this repo cannot measure** — a headless/CI browser uses
software rasterization (you'll see ~7 fps, which is the rasterizer, not the GPU).
The orbit/width-drag/X-ray **FPS** rows must be read off the overlay **on the
Redmi**. Everything else already passes and is device-independent.

If FPS fails on the phone, the overlay tells you which budget broke (draw calls?
triangles? a rebuild leaked in → `geom` count would climb during drag). Diagnose,
don't blind-optimize.
