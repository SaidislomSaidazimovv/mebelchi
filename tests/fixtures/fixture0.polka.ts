// Fixture 0 — POLKA shelf: Face-A (Type 2) drilling only; byte-exact format anchor.
// Hand-authored fixture (mm10 integers), transcribed from the real factory SWJ008.
import type { Part, Project } from "../../engine/contracts/types.js";

const part: Part = {
  id: "POLKA-1_7_1",
  name: "POLKA-1_7_1",
  width_mm10: 4860,
  length_mm10: 5030,
  thickness_mm10: 160,
  grain: "L",
  edges: [0, 0, 10, 0],
  operations: [
    { op: "drill", id: "op_1000", face: "A", x_mm10: 915, y_mm10: 70, diameter_mm10: 150, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1010", face: "A", x_mm10: 4115, y_mm10: 70, diameter_mm10: 150, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1020", face: "A", x_mm10: 595, y_mm10: 4790, diameter_mm10: 150, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1030", face: "A", x_mm10: 4435, y_mm10: 4790, diameter_mm10: 150, depth_mm10: 110, source: "auto" },
  ],
};

export const fixture0: Project = {
  id: "proj_POLKA-1_7_1",
  name: "POLKA-1_7_1",
  parts: [part],
};
