// Phase 0.2 — the design model. DESIGN only: topology + sizes. There is no field
// here for thickness, kromka, groove, hole, or placement — those live in the
// ConstructionProfile (packages/construction). This file NEVER makes a Part.
//
// The law (27_DESIGN_CONSTRUCTION_SEPARATION.md): the app edits a DesignNode tree;
// panelDecomposition turns it into Parts. So every function below returns a NEW
// tree (pure) and touches only DesignNode fields. Undo will snapshot these trees.

import type {
  CabinetType, DesignNode, DesignProject, Division, NodeKind,
} from "@mebelchi/construction/design";

// INVARIANT (load-bearing — undo depends on it): every function here is PURE. It
// returns a NEW DesignProject and NEVER mutates its input in place. History (undo.ts)
// stores project references without cloning, trusting this. If any edit below ever
// mutates its argument, undo silently corrupts. Keep every mutator going through
// withNode/cloneProject.

// mm10 = tenths of a millimetre (engine unit). A helper so call sites read in mm.
export const mm = (millimetres: number): number => Math.round(millimetres * 10);

let nodeCounter = 0;
/** Assigned identity — created once, never mutated (design.ts / doc-06 §8). */
export function newNodeId(kind: NodeKind): string {
  nodeCounter += 1;
  return `${kind}_${nodeCounter}`;
}

/** A fresh single cabinet — the starting point every variant opens with. */
export function newCabinet(
  cabinetType: CabinetType = "shelf_unit",
  size = { w_mm10: mm(600), h_mm10: mm(720), d_mm10: mm(560) },
): DesignNode {
  return { nodeId: newNodeId("cabinet"), kind: "cabinet", cabinetType, size, children: [] };
}

export function newProject(name = "Yangi loyiha"): DesignProject {
  return {
    projectId: `proj_${Date.now()}`,
    name,
    nodes: [newCabinet()],
    slotBindings: { fasad: "", korpus: "", orqa: "" },
    overrides: [],
  };
}

// ─────────────────────────────────────────────────────────── tree helpers (pure)

/** Structural clone of one node — deep enough that mutations never alias the old tree. */
function cloneNode(n: DesignNode): DesignNode {
  return {
    ...n,
    size: n.size ? { ...n.size } : undefined,
    division: n.division ? { ...n.division } : undefined,
    children: n.children?.map(cloneNode),
  };
}

function cloneProject(p: DesignProject): DesignProject {
  return {
    ...p,
    nodes: p.nodes.map(cloneNode),
    slotBindings: { ...p.slotBindings },
    overrides: p.overrides.map((o) => ({ ...o })),
  };
}

/** Return the node with `nodeId` in a (freshly cloned) tree, or null. */
function findNode(nodes: DesignNode[], nodeId: string): DesignNode | null {
  for (const n of nodes) {
    if (n.nodeId === nodeId) return n;
    const hit = n.children ? findNode(n.children, nodeId) : null;
    if (hit) return hit;
  }
  return null;
}

/**
 * Apply a mutation to one node and return a NEW project. The mutation runs on the
 * clone, so the caller's old project is untouched (this is what makes undo a plain
 * snapshot stack). Unknown nodeId → the project is returned unchanged.
 */
function withNode(
  project: DesignProject, nodeId: string, mutate: (n: DesignNode) => void,
): DesignProject {
  const next = cloneProject(project);
  const target = findNode(next.nodes, nodeId);
  if (!target) return project;
  mutate(target);
  return next;
}

// ─────────────────────────────────────────────────────────────── design edits

/** Resize a cabinet. Design: it changes the box; construction (t, back, kromka)
 *  re-derives from the profile when panelDecomposition runs. */
export function resize(
  project: DesignProject, nodeId: string, dim: "w" | "h" | "d", value_mm10: number,
): DesignProject {
  const key = dim === "w" ? "w_mm10" : dim === "h" ? "h_mm10" : "d_mm10";
  return withNode(project, nodeId, (n) => {
    n.size = { ...(n.size ?? {}), [key]: Math.max(1, Math.round(value_mm10)) };
  });
}

/** Add a shelf inside a cabinet. A shelf is DESIGN intent (where a board goes);
 *  its thickness/setback are construction, added later by the decomposer. */
export function addShelf(project: DesignProject, cabinetId: string): DesignProject {
  return withNode(project, cabinetId, (n) => {
    n.children = [...(n.children ?? []), { nodeId: newNodeId("shelf"), kind: "shelf" }];
  });
}

/** Add a vertical divider — splits the cabinet into compartments. Design. */
export function addDivider(
  project: DesignProject, cabinetId: string, division?: Division,
): DesignProject {
  return withNode(project, cabinetId, (n) => {
    const d: DesignNode = { nodeId: newNodeId("divider"), kind: "divider" };
    if (division) d.division = division;
    n.children = [...(n.children ?? []), d];
  });
}

/** Toggle a hinged door on a cabinet. Design: it changes what it looks like. */
export function toggleDoor(project: DesignProject, cabinetId: string): DesignProject {
  return withNode(project, cabinetId, (n) => { n.hasDoor = !n.hasDoor; });
}

/**
 * Set a node's Division — where a divider/shelf sits within its compartment
 * (fixed mm / ratio weight / flex). Pure DESIGN intent: it says WHERE, not how the
 * board is built. Variant C's seam-drag writes `{ rule:"fixed", mm }` here; the app's
 * layout reads it to place the divider (position is a visualisation concern the app
 * owns — see layout.ts). Passing undefined clears it back to the even-spread default.
 */
export function setDivision(
  project: DesignProject, nodeId: string, division: Division | undefined,
): DesignProject {
  return withNode(project, nodeId, (n) => {
    if (division) n.division = division;
    else delete n.division;
  });
}

/**
 * Remove a CHILD node (shelf / divider) by id. Root cabinets are protected: a
 * removeNode call can never empty `project.nodes` (that would leave the app with
 * nothing to render/edit). To drop a whole cabinet, use a dedicated action later.
 */
export function removeNode(project: DesignProject, nodeId: string): DesignProject {
  // A top-level cabinet is not a "child" — refuse and return unchanged.
  if (project.nodes.some((n) => n.nodeId === nodeId)) return project;
  const strip = (nodes: DesignNode[]): DesignNode[] =>
    nodes
      .filter((n) => n.nodeId !== nodeId)
      .map((n) => (n.children ? { ...n, children: strip(n.children) } : n));
  const next = cloneProject(project);
  next.nodes = strip(next.nodes);
  return next;
}

/**
 * The cabinet a selection belongs to: the node itself if it's a cabinet, else the
 * top-level cabinet whose subtree contains it. So "add a shelf" while a shelf is
 * selected still adds to the right cabinet. Returns null if nothing matches.
 */
export function findCabinetOf(project: DesignProject, nodeId: string | null): DesignNode | null {
  if (!nodeId) return null;
  const contains = (n: DesignNode): boolean =>
    n.nodeId === nodeId || (n.children ?? []).some(contains);
  for (const n of project.nodes) {
    if (n.kind === "cabinet" && contains(n)) return n;
  }
  return null;
}

// Re-export the read-only find for selection code (returns the node in the live tree).
export { findNode };
