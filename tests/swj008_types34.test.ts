// Session 2 — Types 3 (contour mill) and 4 (saw groove) coverage, proven against
// the real SHKOF wardrobe panels, plus the tolerate-and-flag parser contract.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalizeParts,
  exportSWJ008,
  parseSWJ008Document,
  solveFull,
  type ContourOp,
  type Project,
  type SawGrooveOp,
} from "../engine/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const xml = (file: string) => readFileSync(join(HERE, "golden", "xml", file), "utf8");

// ORTA POL's two Ø3 marking holes sit at X="907.250"/"939.250" — quarter-millimetre
// coordinates the mm10 convention cannot represent. The parser rounds and FLAGS them
// (never silently); the canonical/semantic round-trip is unaffected.
const SHKOF_FILES: Array<{ file: string; precisionFlags: number }> = [
  { file: "SHKOF_TOM_4_1.XML", precisionFlags: 0 },
  { file: "SHKOF_ORTA_POL_14_1.XML", precisionFlags: 2 },
  // Door panel from the 2026-06-12 dump — the hinge ground truth (4×Ø35 cups + marks).
  { file: "SHKOF_ORTA_CHAP_ESHIK_7_1.XML", precisionFlags: 0 },
];

describe("SHKOF golden fixtures — semantic round-trip (parse → canonical → export → re-parse → zero diff)", () => {
  for (const { file, precisionFlags } of SHKOF_FILES) {
    it(`${file} round-trips with zero canonical diff`, async () => {
      const original = parseSWJ008Document(xml(file));
      // Within coverage except the documented sub-mm10 coordinates, which are flagged.
      expect(original.flags.map((f) => f.code)).toEqual(
        Array(precisionFlags).fill("SWJ008_PRECISION_LOSS"),
      );

      const project: Project = { id: `proj_${file}`, name: file, parts: original.parts };
      const exported = exportSWJ008(project);
      const reparsed = parseSWJ008Document(exported);

      // Re-parsing our own export is flag-free: the export is exactly mm10.
      expect(reparsed.flags).toEqual([]);
      expect(canonicalizeParts(reparsed.parts)).toEqual(canonicalizeParts(original.parts));

      // The safety gate accepts the real panels.
      const { validation } = await solveFull(project);
      expect(validation.ok).toBe(true);
    });
  }

  for (const file of ["SHKOF_TOM_4_1.XML", "SHKOF_ORTA_CHAP_ESHIK_7_1.XML"]) {
    it(`${file} re-export is byte-identical to the factory file`, () => {
      const { parts } = parseSWJ008Document(xml(file));
      expect(exportSWJ008({ id: "x", name: "x", parts })).toBe(xml(file));
    });
  }

  it("SHKOF_ORTA_POL re-export is byte-identical except the two flagged mm10 roundings", () => {
    const { parts } = parseSWJ008Document(xml("SHKOF_ORTA_POL_14_1.XML"));
    const expected = xml("SHKOF_ORTA_POL_14_1.XML")
      .replace('X="907.250"', 'X="907.300"')
      .replace('X="939.250"', 'X="939.300"');
    expect(exportSWJ008({ id: "x", name: "x", parts })).toBe(expected);
  });
});

describe("Type 3 — contour mill semantics", () => {
  const tom = parseSWJ008Document(xml("SHKOF_TOM_4_1.XML")).parts[0]!;
  const contours = tom.operations.filter((o): o is ContourOp => o.op === "contour");

  it("parses the corner-radius arcs: Angle≠0 is an arc with that sweep in degrees", () => {
    expect(contours).toHaveLength(2);
    // 25mm corner radius: start (1369,0) → end (1394,25), -90° sweep, full 16mm depth.
    const c = contours.find((c) => c.x_mm10 === 13690)!;
    expect(c.segments).toEqual([{ endX_mm10: 13940, endY_mm10: 250, angle_deg10: -900 }]);
    expect(c.depth_mm10).toBe(160);
  });

  it("parses the straight scribe line on Face 6 (ORTA POL): Angle=0 segment, 5mm depth", () => {
    const orta = parseSWJ008Document(xml("SHKOF_ORTA_POL_14_1.XML")).parts[0]!;
    const scribe = orta.operations.find(
      (o): o is ContourOp => o.op === "contour" && o.face === "B",
    )!;
    expect(scribe.depth_mm10).toBe(50);
    expect(scribe.segments).toEqual([{ endX_mm10: 13850, endY_mm10: 5640, angle_deg10: 0 }]);
    expect(scribe.toolOffset).toBe("");
  });

  it("preserves the CJK ToolOffset token 右 byte-exactly through parse → export (encoding round-trip)", () => {
    for (const c of contours) expect(c.toolOffset).toBe("右");

    // Explicit encoding path: export → UTF-8 bytes → decode → re-parse. The token must
    // survive the byte edge unmangled (this is what a Windows-1251/latin1 write would break).
    const exported = exportSWJ008({ id: "x", name: "x", parts: [tom] });
    const throughBytes = Buffer.from(exported, "utf8").toString("utf8");
    expect(throughBytes).toBe(exported);
    const reparsed = parseSWJ008Document(throughBytes).parts[0]!;
    const back = reparsed.operations.filter((o): o is ContourOp => o.op === "contour");
    expect(back.map((c) => c.toolOffset)).toEqual(["右", "右"]);
    expect(exported.includes(`ToolOffset="右"`)).toBe(true);

    // And the byte sequence itself is the canonical UTF-8 encoding of 右 (E5 8F B3).
    const bytes = Buffer.from(exported, "utf8");
    expect(bytes.includes(Buffer.from([0xe5, 0x8f, 0xb3]))).toBe(true);
  });
});

describe("Type 4 — saw groove semantics", () => {
  it("parses the back-panel dados: X/Y → EndX/EndY, 4mm wide, 8mm and 5mm deep", () => {
    const tom = parseSWJ008Document(xml("SHKOF_TOM_4_1.XML")).parts[0]!;
    const orta = parseSWJ008Document(xml("SHKOF_ORTA_POL_14_1.XML")).parts[0]!;
    const g1 = tom.operations.find((o): o is SawGrooveOp => o.op === "saw_groove")!;
    const g2 = orta.operations.find((o): o is SawGrooveOp => o.op === "saw_groove")!;

    expect(g1).toMatchObject({
      x_mm10: 90, y_mm10: 5830, endX_mm10: 13850, endY_mm10: 5830,
      width_mm10: 40, depth_mm10: 80, face: "A",
    });
    expect(g2).toMatchObject({ width_mm10: 40, depth_mm10: 50 });
  });
});

describe("Tolerate-and-flag — the parser never silently drops or crashes", () => {
  const SYNTHETIC = `<?xml version="1.0" encoding="utf-8" ?>
<Root>
\t<Project Name="" Flag="SWJ008">
\t\t<Panels>
\t\t\t<Panel ID="WEIRD_1" Name="WEIRD_1" Width="100.000" Length="200.000" Material="" Thickness="16.000" IsProduce="true" MachiningPoint="1" Type="1" Face5ID="TEX_OAK" Face6ID="" Grain="L">
\t\t\t\t<Outline><Point X="0" Y="0" /></Outline>
\t\t\t\t<Machines>
\t\t\t\t\t<Machining ID="1000" Type="2" IsGenCode="2" Face="5" X="50.000" Y="50.000" Depth="11.000" Diameter="5.000" />
\t\t\t\t\t<Machining ID="1010" Type="9" IsGenCode="2" Face="5" X="10.000" Y="10.000" Laser="true" />
\t\t\t\t\t<Machining ID="1020" Type="2" IsGenCode="2" Face="5" X="60.000" Y="60.000" Depth="11.000" Diameter="5.000" FutureAttr="?" />
\t\t\t\t</Machines>
\t\t\t\t<EdgeGroup>
\t\t\t\t\t<Edge Face="1" Thickness="0.000000" />
\t\t\t\t\t<Edge Face="2" Thickness="0.000000" />
\t\t\t\t\t<Edge Face="3" Thickness="0.000000" />
\t\t\t\t\t<Edge Face="4" Thickness="0.000000" />
\t\t\t\t</EdgeGroup>
\t\t\t</Panel>
\t\t</Panels>
\t</Project>
</Root>
`;

  it("parses the known content and flags the rest — no exception", () => {
    const { parts, flags } = parseSWJ008Document(SYNTHETIC);

    // Known content survived: both Type-2 drills, panel dims.
    expect(parts).toHaveLength(1);
    expect(parts[0]!.operations).toHaveLength(2);
    expect(parts[0]!.width_mm10).toBe(1000);

    // Everything outside coverage is flagged, machine-readable.
    const codes = flags.map((f) => f.code).sort();
    expect(codes).toContain("SWJ008_UNKNOWN_MACHINING_TYPE"); // Type 9
    expect(codes).toContain("SWJ008_NONEMPTY_OUTLINE");
    expect(codes).toContain("SWJ008_NONEMPTY_FACE_ID"); // Face5ID="TEX_OAK"
    expect(codes).toContain("SWJ008_UNKNOWN_ATTRIBUTE"); // FutureAttr (and Laser)

    const typeFlag = flags.find((f) => f.code === "SWJ008_UNKNOWN_MACHINING_TYPE")!;
    expect(typeFlag.where).toBe("WEIRD_1");
    expect(typeFlag.detail).toContain('Type="9"'); // raw content preserved
  });

  it("multi-panel documents parse fully (one Part per Panel)", () => {
    const two = xml("SHKOF_TOM_4_1.XML").replace(
      /<\/Panel>\r?\n/,
      "</Panel>\r\n" + xml("POLKA-1_7_1.XML").match(/<Panel\b[\s\S]*?<\/Panel>/)![0] + "\r\n",
    );
    const { parts, flags } = parseSWJ008Document(two);
    expect(parts.map((p) => p.id)).toEqual(["SHKOF TOM_4_1", "POLKA-1_7_1"]);
    expect(flags).toEqual([]);
  });

  it("clean factory files produce zero flags", () => {
    for (const f of ["POLKA-1_7_1.XML", "POL_3_1.XML", "YON_BAK-1_4_1.XML", "ORTA_BAK_6_1.XML"]) {
      expect(parseSWJ008Document(xml(f)).flags).toEqual([]);
    }
  });
});
