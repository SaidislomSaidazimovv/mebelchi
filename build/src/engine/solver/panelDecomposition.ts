import type { Part, mm10, SawGrooveOp } from "../../../../engine/contracts/types";
import type { DesignProject } from "../contracts/design";
import type { ConstructionProfile, PartRole, KromkaSlot } from "../catalogs/profiles";

export function derivePartId(nodeId: string, role: string, sub: number): string {
  return `${nodeId}_${role}_${sub}`;
}

export interface DecompositionResult {
  parts: Part[];
  flags: string[];
}

export function panelDecomposition(project: DesignProject, profile: ConstructionProfile): DecompositionResult {
  const flags: string[] = [];
  const resultParts: Part[] = [];

  const mergeAllowed = profile.defaults.merge?.allowed ?? false;
  const cabinets = project.nodes.filter(n => n.kind === "cabinet");
  
  const doMerge = mergeAllowed && cabinets.length > 1;
  let groupTotalW = 0;
  
  if (doMerge) {
    const t = profile.material.carcass_mm10;
    cabinets.forEach(c => groupTotalW += (c.size?.w_mm10 ?? 0));
    groupTotalW -= (cabinets.length - 1) * t;
    
    const limitL = profile.defaults.merge?.limits?.maxSheetLength_mm10 ?? 27500;
    if (groupTotalW > limitL) {
      flags.push("EXCEEDS_SHEET");
    }
  }

  const resolveGrain = (role: PartRole) => {
    if (profile.grain === "NONE") return "NONE";
    if (profile.defaults.grainPolicy.mode === "free_hidden" && profile.defaults.grainPolicy.hiddenRoles.includes(role)) {
      return "NONE";
    }
    return profile.grain;
  };

  const resolveEdges = (role: PartRole, cabinetType?: CabinetType): [mm10, mm10, mm10, mm10] => {
    let typeKromka = profile.defaults.kromkaByRole;
    if (cabinetType && profile.byType[cabinetType]?.kromkaByRole) {
      typeKromka = profile.byType[cabinetType]!.kromkaByRole!;
    }
    const k = typeKromka?.[role] || profile.defaults.kromkaByRole?.[role];
    if (!k) return [0, 0, 0, 0];
    const getT = (slot: KromkaSlot | null) => slot ? (profile.kromka.slots[slot]?.thickness_mm10 ?? 0) : 0;
    return [getT(k.front), getT(k.back), getT(k.left), getT(k.right)];
  };

  for (const node of project.nodes) {
    if (node.kind === "cabinet") {
      const w = node.size?.w_mm10 ?? 0;
      const h = node.size?.h_mm10 ?? 0;
      const d = node.size?.d_mm10 ?? 0;
      if (w <= 0 || h <= 0 || d <= 0) continue;

      const t = profile.material.carcass_mm10;
      let placement = profile.defaults.bottomPlacement;
      if (node.cabinetType && profile.byType[node.cabinetType]?.bottomPlacement) {
        placement = profile.byType[node.cabinetType]!.bottomPlacement!;
      }
      const placementOverride = project.overrides.find(o => o.nodeId === node.nodeId && o.field === "bottomPlacement");
      if (placementOverride && typeof placementOverride.value === "string") {
        placement = placementOverride.value as "vkladnoe" | "nakladnoe";
      }
      const worktopT = node.hasWorktop ? (profile.material.worktop_mm10 ?? 0) : 0;
      const plinth = profile.defaults.plinth;
      const plinthH = plinth.style !== "none" ? plinth.height_mm10 : 0;

      let sideH = h - worktopT;
      if (plinth.placement === "under") {
        sideH -= plinthH;
      }

      const innerW = w - 2 * t;
      const innerH = plinth.placement === "between" ? sideH - plinthH - 2 * t : sideH - 2 * t;

      if (placement === "nakladnoe") {
        sideH -= t;
      }
      const bz = profile.defaults.backZone_mm10 ?? 0;
      const innerD = d - bz;

      const backTreatment = profile.defaults.back.treatment;
      let sideOps: SawGrooveOp[] = [];

      if (backTreatment === "groove") {
        const gw = profile.defaults.back.grooveWidth_mm10;
        const gd = profile.defaults.back.grooveDepth_mm10;
        const gs = profile.defaults.back.grooveSetback_mm10;
        sideOps = [{
          op: "saw_groove",
          id: derivePartId(node.nodeId, "groove_side", 0),
          face: "A",
          x_mm10: 0,
          y_mm10: d - gs,
          endX_mm10: sideH,
          endY_mm10: d - gs,
          width_mm10: gw,
          depth_mm10: gd,
          source: "auto"
        }];
      }

      const c_i = cabinets.indexOf(node);
      const prevIsCabinet = c_i > 0;
      const nextIsCabinet = c_i > -1 && c_i < cabinets.length - 1;
      
      const mergedLeft = doMerge && prevIsCabinet;
      const mergedRight = doMerge && nextIsCabinet;

      if (!mergedLeft) {
        resultParts.push({
          id: derivePartId(node.nodeId, "side_l", 0),
          name: "Chap yon",
          role: "side",
          length_mm10: sideH,
          width_mm10: d,
          thickness_mm10: t,
          grain: resolveGrain("side"),
          edges: resolveEdges("side", node.cabinetType),
          operations: [...sideOps],
        });
      }

      if (!mergedRight) {
        resultParts.push({
          id: derivePartId(node.nodeId, "side_r", 0),
          name: "O'ng yon",
          role: "side",
          length_mm10: sideH,
          width_mm10: d,
          thickness_mm10: t,
          grain: resolveGrain("side"),
          edges: resolveEdges("side", node.cabinetType),
          operations: [...sideOps],
        });
      } else {
        const sharedDividerD = backTreatment === "groove" ? innerD : d;
        resultParts.push({
          id: derivePartId(node.nodeId, "shared_divider", 0),
          name: "Umumiy yon",
          role: "divider",
          length_mm10: sideH,
          width_mm10: sharedDividerD,
          thickness_mm10: t,
          grain: resolveGrain("divider"),
          edges: resolveEdges("divider", node.cabinetType),
          operations: [], 
        });
      }

      if (!doMerge) {
        const bottomW = placement === "vkladnoe" ? w - 2 * t : w;
        const topW = w - 2 * t;

        let bottomOps: SawGrooveOp[] = [];
        let topOps: SawGrooveOp[] = [];
        if (backTreatment === "groove") {
          const gw = profile.defaults.back.grooveWidth_mm10;
          const gd = profile.defaults.back.grooveDepth_mm10;
          const gs = profile.defaults.back.grooveSetback_mm10;
          
          bottomOps = [{
            op: "saw_groove",
            id: derivePartId(node.nodeId, "groove_bottom", 0),
            face: "A",
            x_mm10: 0,
            y_mm10: d - gs,
            endX_mm10: bottomW, 
            endY_mm10: d - gs,
            width_mm10: gw,
            depth_mm10: gd,
            source: "auto"
          }];
          
          topOps = [{
            op: "saw_groove",
            id: derivePartId(node.nodeId, "groove_top", 0),
            face: "A",
            x_mm10: 0,
            y_mm10: d - gs,
            endX_mm10: topW, 
            endY_mm10: d - gs,
            width_mm10: gw,
            depth_mm10: gd,
            source: "auto"
          }];
        }

        resultParts.push({
          id: derivePartId(node.nodeId, "bottom", 0),
          name: "Tag",
          role: "bottom",
          length_mm10: bottomW,
          width_mm10: d,
          thickness_mm10: t,
          grain: resolveGrain("bottom"),
          edges: resolveEdges("bottom", node.cabinetType),
          operations: [...bottomOps],
        });

        let topStyle = profile.defaults.topStyle;
        if (node.cabinetType && profile.byType[node.cabinetType]?.topStyle) {
          topStyle = profile.byType[node.cabinetType]!.topStyle!;
        }
        const override = project.overrides.find(o => o.nodeId === node.nodeId && o.field === "topStyle");
        if (override && typeof override.value === "string") {
          topStyle = override.value as "full" | "stretchers" | "none";
        }

        if (topStyle === "full") {
          resultParts.push({
            id: derivePartId(node.nodeId, "top", 0),
            name: "Tepa",
            role: "top",
            length_mm10: topW,
            width_mm10: d,
            thickness_mm10: t,
            grain: resolveGrain("top"),
            edges: resolveEdges("top", node.cabinetType),
            operations: [...topOps],
          });
        } else if (topStyle === "stretchers") {
          const sw = profile.defaults.stretcherWidth_mm10;
          let stretcherOps: SawGrooveOp[] = [];
          if (backTreatment === "groove") {
            const gw = profile.defaults.back.grooveWidth_mm10;
            const gd = profile.defaults.back.grooveDepth_mm10;
            const gs = profile.defaults.back.grooveSetback_mm10;
            stretcherOps = [{
              op: "saw_groove",
              id: derivePartId(node.nodeId, "groove_stretcher", 0),
              face: "A",
              x_mm10: 0,
              y_mm10: sw - gs,
              endX_mm10: topW,
              endY_mm10: sw - gs,
              width_mm10: gw,
              depth_mm10: gd,
              source: "auto"
            }];
          }
          resultParts.push({
            id: derivePartId(node.nodeId, "stretcher_f", 0),
            name: "Old Tsarga",
            role: "stretcher",
            length_mm10: topW,
            width_mm10: sw,
            thickness_mm10: t,
            grain: resolveGrain("stretcher"),
            edges: resolveEdges("stretcher", node.cabinetType),
            operations: [],
          });
          resultParts.push({
            id: derivePartId(node.nodeId, "stretcher_b", 0),
            name: "Orqa Tsarga",
            role: "stretcher",
            length_mm10: topW,
            width_mm10: sw,
            thickness_mm10: t,
            grain: resolveGrain("stretcher"),
            edges: resolveEdges("stretcher", node.cabinetType),
            operations: [...stretcherOps],
          });
        }

        if (backTreatment !== "none") {
          const backT = profile.material.back_mm10;
          let backW = 0;
          let backH = 0;
          if (backTreatment === "overlay") {
            backW = w;
            backH = sideH; 
          } else if (backTreatment === "groove") {
            const gd = profile.defaults.back.grooveDepth_mm10;
            backW = innerW + 2 * gd;
            backH = innerH + 2 * gd;
          }
          resultParts.push({
            id: derivePartId(node.nodeId, "back", 0),
            name: "Orqa",
            role: "back",
            length_mm10: backH, 
            width_mm10: backW,
            thickness_mm10: backT,
            grain: resolveGrain("back"),
            edges: resolveEdges("back", node.cabinetType),
            operations: [],
          });
        }

        if (plinth.style !== "none") {
          const pLen = plinth.placement === "under" ? w : innerW;
          resultParts.push({
            id: derivePartId(node.nodeId, "plinth_f", 0),
            name: "Old Tsokol",
            role: "plinth",
            length_mm10: pLen,
            width_mm10: plinthH,
            thickness_mm10: t,
            grain: resolveGrain("plinth"),
            edges: resolveEdges("plinth", node.cabinetType),
            operations: [],
          });
          if (plinth.style === "box") {
            resultParts.push({
              id: derivePartId(node.nodeId, "plinth_b", 0),
              name: "Orqa Tsokol",
              role: "plinth",
              length_mm10: pLen,
              width_mm10: plinthH,
              thickness_mm10: t,
              grain: resolveGrain("plinth"),
              edges: resolveEdges("plinth", node.cabinetType),
              operations: [],
            });
          }
        }

        if (node.hasWorktop) {
          const frontOverhang = profile.defaults.worktop?.frontOverhang_mm10 ?? 0;
          const sideOverhang = profile.defaults.worktop?.sideOverhang_mm10 ?? 0;
          resultParts.push({
            id: derivePartId(node.nodeId, "worktop", 0),
            name: "Stoleshnitsa",
            role: "worktop",
            length_mm10: w + 2 * sideOverhang,
            width_mm10: d + frontOverhang,
            thickness_mm10: profile.material.worktop_mm10 ?? 0,
            grain: resolveGrain("worktop"),
            edges: resolveEdges("worktop", node.cabinetType),
            operations: [],
          });
        }
      }

      const dividers = node.children?.filter(c => c.kind === "divider") ?? [];
      const shelves = node.children?.filter(c => c.kind === "shelf") ?? [];

      const numDividers = dividers.length;
      const numCompartments = numDividers + 1;
      
      const compWCache: number[] = [];
      for (let c = 0; c < numCompartments; c++) {
        const exactW = (innerW - numDividers * t) / numCompartments;
        const startBound = Math.round(c * exactW + c * t);
        const nextBound = Math.round((c + 1) * exactW + c * t);
        compWCache.push(nextBound - startBound);
      }

      dividers.forEach((div, i) => {
        resultParts.push({
          id: derivePartId(div.nodeId, "divider", i),
          name: "Bo'lgich",
          role: "divider",
          length_mm10: innerH,
          width_mm10: innerD,
          thickness_mm10: t,
          grain: resolveGrain("divider"),
          edges: resolveEdges("divider", node.cabinetType),
          operations: [],
        });
      });

      shelves.forEach((shelf, i) => {
        const shelfD = innerD - (profile.defaults.shelfSetback_mm10 ?? 0);
        for (let c = 0; c < numCompartments; c++) {
          resultParts.push({
            id: derivePartId(shelf.nodeId, "shelf", (i * numCompartments) + c),
            name: "Polka",
            role: "shelf",
            length_mm10: compWCache[c],
            width_mm10: shelfD,
            thickness_mm10: t,
            grain: resolveGrain("shelf"),
            edges: resolveEdges("shelf", node.cabinetType),
            operations: [],
          });
        }
      });
    }
  }

  if (doMerge && cabinets.length > 0) {
    const firstNode = cabinets[0];
    const w = groupTotalW;
    const h = firstNode.size?.h_mm10 ?? 0;
    const d = firstNode.size?.d_mm10 ?? 0;
    const t = profile.material.carcass_mm10;

    let placement = profile.defaults.bottomPlacement;
    if (firstNode.cabinetType && profile.byType[firstNode.cabinetType]?.bottomPlacement) {
      placement = profile.byType[firstNode.cabinetType]!.bottomPlacement!;
    }
    const placementOverride = project.overrides.find(o => o.nodeId === firstNode.nodeId && o.field === "bottomPlacement");
    if (placementOverride && typeof placementOverride.value === "string") {
      placement = placementOverride.value as "vkladnoe" | "nakladnoe";
    }
    const hasWorktop = cabinets.some(c => c.hasWorktop);
    const worktopT = hasWorktop ? (profile.material.worktop_mm10 ?? 0) : 0;
    
    const plinth = profile.defaults.plinth;
    const plinthH = plinth.style !== "none" ? plinth.height_mm10 : 0;

    let sideH = h - worktopT;
    if (plinth.placement === "under") {
      sideH -= plinthH;
    }

    const bottomW = placement === "vkladnoe" ? w - 2 * t : w;
    const topW = w - 2 * t;
    const innerW = w - 2 * t;
    const innerH = plinth.placement === "between" ? sideH - plinthH - 2 * t : sideH - 2 * t;

    if (placement === "nakladnoe") {
      sideH -= t;
    }
    const backTreatment = profile.defaults.back.treatment;

    let bottomOps: SawGrooveOp[] = [];
    let topOps: SawGrooveOp[] = [];
    if (backTreatment === "groove") {
      const gw = profile.defaults.back.grooveWidth_mm10;
      const gd = profile.defaults.back.grooveDepth_mm10;
      const gs = profile.defaults.back.grooveSetback_mm10;
      
      bottomOps = [{
        op: "saw_groove",
        id: derivePartId(firstNode.nodeId, "groove_bottom_merged", 0),
        face: "A",
        x_mm10: 0,
        y_mm10: d - gs,
        endX_mm10: bottomW,
        endY_mm10: d - gs,
        width_mm10: gw,
        depth_mm10: gd,
        source: "auto"
      }];
      
      topOps = [{
        op: "saw_groove",
        id: derivePartId(firstNode.nodeId, "groove_top_merged", 0),
        face: "A",
        x_mm10: 0,
        y_mm10: d - gs,
        endX_mm10: topW,
        endY_mm10: d - gs,
        width_mm10: gw,
        depth_mm10: gd,
        source: "auto"
      }];
    }

    resultParts.push({
      id: derivePartId(firstNode.nodeId, "bottom_merged", 0),
      name: "Tag (Yagona)",
      role: "bottom",
      length_mm10: bottomW,
      width_mm10: d,
      thickness_mm10: t,
      grain: resolveGrain("bottom"),
      edges: resolveEdges("bottom", firstNode.cabinetType),
      operations: [...bottomOps],
    });

    let topStyle = profile.defaults.topStyle;
    if (firstNode.cabinetType && profile.byType[firstNode.cabinetType]?.topStyle) {
      topStyle = profile.byType[firstNode.cabinetType]!.topStyle!;
    }
    const override = project.overrides.find(o => o.nodeId === firstNode.nodeId && o.field === "topStyle");
    if (override && typeof override.value === "string") {
      topStyle = override.value as "full" | "stretchers" | "none";
    }

    if (topStyle === "full") {
      resultParts.push({
        id: derivePartId(firstNode.nodeId, "top_merged", 0),
        name: "Tepa (Yagona)",
        role: "top",
        length_mm10: topW,
        width_mm10: d,
        thickness_mm10: t,
        grain: resolveGrain("top"),
        edges: resolveEdges("top", firstNode.cabinetType),
        operations: [...topOps],
      });
    } else if (topStyle === "stretchers") {
      const sw = profile.defaults.stretcherWidth_mm10;
      let stretcherOps: SawGrooveOp[] = [];
      if (backTreatment === "groove") {
        const gw = profile.defaults.back.grooveWidth_mm10;
        const gd = profile.defaults.back.grooveDepth_mm10;
        const gs = profile.defaults.back.grooveSetback_mm10;
        stretcherOps = [{
          op: "saw_groove",
          id: derivePartId(firstNode.nodeId, "groove_stretcher_merged", 0),
          face: "A",
          x_mm10: 0,
          y_mm10: sw - gs,
          endX_mm10: topW,
          endY_mm10: sw - gs,
          width_mm10: gw,
          depth_mm10: gd,
          source: "auto"
        }];
      }

      resultParts.push({
        id: derivePartId(firstNode.nodeId, "stretcher_f_merged", 0),
        name: "Old Tsarga (Yagona)",
        role: "stretcher",
        length_mm10: topW,
        width_mm10: sw,
        thickness_mm10: t,
        grain: resolveGrain("stretcher"),
        edges: resolveEdges("stretcher", firstNode.cabinetType),
        operations: [],
      });
      resultParts.push({
        id: derivePartId(firstNode.nodeId, "stretcher_b_merged", 0),
        name: "Orqa Tsarga (Yagona)",
        role: "stretcher",
        length_mm10: topW,
        width_mm10: sw,
        thickness_mm10: t,
        grain: resolveGrain("stretcher"),
        edges: resolveEdges("stretcher", firstNode.cabinetType),
        operations: [...stretcherOps],
      });
    }

    if (backTreatment !== "none") {
      const backT = profile.material.back_mm10;
      let backW = 0;
      let backH = 0;
      if (backTreatment === "overlay") {
        backW = w;
        backH = sideH; 
      } else if (backTreatment === "groove") {
        const gd = profile.defaults.back.grooveDepth_mm10;
        backW = innerW + 2 * gd;
        backH = innerH + 2 * gd;
      }
      
      resultParts.push({
        id: derivePartId(firstNode.nodeId, "back_merged", 0),
        name: "Orqa (Yagona)",
        role: "back",
        length_mm10: backH, 
        width_mm10: backW,
        thickness_mm10: backT,
        grain: resolveGrain("back"),
        edges: resolveEdges("back", firstNode.cabinetType),
        operations: [],
      });
    }

    if (plinth.style !== "none") {
      const pLen = plinth.placement === "under" ? w : innerW;
      resultParts.push({
        id: derivePartId(firstNode.nodeId, "plinth_f_merged", 0),
        name: "Old Tsokol (Yagona)",
        role: "plinth",
        length_mm10: pLen,
        width_mm10: plinthH,
        thickness_mm10: t,
        grain: resolveGrain("plinth"),
        edges: resolveEdges("plinth", firstNode.cabinetType),
        operations: [],
      });
      if (plinth.style === "box") {
        resultParts.push({
          id: derivePartId(firstNode.nodeId, "plinth_b_merged", 0),
          name: "Orqa Tsokol (Yagona)",
          role: "plinth",
          length_mm10: pLen,
          width_mm10: plinthH,
          thickness_mm10: t,
          grain: resolveGrain("plinth"),
          edges: resolveEdges("plinth", firstNode.cabinetType),
          operations: [],
        });
      }
    }

    if (hasWorktop) {
      const frontOverhang = profile.defaults.worktop?.frontOverhang_mm10 ?? 0;
      const sideOverhang = profile.defaults.worktop?.sideOverhang_mm10 ?? 0;
      resultParts.push({
        id: derivePartId(firstNode.nodeId, "worktop_merged", 0),
        name: "Stoleshnitsa (Yagona)",
        role: "worktop",
        length_mm10: w + 2 * sideOverhang,
        width_mm10: d + frontOverhang,
        thickness_mm10: profile.material.worktop_mm10 ?? 0,
        grain: resolveGrain("worktop"),
        edges: resolveEdges("worktop", firstNode.cabinetType),
        operations: [],
      });
    }
  }

  let totalVolume_m3 = 0;
  for (const part of resultParts) {
    const l = part.length_mm10 / 10000;
    const w = part.width_mm10 / 10000;
    const th = part.thickness_mm10 / 10000;
    totalVolume_m3 += (l * w * th);
  }

  const limitKg = profile.defaults.merge?.limits?.maxWeightKg ?? 150;
  const density = profile.material.density_kg_m3 ?? 700;
  const totalWeightKg = totalVolume_m3 * density;
  
  if (doMerge && totalWeightKg > limitKg) {
    flags.push("EXCEEDS_WEIGHT");
  }

  return { parts: resultParts, flags };
}
