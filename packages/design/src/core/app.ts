// Shared bootstrap: build a project, decompose, lay out, render. Every variant
// calls this; the variants add their own interaction on top (Phases 1–3).
// Phase 0.4b: static render only, no editing yet.

import { createScene } from "../render/scene.ts";
import { layout } from "../render/layout.ts";
import { decompose } from "./decompose.ts";
import { newProject } from "./designModel.ts";

export function startApp(): void {
  const project = newProject();
  const result = decompose(project);
  const panels = layout(project.nodes, result);

  const scene = createScene();
  scene.setPanels(panels);
  scene.frame(panels);
}
