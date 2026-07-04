// @mebelchi/schema — the one shared schema (PRICING_AND_SCHEMA.md).
// Engine, pricing, UI and the RoomPlan plugin all read these types.
// Types only; no logic.

export type { UUID, MM } from "./common.js";

export type {
  Space,
  SpaceConstraint,
  Opening,
} from "./space.js";

export type {
  Module,
  ModuleKind,
  ModuleFill,
  DoorStyle,
  HandleType,
  ModuleDoor,
  ModuleHandle,
  ModulePanel,
} from "./module.js";

export type {
  Project,
  MaterialSelection,
  ProjectPricing,
  ProjectMeta,
} from "./project.js";

export type {
  RateTable,
  MaterialType,
  MaterialRate,
  EdgeRate,
  WorktopRate,
  HardwareRate,
  OperationRates,
  LaborRates,
  DeliveryRates,
} from "./rates.js";

export type {
  BomLine,
  RawBomLine,
  BomKind,
  BomUnit,
  QuoteGroup,
} from "./bom.js";

export type { Quote } from "./quote.js";
