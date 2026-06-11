// Session 3 validation — tools/joint_extractor.py vs the 9 panels on hand,
// treated as one project. The manually-established Fixture 0–3 joints are ground
// truth: the extractor must find them all (15_/16_ docs). Runs the real tool.

import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Row {
  project: string;
  panelA: string;
  panelB: string | null;
  family: string;
  positions_mm10: number[][];
  depth_class: string;
  confidence: number;
  evidence: string;
}

interface Result {
  project: string;
  rows: Row[];
  flags: Array<{ type: string; panelA: string }>;
  unmatched: Array<{ class: string; count: number }>;
  stats: { panels: number; holes: number; holes_assigned: number; rows: number };
}

let result: Result;

beforeAll(() => {
  const out = join(mkdtempSync(join(tmpdir(), "joints-")), "joint_decisions.json");
  execFileSync(
    "python3",
    [
      join(ROOT, "tools", "joint_extractor.py"),
      join(ROOT, "XML output examples"),
      "--project", "sample_9_panels",
      "--out", out,
    ],
    { stdio: "pipe" },
  );
  result = JSON.parse(readFileSync(out, "utf8"));
});

const find = (family: string, A?: string, B?: string, depth?: string) =>
  result.rows.filter(
    (r) =>
      r.family === family &&
      (!A || r.panelA.includes(A)) &&
      (!B || (r.panelB ?? "").includes(B)) &&
      (!depth || r.depth_class === depth),
  );

describe("joint_extractor v0 — ground truth from Fixtures 0–3", () => {
  it("parses all 9 panels", () => {
    expect(result.stats.panels).toBe(9);
    expect(result.stats.holes).toBeGreaterThan(100);
  });

  it("finds the ORTA BAK cam+dowel joint (Ø15×12.5 ↔ KRISHKA), incl. the bolt channel", () => {
    const rows = find("cam_dowel", "ORTA BAK_6", "KRISHKA", "12.5");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.evidence.includes("channel"))).toBe(true);
  });

  it("finds the OYOQ ↔ POL cam pair (the 576mm spacing signature)", () => {
    expect(find("cam_dowel", "OYOQ", "POL_3").length).toBeGreaterThan(0);
  });

  it("finds POLKA (Ø15×11 depth class) ↔ both YON BAK sides", () => {
    expect(find("cam_dowel", "POLKA", "YON BAK-1", "11").length).toBeGreaterThan(0);
    expect(find("cam_dowel", "POLKA", "YON BAK-2", "11").length).toBeGreaterThan(0);
  });

  it("records both Ø15 depth classes (12.5 and 11) as data", () => {
    const classes = new Set(find("cam_dowel").map((r) => r.depth_class));
    expect(classes.has("12.5")).toBe(true);
    expect(classes.has("11")).toBe(true);
  });

  it("finds the shelf-pin columns on ORTA BAK and YON BAK", () => {
    expect(find("shelf_pin", "ORTA BAK_6").length).toBeGreaterThan(0);
    expect(find("shelf_pin", "YON BAK-1").length).toBeGreaterThan(0);
  });

  it("finds the POL ↔ ORTA BAK confirmat (Ø7 bores ↔ Ø4.5 pilots)", () => {
    expect(find("confirmat", "POL_3", "ORTA BAK_6").length).toBeGreaterThan(0);
  });

  it("finds the 32mm-pitch slide rows on YON BAK and OYOQ", () => {
    expect(find("slide_row", "YON BAK-1").length).toBeGreaterThan(0);
    expect(find("slide_row", "OYOQ").length).toBeGreaterThan(0);
  });

  it("records the SHKOF Type-4 grooves as groove_joint rows", () => {
    expect(find("groove_joint", "SHKOF TOM").length).toBe(1);
    expect(find("groove_joint", "SHKOF ORTA POL").length).toBe(1);
  });

  it("classifies Ø3×1 as marking, never a joint", () => {
    const rows = find("marking", "SHKOF ORTA POL");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.positions_mm10).toHaveLength(2);
  });

  it("never guesses: ambiguous spacing produces a flag, and unmatched holes are reported", () => {
    // POLKA's 384mm pair is genuinely shared by 4 panels -> must be a flag, not rows.
    expect(result.flags.some((f) => f.type === "AMBIGUOUS_CAM_MATE" && f.panelA.includes("POLKA"))).toBe(true);
    // Honest residue: not every hole is assigned in v0.
    expect(result.unmatched.length).toBeGreaterThan(0);
    expect(result.stats.holes_assigned).toBeLessThan(result.stats.holes);
  });

  it("confidence is honest and modest (no row pretends certainty)", () => {
    for (const r of result.rows) {
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(0.9);
    }
  });
});
