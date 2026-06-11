// Fixture 3 — ORTA BAK middle: double-sided Face-A and Face-B drilling.
// Hand-authored fixture (mm10 integers), transcribed from the real factory SWJ008.
import type { Part, Project } from "../../engine/contracts/types.js";

const part: Part = {
  id: "ORTA BAK_6_1",
  name: "ORTA BAK_6_1",
  width_mm10: 5030,
  length_mm10: 5380,
  thickness_mm10: 160,
  grain: "L",
  edges: [0, 10, 0, 0],
  operations: [
    { op: "drill", id: "op_1000", face: "edge1", x_mm10: 1570, y_mm10: 5030, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1010", face: "edge1", x_mm10: 3810, y_mm10: 5030, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1020", face: "edge4", x_mm10: 0, y_mm10: 595, z_mm10: 80, diameter_mm10: 45, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1030", face: "edge4", x_mm10: 0, y_mm10: 4435, z_mm10: 80, diameter_mm10: 45, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1040", face: "edge3", x_mm10: 5380, y_mm10: 755, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1050", face: "edge3", x_mm10: 5380, y_mm10: 4275, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1060", face: "A", x_mm10: 5040, y_mm10: 755, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1070", face: "A", x_mm10: 2690, y_mm10: 915, diameter_mm10: 50, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1080", face: "A", x_mm10: 2690, y_mm10: 4115, diameter_mm10: 50, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1090", face: "A", x_mm10: 5040, y_mm10: 4275, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1100", face: "A", x_mm10: 1570, y_mm10: 4690, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1110", face: "A", x_mm10: 3810, y_mm10: 4690, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1120", face: "B", x_mm10: 2690, y_mm10: 595, diameter_mm10: 50, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1130", face: "B", x_mm10: 2690, y_mm10: 4435, diameter_mm10: 50, depth_mm10: 110, source: "auto" },
  ],
};

export const fixture3: Project = {
  id: "proj_ORTA BAK_6_1",
  name: "ORTA BAK_6_1",
  parts: [part],
};
