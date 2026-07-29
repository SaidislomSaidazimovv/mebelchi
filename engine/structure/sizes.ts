import type { mm10 } from "../contracts/types.js";

export interface ThreeSizes {
  fertigLength: mm10;
  fertigWidth: mm10;
  rohLength: mm10;
  rohWidth: mm10;
  zuschnittLength: mm10;
  zuschnittWidth: mm10;
}

export function threeSizes(
  fertigLength: mm10,
  fertigWidth: mm10,
  edges: readonly [mm10, mm10, mm10, mm10],
  allowance: mm10 = 0,
): ThreeSizes {
  const rohLength = fertigLength - edges[2] - edges[3];
  const rohWidth = fertigWidth - edges[0] - edges[1];
  return {
    fertigLength,
    fertigWidth,
    rohLength,
    rohWidth,
    zuschnittLength: rohLength + allowance,
    zuschnittWidth: rohWidth + allowance,
  };
}
