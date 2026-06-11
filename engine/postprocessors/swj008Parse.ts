// SWJ008 reader: XML string -> universal model Part[]. The inverse of exportSWJ008,
// used to ingest the real factory files as goldens. The format is flat and regular,
// so a focused attribute scan is dependency-free and deterministic. Floats are
// converted to mm10 integers here (the parse edge).

import type { DrillOp, Grain, Part, PanelFace } from "../contracts/types.js";
import { SWJ_TO_FACE } from "../core/face.js";
import { mmStringToMm10 } from "../core/units.js";

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function reqAttr(tag: string, name: string): string {
  const v = attr(tag, name);
  if (v === undefined) throw new Error(`SWJ008 parse: missing @${name} in: ${tag.slice(0, 80)}`);
  return v;
}

function parseGrain(raw: string | undefined): Grain {
  return raw === "L" || raw === "W" ? raw : "NONE";
}

function parsePanel(panelXml: string): Part {
  const openTag = panelXml.match(/<Panel\b[^>]*>/)?.[0];
  if (!openTag) throw new Error("SWJ008 parse: malformed <Panel>");

  const edges: [number, number, number, number] = [0, 0, 0, 0];
  for (const edgeTag of panelXml.match(/<Edge\b[^>]*\/>/g) ?? []) {
    const face = Number.parseInt(reqAttr(edgeTag, "Face"), 10);
    if (face >= 1 && face <= 4) {
      edges[face - 1] = mmStringToMm10(reqAttr(edgeTag, "Thickness"));
    }
  }

  const operations: DrillOp[] = [];
  for (const m of panelXml.match(/<Machining\b[^>]*\/>/g) ?? []) {
    const swjFace = Number.parseInt(reqAttr(m, "Face"), 10);
    const face: PanelFace | undefined = SWJ_TO_FACE[swjFace];
    if (!face) throw new Error(`SWJ008 parse: unknown Face="${swjFace}"`);
    const zRaw = attr(m, "Z");
    operations.push({
      op: "drill",
      id: `op_${reqAttr(m, "ID")}`,
      face,
      x_mm10: mmStringToMm10(reqAttr(m, "X")),
      y_mm10: mmStringToMm10(reqAttr(m, "Y")),
      ...(zRaw !== undefined ? { z_mm10: mmStringToMm10(zRaw) } : {}),
      diameter_mm10: mmStringToMm10(reqAttr(m, "Diameter")),
      depth_mm10: mmStringToMm10(reqAttr(m, "Depth")),
      source: "auto",
    });
  }

  return {
    id: reqAttr(openTag, "ID"),
    name: attr(openTag, "Name") ?? reqAttr(openTag, "ID"),
    width_mm10: mmStringToMm10(reqAttr(openTag, "Width")),
    length_mm10: mmStringToMm10(reqAttr(openTag, "Length")),
    thickness_mm10: mmStringToMm10(reqAttr(openTag, "Thickness")),
    grain: parseGrain(attr(openTag, "Grain")),
    edges,
    operations,
  };
}

/** Parse an SWJ008 XML document into the universal model. */
export function parseSWJ008(xml: string): Part[] {
  const panels = xml.match(/<Panel\b[\s\S]*?<\/Panel>/g) ?? [];
  return panels.map(parsePanel);
}
