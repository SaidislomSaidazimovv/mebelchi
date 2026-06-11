// Fixture 1 — YON BAK-1 left side: edge (Type 1) + Face-A drills; dowels/pins/cams.
// Hand-authored fixture (mm10 integers), transcribed from the real factory SWJ008.
import type { Part, Project } from "../../engine/contracts/types.js";

const part: Part = {
  id: "YON BAK-1_4_1",
  name: "YON BAK-1_4_1",
  width_mm10: 5200,
  length_mm10: 6340,
  thickness_mm10: 160,
  grain: "L",
  edges: [10, 10, 0, 0],
  operations: [
    { op: "drill", id: "op_1000", face: "edge4", x_mm10: 0, y_mm10: 320, z_mm10: 80, diameter_mm10: 45, depth_mm10: 100, source: "auto" },
    { op: "drill", id: "op_1010", face: "edge4", x_mm10: 0, y_mm10: 640, z_mm10: 80, diameter_mm10: 45, depth_mm10: 100, source: "auto" },
    { op: "drill", id: "op_1020", face: "edge4", x_mm10: 0, y_mm10: 4560, z_mm10: 80, diameter_mm10: 45, depth_mm10: 100, source: "auto" },
    { op: "drill", id: "op_1030", face: "edge4", x_mm10: 0, y_mm10: 4880, z_mm10: 80, diameter_mm10: 45, depth_mm10: 100, source: "auto" },
    { op: "drill", id: "op_1040", face: "edge3", x_mm10: 6340, y_mm10: 680, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1050", face: "edge3", x_mm10: 6340, y_mm10: 4520, z_mm10: 80, diameter_mm10: 80, depth_mm10: 340, source: "auto" },
    { op: "drill", id: "op_1060", face: "A", x_mm10: 400, y_mm10: 200, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1070", face: "A", x_mm10: 880, y_mm10: 595, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1080", face: "A", x_mm10: 6000, y_mm10: 680, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1090", face: "A", x_mm10: 3650, y_mm10: 915, diameter_mm10: 50, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1100", face: "A", x_mm10: 3650, y_mm10: 4115, diameter_mm10: 50, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1110", face: "A", x_mm10: 880, y_mm10: 4435, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1120", face: "A", x_mm10: 6000, y_mm10: 4520, diameter_mm10: 150, depth_mm10: 125, source: "auto" },
    { op: "drill", id: "op_1130", face: "A", x_mm10: 1570, y_mm10: 5110, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
    { op: "drill", id: "op_1140", face: "A", x_mm10: 4770, y_mm10: 5110, diameter_mm10: 80, depth_mm10: 110, source: "auto" },
  ],
};

export const fixture1: Project = {
  id: "proj_YON BAK-1_4_1",
  name: "YON BAK-1_4_1",
  parts: [part],
};
