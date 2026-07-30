import type { GroupedSpec } from "./estimate";

const SHEET = "2750×1830";

export interface MatCode {
  code: string;
  name: string;
  t_mm: number;
  sheet: string;
  full: string;
}

export interface EdgeCode {
  code: string;
  name: string;
  full: string;
}

export interface MaterialCoding {
  mats: MatCode[];
  edges: EdgeCode[];
  matOf(materialName: string, t_mm: number): string;
  edgeOf(edgeName: string | undefined): string;
}

const matKey = (name: string, t_mm: number): string => `${name}|${t_mm}`;

export function buildMaterialCoding(rows: readonly GroupedSpec[]): MaterialCoding {
  const mats: MatCode[] = [];
  const matIndex = new Map<string, string>();
  const edges: EdgeCode[] = [];
  const edgeIndex = new Map<string, string>();

  for (const r of rows) {
    const key = matKey(r.materialName, r.t_mm);
    if (!matIndex.has(key)) {
      const code = `М${mats.length + 1}`;
      matIndex.set(key, code);
      mats.push({ code, name: r.materialName, t_mm: r.t_mm, sheet: SHEET, full: `${r.materialName} · ${r.t_mm} мм · ${SHEET}` });
    }
    const e = r.edgeName;
    if (e && !edgeIndex.has(e)) {
      const code = `К${edges.length + 1}`;
      edgeIndex.set(e, code);
      edges.push({ code, name: e, full: e });
    }
  }

  return {
    mats,
    edges,
    matOf: (name, t_mm) => matIndex.get(matKey(name, t_mm)) ?? "—",
    edgeOf: (name) => (name ? edgeIndex.get(name) ?? "—" : "—"),
  };
}
