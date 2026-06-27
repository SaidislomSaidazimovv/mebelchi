// @mebelchi/pricing — pure pricing over the shared schema.
//   modulesToParts(project) → engine Part[]        (the "list of parts" the engine consumes)
//   buildBom(project)       → RawBomLine[]          (normalised BOM, no rates)
//   priceProject(project, rates) → Quote            (grouped, rounded, live-ticker ready)
// All pure: no network, no UI, deterministic.

export { buildBom } from "./buildBom.js";
export { priceProject } from "./priceProject.js";
export { modulesToParts, modulePanels, panelAreaM2 } from "./parts.js";
export type { DerivedPanel, PanelRole } from "./parts.js";
export { seedRateTable } from "./seedRateTable.js";
export {
  DEFAULT_HARDWARE_SKUS,
  KIND_TO_GROUP,
  hingesForDoorHeight,
} from "./constants.js";
