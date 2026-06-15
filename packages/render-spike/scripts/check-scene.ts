// Headless sanity check for the spike scene (no GPU needed). Verifies the scene
// meets the spike's size targets and reports the device-INDEPENDENT render budget:
// draw calls and triangle counts are fixed by construction, not by the phone.

import { buildGKitchen, type MarkerType } from "../src/kitchen.js";

const k = buildGKitchen();

const byType = new Map<MarkerType, number>();
for (const mk of k.markers) byType.set(mk.type, (byType.get(mk.type) ?? 0) + 1);

// Draw calls by construction: 1 instanced panel mesh + 1 per marker type (X-ray on)
// + ground + (env/shadow). Triangles: box = 12; 6-sided open cylinder = 12.
const markerTypes = byType.size;
const panelTris = k.panels.length * 12;
const markerTris = k.markers.length * 12;

console.log(`cabinets:        ${k.cabinetCount}`);
console.log(`panels:          ${k.panels.length}  (1 instanced draw call)`);
console.log(`hole markers:    ${k.markers.length}  across ${markerTypes} types (=${markerTypes} draw calls, X-ray ON)`);
for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`  ${t.padEnd(10)} ${n}`);
console.log(`draw calls:      ~${1 + 1} X-ray off, ~${1 + markerTypes + 1} X-ray on (panels + markers + ground)`);
console.log(`triangles:       panels ${panelTris}, markers ${markerTris} (X-ray on) → ${panelTris + markerTris} total`);

const fails: string[] = [];
if (k.cabinetCount < 12) fails.push(`cabinets ${k.cabinetCount} < 12`);
if (k.panels.length < 40) fails.push(`panels ${k.panels.length} < 40`);
if (k.markers.length < 1) fails.push("no markers");
if (1 + markerTypes + 1 > 60) fails.push(`draw calls ${1 + markerTypes + 1} not "dozens"`);

if (fails.length) {
  console.error("SCENE CHECK FAILED:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("\nSCENE CHECK OK — meets spike targets (≥12 cabinets, ≥40 panels, low draw calls).");
