// Layer 5 — exportSWJ008(project) -> XML. The translator, isolated. Consumes the
// universal model, emits one format. Reproduces the factory SWJ008 byte-for-byte
// (CRLF, tab indent, attribute order, ID sequence, number formatting) so it can
// stand as the one-time format-confirmation spike (14_RUNTIME_AND_BUILD.md Part 3).

import type { Part, Project } from "../contracts/types.js";
import { FACE_TO_SWJ, swjMachiningType } from "../core/face.js";
import { mm10ToEdgeString, mm10ToMmString } from "../core/units.js";

const NL = "\r\n";
const T = "\t";

/** First machining ID and the step between consecutive operations. */
const ID_BASE = 1000;
const ID_STEP = 10;

/**
 * Arc sweep as SWJ008 writes it: zero is emitted with 6 decimals ("0.000000"),
 * non-zero with 3 ("-90.000"). Same factory quirk as edge-banding thickness.
 */
function deg10ToAngleString(v: number): string {
  return v === 0 ? "0.000000" : (v / 10).toFixed(3);
}

function machiningLines(part: Part, opIndex: number): string[] {
  const op = part.operations[opIndex]!;
  const id = ID_BASE + opIndex * ID_STEP;
  const face = FACE_TO_SWJ[op.face];

  if (op.op === "contour") {
    // Type 3 attribute order differs from drills: Depth precedes X/Y.
    // ToolOffset is the machine's token, written verbatim (may be CJK: 右/左).
    const lines: string[] = [
      `${T.repeat(5)}<Machining ID="${id}" Type="3" IsGenCode="2" Face="${face}" ` +
        `Depth="${mm10ToMmString(op.depth_mm10)}" X="${mm10ToMmString(op.x_mm10)}" ` +
        `Y="${mm10ToMmString(op.y_mm10)}" Pocket="${op.pocket}" ToolOffset="${op.toolOffset}">`,
      `${T.repeat(6)}<Lines>`,
    ];
    op.segments.forEach((s, i) => {
      lines.push(
        `${T.repeat(7)}<Line LineID="${i + 1}" EndX="${mm10ToMmString(s.endX_mm10)}" ` +
          `EndY="${mm10ToMmString(s.endY_mm10)}" Angle="${deg10ToAngleString(s.angle_deg10)}" />`,
      );
    });
    lines.push(`${T.repeat(6)}</Lines>`);
    lines.push(`${T.repeat(5)}</Machining>`);
    return lines;
  }

  if (op.op === "saw_groove") {
    return [
      `${T.repeat(5)}<Machining ID="${id}" Type="4" IsGenCode="2" Face="${face}" ` +
        `X="${mm10ToMmString(op.x_mm10)}" Y="${mm10ToMmString(op.y_mm10)}" ` +
        `EndX="${mm10ToMmString(op.endX_mm10)}" EndY="${mm10ToMmString(op.endY_mm10)}" ` +
        `Width="${mm10ToMmString(op.width_mm10)}" Depth="${mm10ToMmString(op.depth_mm10)}" />`,
    ];
  }

  const type = swjMachiningType(op.face);
  const attrs: string[] = [
    `ID="${id}"`,
    `Type="${type}"`,
    `IsGenCode="2"`,
    `Face="${face}"`,
    `X="${mm10ToMmString(op.x_mm10)}"`,
    `Y="${mm10ToMmString(op.y_mm10)}"`,
  ];
  if (type === 1) {
    // Edge drills carry Z (depth into the board thickness).
    attrs.push(`Z="${mm10ToMmString(op.z_mm10 ?? 0)}"`);
  }
  attrs.push(`Depth="${mm10ToMmString(op.depth_mm10)}"`);
  attrs.push(`Diameter="${mm10ToMmString(op.diameter_mm10)}"`);

  return [`${T.repeat(5)}<Machining ${attrs.join(" ")} />`];
}

function panelBlock(part: Part): string[] {
  const lines: string[] = [];

  const panelAttrs = [
    `ID="${part.id}"`,
    `Name="${part.name}"`,
    `Width="${mm10ToMmString(part.width_mm10)}"`,
    `Length="${mm10ToMmString(part.length_mm10)}"`,
    `Material=""`,
    `Thickness="${mm10ToMmString(part.thickness_mm10)}"`,
    `IsProduce="true"`,
    `MachiningPoint="1"`,
    `Type="1"`,
    `Face5ID=""`,
    `Face6ID=""`,
    `Grain="${part.grain}"`,
  ];

  lines.push(`${T.repeat(3)}<Panel ${panelAttrs.join(" ")}>`);
  lines.push(`${T.repeat(4)}<Outline></Outline>`);
  lines.push(`${T.repeat(4)}<Machines>`);
  for (let i = 0; i < part.operations.length; i++) {
    lines.push(...machiningLines(part, i));
  }
  lines.push(`${T.repeat(4)}</Machines>`);
  lines.push(`${T.repeat(4)}<EdgeGroup>`);
  for (let face = 0; face < 4; face++) {
    lines.push(
      `${T.repeat(5)}<Edge Face="${face + 1}" Thickness="${mm10ToEdgeString(part.edges[face]!)}" />`,
    );
  }
  lines.push(`${T.repeat(4)}</EdgeGroup>`);
  lines.push(`${T.repeat(3)}</Panel>`);

  return lines;
}

/** Render a Project as an SWJ008 XML string. */
export function exportSWJ008(project: Project): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="utf-8" ?>`);
  lines.push(`<Root>`);
  lines.push(`${T}<Project Name="" Flag="SWJ008">`);
  lines.push(`${T.repeat(2)}<Panels>`);
  for (const part of project.parts) {
    lines.push(...panelBlock(part));
  }
  lines.push(`${T.repeat(2)}</Panels>`);
  lines.push(`${T}</Project>`);
  lines.push(`</Root>`);
  // File terminates with a trailing CRLF after </Root>.
  return lines.join(NL) + NL;
}
