import { mm } from "./units";

export const LDSP = "ldsp";

export type PanelRole = "side" | "top" | "bottom" | "back";

export interface Block {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  material: string;
}

export interface Panel {
  id: string;
  role: PanelRole;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  material: string;
}

export function readyBlock(): Block {
  return {
    width: mm(600),
    height: mm(720),
    depth: mm(560),
    thickness: mm(16),
    material: LDSP,
  };
}

export function solveBlockPanels(block: Block): Panel[] {
  const t = block.thickness;
  const w = block.width;
  const h = block.height;
  const d = block.depth;
  const m = block.material;
  const innerWidth = w - t * 2;
  const innerHeight = h - t * 2;
  return [
    { id: "side_left", role: "side", x: 0, y: 0, z: 0, width: t, height: h, depth: d, material: m },
    { id: "side_right", role: "side", x: w - t, y: 0, z: 0, width: t, height: h, depth: d, material: m },
    { id: "bottom", role: "bottom", x: t, y: 0, z: 0, width: innerWidth, height: t, depth: d, material: m },
    { id: "top", role: "top", x: t, y: h - t, z: 0, width: innerWidth, height: t, depth: d, material: m },
    { id: "back", role: "back", x: t, y: t, z: 0, width: innerWidth, height: innerHeight, depth: t, material: m },
  ];
}
