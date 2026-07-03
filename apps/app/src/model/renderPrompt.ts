// Builds the AI-render prompt from the ACTUAL design — so the photo matches what the
// customer configured (their facade/countertop/handle materials, floor, appliances,
// layout, daylight), not a generic invented kitchen. A picked finish stores the exact
// catalog colour, so we recover the material's name by reverse-looking-up that colour;
// finishes left on the variant style fall back to a plain colour description.

import type { Cabinet, FinishKey } from "./cabinet";
import type { KitchenStyle } from "./layout";
import type { Opening } from "./room";
import type { KitchenLayout } from "./runPlan";
import { EMAN_MATERIALS, hexToInt } from "./materials";

const LAYOUT_EN: Record<KitchenLayout, string> = {
  i: "single-wall",
  galley: "galley",
  l: "L-shaped",
  u: "U-shaped",
  peninsula: "peninsula",
};
const FLOOR_EN: Record<string, string> = {
  oak: "warm oak parquet",
  ash: "pale ash parquet",
  walnut: "rich walnut parquet",
  wenge: "dark wenge wood",
  marble: "polished marble",
  grey: "grey laminate",
};
type Appliance = NonNullable<Cabinet["appliance"]>;
const APPL_EN: Partial<Record<Appliance, string>> = {
  hob: "a cooktop with a built-in oven below",
  cooktop: "a cooktop",
  oven: "a built-in oven",
  sink: "a sink with a mixer tap",
  dishwasher: "an integrated dishwasher",
  fridge: "a tall fridge",
  hood: "an extractor hood",
};

/** plain colour name for a finish int (fallback when it wasn't a catalog pick) */
function colourName(int: number): string {
  const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
  const lum = r * 0.3 + g * 0.59 + b * 0.11;
  const warm = r > b + 12;
  if (lum > 224) return "white";
  if (lum > 196) return warm ? "cream" : "off-white";
  if (lum > 150) return warm ? "beige" : "light grey";
  if (lum > 96) return warm ? "warm taupe" : "grey";
  if (lum > 48) return warm ? "dark brown" : "anthracite";
  return "near-black charcoal";
}
/** the catalog material's descriptor if this colour was a pick, else a colour fallback */
function materialEn(int: number, part: FinishKey, fallback: (c: string) => string): string {
  const m = EMAN_MATERIALS.find((x) => x.part === part && x.en && hexToInt(x.color) === int);
  return m?.en ?? fallback(colourName(int));
}
/** the most common finish[part] across the real cabinets (falling back to the style) */
function dominant(cabs: Cabinet[], part: FinishKey, fallback: number): number {
  const tally = new Map<number, number>();
  for (const c of cabs) {
    if (c.appliance && c.appliance !== "none" && c.appliance !== "filler") continue;
    const v = c.finish?.[part] ?? fallback;
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  let best = fallback, bestN = -1;
  for (const [v, n] of tally) if (n > bestN) (bestN = n), (best = v);
  return best;
}

export interface KitchenPromptInput {
  cabs: Cabinet[];
  style: KitchenStyle;
  floorId: string;
  openings: Opening[];
  layout: KitchenLayout;
}

/** A photoreal img2img prompt assembled from the design selections. */
export function buildKitchenPrompt({ cabs, style, floorId, openings, layout }: KitchenPromptInput): string {
  const facade = materialEn(dominant(cabs, "facade", style.facade), "facade", (c) => `${c} cabinet fronts`);
  const worktop = materialEn(dominant(cabs, "worktop", style.worktop), "worktop", (c) => `${c} stone countertop`);
  const handle = materialEn(dominant(cabs, "handle", style.handle), "handle", (c) => `slim ${c} handles`);
  const floor = FLOOR_EN[floorId] ?? "wood";
  const glass = style.glassUppers ? " (with glass-door wall cabinets)" : "";

  const appls = Array.from(new Set(cabs.map((c) => c.appliance).filter((a): a is Appliance => !!a && a !== "none" && a !== "filler")));
  const applList = appls.map((a) => APPL_EN[a]).filter(Boolean);
  const applSentence = applList.length ? ` It includes ${applList.join(", ")}.` : "";

  const windows = openings.filter((o) => o.kind === "window").length;
  const light = windows > 0
    ? ` Bright natural daylight comes from ${windows === 1 ? "a window" : `${windows} windows`}.`
    : " Soft, even interior lighting.";

  return (
    "Convert this 3D CAD render of a kitchen into a photorealistic real-estate interior photograph. " +
    "KEEP the exact room layout, the cabinet arrangement and proportions, and the camera viewpoint from the render — do not move, add or remove anything. " +
    `This is a ${LAYOUT_EN[layout] ?? ""} kitchen with ${facade}${glass}, a ${worktop}, ${handle}, and a ${floor} floor.` +
    applSentence + light +
    " Re-render every surface with true real-world materials and physically-based lighting: realistic textures, soft shadows, subtle reflections and ambient occlusion. " +
    "It must look like a real photograph taken with a camera, NOT a 3D render or illustration. " +
    "Professional interior photography, sharp focus, high detail, no text, no watermark."
  );
}
