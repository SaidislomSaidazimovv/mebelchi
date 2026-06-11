// SWJ008 reader: XML string -> universal model Part[] + flags. The inverse of
// exportSWJ008, used to ingest factory files as goldens and to mine the dump.
//
// Coverage: Machining Types 1 (edge drill), 2 (face drill), 3 (contour mill,
// with <Line> children incl. arc segments), 4 (saw groove).
//
// TOLERATE-AND-FLAG (critical for the incoming dump of hundreds of files): this
// parser NEVER silently drops or crashes on content outside coverage. Unknown
// machining types/attributes, non-empty <Outline>, non-empty Face5ID/Face6ID →
// parse what is known, attach explicit machine-readable flags for the rest.
//
// Floats are converted to mm10 integers here (the parse edge). The file charset is
// UTF-8 (verified against the factory SHKOF files — ToolOffset carries CJK tokens);
// decoding bytes→string happens before this module, which works on JS strings.

import type {
  ContourSegment,
  DrillOp,
  Grain,
  Operation,
  ParsedDocument,
  ParseFlag,
  Part,
  PanelFace,
} from "../contracts/types.js";
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

/**
 * Parse a millimetre attribute to mm10, flagging (never silently absorbing) any
 * precision finer than 0.1mm — the factory writes e.g. X="907.250" marking holes.
 */
function mmAttrToMm10(
  tag: string,
  name: string,
  where: string,
  flags: ParseFlag[],
): number {
  const raw = reqAttr(tag, name);
  const f = Number.parseFloat(raw);
  if (Number.isFinite(f) && Math.abs(f * 10 - Math.round(f * 10)) > 1e-6) {
    flags.push({
      code: "SWJ008_PRECISION_LOSS",
      where,
      detail: `${name}="${raw}" rounded to ${Math.round(f * 10) / 10}mm (mm10)`,
    });
  }
  return mmStringToMm10(raw);
}

/** Tenth-of-degree fixed-point for arc sweeps ("−90.000" -> −900). */
function degStringToDeg10(s: string): number {
  const f = Number.parseFloat(s);
  if (!Number.isFinite(f)) throw new Error(`Not a number: "${s}"`);
  return Math.round(f * 10);
}

function parseGrain(raw: string | undefined): Grain {
  return raw === "L" || raw === "W" ? raw : "NONE";
}

/** Attribute whitelists per element — anything outside these is flagged, never dropped silently. */
const KNOWN_ATTRS: Record<string, ReadonlySet<string>> = {
  panel: new Set([
    "ID", "Name", "Width", "Length", "Material", "Thickness", "IsProduce",
    "MachiningPoint", "Type", "Face5ID", "Face6ID", "Grain",
  ]),
  machining1: new Set(["ID", "Type", "IsGenCode", "Face", "X", "Y", "Z", "Depth", "Diameter"]),
  machining2: new Set(["ID", "Type", "IsGenCode", "Face", "X", "Y", "Depth", "Diameter"]),
  machining3: new Set(["ID", "Type", "IsGenCode", "Face", "Depth", "X", "Y", "Pocket", "ToolOffset"]),
  machining4: new Set(["ID", "Type", "IsGenCode", "Face", "X", "Y", "EndX", "EndY", "Width", "Depth"]),
  line: new Set(["LineID", "EndX", "EndY", "Angle"]),
};

function flagUnknownAttrs(
  tag: string,
  whitelistKey: string,
  where: string,
  flags: ParseFlag[],
): void {
  const known = KNOWN_ATTRS[whitelistKey];
  if (!known) return;
  for (const m of tag.matchAll(/([A-Za-z_][\w]*)="([^"]*)"/g)) {
    if (!known.has(m[1]!)) {
      flags.push({
        code: "SWJ008_UNKNOWN_ATTRIBUTE",
        where,
        detail: `${whitelistKey}: ${m[1]}="${m[2]}"`,
      });
    }
  }
}

function parseFace(swjFace: number, where: string, raw: string, flags: ParseFlag[]): PanelFace | undefined {
  const face = SWJ_TO_FACE[swjFace];
  if (!face) {
    flags.push({ code: "SWJ008_UNKNOWN_FACE", where, detail: raw.slice(0, 200) });
  }
  return face;
}

/** One <Machining ...>...</Machining> or <Machining ... /> block -> Operation or flag. */
function parseMachining(block: string, where: string, flags: ParseFlag[]): Operation | undefined {
  const openTag = block.match(/<Machining\b[^>]*?\/?>/)?.[0];
  if (!openTag) {
    flags.push({ code: "SWJ008_MALFORMED", where, detail: block.slice(0, 200) });
    return undefined;
  }
  const type = reqAttr(openTag, "Type");
  const id = `op_${reqAttr(openTag, "ID")}`;

  if (type === "1" || type === "2") {
    flagUnknownAttrs(openTag, `machining${type}`, where, flags);
    const face = parseFace(Number.parseInt(reqAttr(openTag, "Face"), 10), where, openTag, flags);
    if (!face) return undefined;
    const zRaw = attr(openTag, "Z");
    const op: DrillOp = {
      op: "drill",
      id,
      face,
      x_mm10: mmAttrToMm10(openTag, "X", where, flags),
      y_mm10: mmAttrToMm10(openTag, "Y", where, flags),
      ...(zRaw !== undefined ? { z_mm10: mmAttrToMm10(openTag, "Z", where, flags) } : {}),
      diameter_mm10: mmAttrToMm10(openTag, "Diameter", where, flags),
      depth_mm10: mmAttrToMm10(openTag, "Depth", where, flags),
      source: "auto",
    };
    return op;
  }

  if (type === "3") {
    flagUnknownAttrs(openTag, "machining3", where, flags);
    const face = parseFace(Number.parseInt(reqAttr(openTag, "Face"), 10), where, openTag, flags);
    if (!face) return undefined;
    const segments: ContourSegment[] = [];
    for (const lineTag of block.match(/<Line\b[^>]*\/>/g) ?? []) {
      flagUnknownAttrs(lineTag, "line", where, flags);
      segments.push({
        endX_mm10: mmAttrToMm10(lineTag, "EndX", where, flags),
        endY_mm10: mmAttrToMm10(lineTag, "EndY", where, flags),
        angle_deg10: degStringToDeg10(reqAttr(lineTag, "Angle")),
      });
    }
    return {
      op: "contour",
      id,
      face,
      x_mm10: mmAttrToMm10(openTag, "X", where, flags),
      y_mm10: mmAttrToMm10(openTag, "Y", where, flags),
      depth_mm10: mmAttrToMm10(openTag, "Depth", where, flags),
      pocket: Number.parseInt(attr(openTag, "Pocket") ?? "0", 10),
      toolOffset: attr(openTag, "ToolOffset") ?? "",
      segments,
      source: "auto",
    };
  }

  if (type === "4") {
    flagUnknownAttrs(openTag, "machining4", where, flags);
    const face = parseFace(Number.parseInt(reqAttr(openTag, "Face"), 10), where, openTag, flags);
    if (!face) return undefined;
    return {
      op: "saw_groove",
      id,
      face,
      x_mm10: mmAttrToMm10(openTag, "X", where, flags),
      y_mm10: mmAttrToMm10(openTag, "Y", where, flags),
      endX_mm10: mmAttrToMm10(openTag, "EndX", where, flags),
      endY_mm10: mmAttrToMm10(openTag, "EndY", where, flags),
      width_mm10: mmAttrToMm10(openTag, "Width", where, flags),
      depth_mm10: mmAttrToMm10(openTag, "Depth", where, flags),
      source: "auto",
    };
  }

  // Unknown machining type: keep the raw block in the flag, never guess, never crash.
  flags.push({ code: "SWJ008_UNKNOWN_MACHINING_TYPE", where, detail: block.slice(0, 500) });
  return undefined;
}

function parsePanel(panelXml: string, flags: ParseFlag[]): Part {
  const openTag = panelXml.match(/<Panel\b[^>]*>/)?.[0];
  if (!openTag) throw new Error("SWJ008 parse: malformed <Panel>");
  const id = reqAttr(openTag, "ID");
  flagUnknownAttrs(openTag, "panel", id, flags);

  const outline = panelXml.match(/<Outline>([\s\S]*?)<\/Outline>/)?.[1] ?? "";
  if (outline.trim() !== "") {
    flags.push({ code: "SWJ008_NONEMPTY_OUTLINE", where: id, detail: outline.slice(0, 500) });
  }
  for (const faceIdAttr of ["Face5ID", "Face6ID"] as const) {
    const v = attr(openTag, faceIdAttr) ?? "";
    if (v !== "") {
      flags.push({ code: "SWJ008_NONEMPTY_FACE_ID", where: id, detail: `${faceIdAttr}="${v}"` });
    }
  }

  const edges: [number, number, number, number] = [0, 0, 0, 0];
  for (const edgeTag of panelXml.match(/<Edge\b[^>]*\/>/g) ?? []) {
    const face = Number.parseInt(reqAttr(edgeTag, "Face"), 10);
    if (face >= 1 && face <= 4) {
      edges[face - 1] = mmStringToMm10(reqAttr(edgeTag, "Thickness"));
    }
  }

  // Machining blocks: self-closing OR paired with children (Type 3 has <Lines>).
  const operations: Operation[] = [];
  for (const block of panelXml.match(/<Machining\b[^>]*\/>|<Machining\b[^>]*>[\s\S]*?<\/Machining>/g) ?? []) {
    const op = parseMachining(block, id, flags);
    if (op) operations.push(op);
  }

  return {
    id,
    name: attr(openTag, "Name") ?? id,
    width_mm10: mmAttrToMm10(openTag, "Width", id, flags),
    length_mm10: mmAttrToMm10(openTag, "Length", id, flags),
    thickness_mm10: mmAttrToMm10(openTag, "Thickness", id, flags),
    grain: parseGrain(attr(openTag, "Grain")),
    edges,
    operations,
  };
}

/**
 * Parse an SWJ008 XML document into the universal model + tolerate-and-flag report.
 * Multi-panel documents are fully supported (one Part per <Panel>).
 */
export function parseSWJ008Document(xml: string): ParsedDocument {
  const flags: ParseFlag[] = [];
  const panels = xml.match(/<Panel\b[\s\S]*?<\/Panel>/g) ?? [];
  const parts = panels.map((p) => parsePanel(p, flags));
  return { parts, flags };
}

/** Back-compat wrapper: parts only. Prefer parseSWJ008Document to see the flags. */
export function parseSWJ008(xml: string): Part[] {
  return parseSWJ008Document(xml).parts;
}
