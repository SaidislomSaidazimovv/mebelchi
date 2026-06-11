// Fixture 2 — POL bottom: multi-edge through-drills (Type 1) + Face-A drills.
// Hand-authored fixture (mm10 integers), transcribed from the real factory SWJ008.
import type { Part, Project } from "../../engine/contracts/types.js";

const part: Part = {
  id: "POL_3_1",
  name: "POL_3_1",
  width_mm10: 5030,
  length_mm10: 9880,
  thickness_mm10: 160,
  grain: "L",
  edges: [0, 10, 0, 0],
  operations: [
    { op: "drill", id: "op_1000", face: "edge1", x_mm10: 2060, y_mm10: 5030, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1010", face: "edge1", x_mm10: 7820, y_mm10: 5030, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1020", face: "edge4", x_mm10: 0, y_mm10: 595, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1030", face: "edge4", x_mm10: 0, y_mm10: 4435, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1040", face: "edge3", x_mm10: 9880, y_mm10: 595, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1050", face: "edge3", x_mm10: 9880, y_mm10: 4435, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1060", face: "A", x_mm10: 2060, y_mm10: 200, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1070", face: "A", x_mm10: 7820, y_mm10: 200, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1080", face: "A", x_mm10: 340, y_mm10: 595, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1090", face: "A", x_mm10: 4940, y_mm10: 595, diameter_mm10: 70, depth_mm10: 170, source: "auto" },
    { op: "drill", id: "op_1100", face: "A", x_mm10: 9540, y_mm10: 595, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1110", face: "A", x_mm10: 340, y_mm10: 4435, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1120", face: "A", x_mm10: 4940, y_mm10: 4435, diameter_mm10: 70, depth_mm10: 170, source: "auto" },
    { op: "drill", id: "op_1130", face: "A", x_mm10: 9540, y_mm10: 4435, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1140", face: "A", x_mm10: 2060, y_mm10: 4690, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1150", face: "A", x_mm10: 7820, y_mm10: 4690, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
  ],
};

export const fixture2: Project = {
  id: "proj_POL_3_1",
  name: "POL_3_1",
  parts: [part],
};
