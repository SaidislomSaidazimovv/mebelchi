// Layer-1 primitive: rastex15Pattern (Ø15 cam seat on a face + Ø8 dowel into an edge).
// Pure geometry. Every millimetre comes from the spec — NO numeric literals here.
//
// For each joint position (Y along the shared edge):
//   - cam seat on Face A of panelWithCam, set back from the mating edge (edge3, X=Length)
//     by spec.camSeat.fromMatingEdge.
//   - dowel hole into the mating edge (edge3) of panelWithDowel, centred through the
//     board thickness (Z = thickness / 2 — derived from panel geometry, not a literal).

import type { mm10, DrillOp } from "../contracts/types.js";
import { mmToMm10 } from "../core/units.js";
import type { ConnectorSpec, Panel } from "./types.js";

export interface RastexOps {
  camOps: DrillOp[];
  dowelOps: DrillOp[];
}

export function rastex15Pattern(
  panelWithCam: Panel,
  panelWithDowel: Panel,
  jointPositionsY: mm10[],
  spec: ConnectorSpec,
): RastexOps {
  const camDiameter = mmToMm10(spec.camSeat.diameter);
  const camDepth = mmToMm10(spec.camSeat.depth);
  const camFromEdge = mmToMm10(spec.camSeat.fromMatingEdge);
  const dowelDiameter = mmToMm10(spec.dowelHole.diameter);
  const dowelDepth = mmToMm10(spec.dowelHole.depth);

  // Mating edge = edge3 (X = Length). Cam sits camFromEdge in from it on the face.
  const camX = panelWithCam.length_mm10 - camFromEdge;
  const dowelX = panelWithDowel.length_mm10;
  const dowelZ = Math.round(panelWithDowel.thickness_mm10 / 2); // centred in thickness

  const camOps: DrillOp[] = [];
  const dowelOps: DrillOp[] = [];
  let seq = 0;
  for (const y of jointPositionsY) {
    camOps.push({
      op: "drill",
      id: `cam_${panelWithCam.id}_${seq}`,
      face: "A",
      x_mm10: camX,
      y_mm10: y,
      diameter_mm10: camDiameter,
      depth_mm10: camDepth,
      source: "auto",
    });
    dowelOps.push({
      op: "drill",
      id: `dowel_${panelWithDowel.id}_${seq}`,
      face: "edge3",
      x_mm10: dowelX,
      y_mm10: y,
      z_mm10: dowelZ,
      diameter_mm10: dowelDiameter,
      depth_mm10: dowelDepth,
      source: "auto",
    });
    seq++;
  }
  return { camOps, dowelOps };
}
