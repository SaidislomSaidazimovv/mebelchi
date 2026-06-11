// Layer-1 primitive inputs. A `Panel` is the minimal geometry a drilling primitive
// needs — the same mm10 conventions as Part (X along Length, Y along Width;
// origin bottom-left of Face A). Specs carry every millimetre; primitives carry none.

import type { mm10 } from "../contracts/types.js";

export interface Panel {
  id: string;
  /** Y extent of machining space (SWJ008 @Width). */
  width_mm10: mm10;
  /** X extent of machining space (SWJ008 @Length). */
  length_mm10: mm10;
  thickness_mm10: mm10;
}

// ---------------------------------------------------------------------------
// Hardware spec shapes (typed mirror of hardware_specs.dummy.json).
// All numbers here are in mm (whole millimetres); primitives convert to mm10.
// `verified` flips to true only when a value is confirmed against factory data.
// ---------------------------------------------------------------------------

export interface HingeSpec {
  brand: string;
  verified: boolean;
  source: string;
  cup: { diameter: number; depth: number };
  cupCenterFromDoorEdge: number;
  mountingHoles: {
    count: number;
    diameter: number;
    depth: number;
    spacingFromCupCenter: number;
  };
}

export interface ConnectorSpec {
  brand: string;
  verified: boolean;
  source: string;
  camSeat: {
    diameter: number;
    depth: number;
    /** Distance of the cam-seat centre from the mating edge, on the face. */
    fromMatingEdge: number;
  };
  dowelHole: { diameter: number; depth: number };
}

export interface ShelfPinSpec {
  brand: string;
  verified: boolean;
  source: string;
  diameter: number;
  depth: number;
}

export interface System32Spec {
  verified: boolean;
  source: string;
  verticalPitch: number;
  firstHoleOffset: number;
  frontRowSetback: number;
  backRowSetback: number;
}

export interface HardwareSpec {
  hinges: Record<string, HingeSpec>;
  connectors: Record<string, ConnectorSpec>;
  shelfPins: Record<string, ShelfPinSpec>;
  system32: System32Spec;
}
