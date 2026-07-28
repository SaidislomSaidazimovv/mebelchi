import { Part, PartRole } from "./types";
import { Panel } from "./block";
import { DesignProject } from "./contracts/design";
import { ConstructionProfile } from "./catalogs/profiles";

/**
 * 2-BOSQICH: 3D Layout Adapter
 * Ushbu funksiya Engine'dan chiqadigan toza (fizik) Part[] ro'yxatini oladi
 * va ularni 3D sahnada chizish uchun x, y, z koordinatalarini hisoblaydi.
 */
export function adaptPartsToPanels(
  parts: Part[],
  project: DesignProject,
  profile: ConstructionProfile
): Panel[] {
  const panels: Panel[] = [];
  const t = profile.material.carcass_mm10 ?? 160;
  const plinthH = profile.defaults.plinth?.style === "none" ? 0 : (profile.defaults.plinth?.height_mm10 ?? 0);
  const backZone = profile.defaults.backZone_mm10 ?? 0;
  
  // Asosiy shkaf o'lchamlarini topib olamiz (hozircha 1-shkaf asosida)
  const cabW = project.nodes[0]?.kind === "cabinet" ? project.nodes[0].size.w_mm10 : 6000;
  const cabD = project.nodes[0]?.kind === "cabinet" ? project.nodes[0].size.d_mm10 : 5600;
  const cabH = project.nodes[0]?.kind === "cabinet" ? project.nodes[0].size.h_mm10 : 7200;

  parts.forEach(p => {
    let x = 0, y = 0, z = 0;
    let w = p.width_mm10;
    let h = p.length_mm10;
    let d = p.thickness_mm10;

    // 1. ORIENTATSIYA (Role bo'yicha aylantirish)
    if (p.role === "side" || p.role === "divider") {
      // Yon devorlar va bo'lgichlar vertikal turadi
      w = p.thickness_mm10;
      h = p.length_mm10;  // Balandligi
      d = p.width_mm10;   // Chuqurligi
    } else if (p.role === "bottom" || p.role === "top" || p.role === "shelf" || p.role === "worktop" || p.role === "stretcher") {
      // Yotuvchi panellar
      w = p.length_mm10;    // Eni
      h = p.thickness_mm10; // Qalinligi
      d = p.width_mm10;     // Chuqurligi
    } else if (p.role === "back") {
      // Orqa devor
      w = p.width_mm10;
      h = p.length_mm10;
      d = p.thickness_mm10;
    } else if (p.role === "plinth") {
      // Tsokol
      w = p.length_mm10;
      h = p.width_mm10; // 100mm
      d = p.thickness_mm10;
    }

    // 2. JOYLASHUV (ID dagi ma'lumotlarga qarab x,y,z ni topamiz)
    const partsStr = p.id.split("_");
    const subIndex = parseInt(partsStr[partsStr.length - 1] || "0", 10);
    
    // Qoidalar va hisob-kitoblar
    const placement = project.overrides.find(o => o.nodeId === "CAB_1" && o.field === "bottomPlacement")?.value || profile.defaults.bottomPlacement;
    const dividersCount = project.nodes[0]?.children?.filter(c => c.kind === "divider").length ?? 0;
    const shelvesCount = project.nodes[0]?.children?.filter(c => c.kind === "shelf").length ?? 0;
    const numCompartments = dividersCount + 1;
    const innerW = cabW - (placement === "nakladnoe" ? 2 * t : 2 * t);
    const exactW = (innerW - dividersCount * t) / numCompartments;
    
    let sideH = cabH - (project.nodes[0]?.hasWorktop ? profile.material.worktop_mm10 ?? 0 : 0);
    if (profile.defaults.plinth?.placement === "under") sideH -= plinthH;
    
    const innerH = profile.defaults.plinth?.placement === "between" ? sideH - plinthH - 2 * t : sideH - 2 * t;
    if (placement === "nakladnoe") sideH -= t;

    // YON DEVORLAR VA BO'LGICHLAR
    if (p.id.includes("side_l")) {
      x = 0; 
      y = placement === "nakladnoe" ? plinthH + t : plinthH;
      z = 0;
    } else if (p.id.includes("side_r")) {
      x = cabW - t; 
      y = placement === "nakladnoe" ? plinthH + t : plinthH;
      z = 0;
    } else if (p.role === "divider" && !p.id.includes("shared_divider")) {
      const compartmentIndex = subIndex;
      x = t + exactW * (compartmentIndex + 1) + t * compartmentIndex;
      y = plinthH + t;
      z = 0;
    }

    // GORIZONTAL PANELLAR
    if (p.role === "bottom") {
      x = placement === "nakladnoe" ? 0 : t;
      y = plinthH;
      z = 0;
    } else if (p.role === "top") {
      x = t; 
      y = cabH - (project.nodes[0]?.hasWorktop ? profile.material.worktop_mm10 ?? 0 : 0) - h;
      z = 0;
    } else if (p.role === "shelf") {
      const shelfNodeIndex = Math.floor(subIndex / numCompartments);
      const compartmentIndex = subIndex % numCompartments;
      x = t + exactW * compartmentIndex + t * compartmentIndex;
      const exactH = innerH / (shelvesCount + 1);
      y = plinthH + t + exactH * (shelfNodeIndex + 1) - h / 2;
      z = profile.defaults.shelfSetback_mm10 ?? 0;
    } else if (p.role === "worktop") {
      x = 0; y = cabH - h; z = 0;
    }

    // TSARGALAR
    if (p.role === "stretcher") {
      x = t;
      y = cabH - (project.nodes[0]?.hasWorktop ? profile.material.worktop_mm10 ?? 0 : 0) - h;
      if (p.id.includes("stretcher_f")) {
        z = 0;
      } else {
        z = cabD - backZone - d;
      }
    }

    // TSOKOLLAR
    if (p.role === "plinth") {
      if (p.id.includes("plinth_f")) {
        x = 0; y = 0; z = 500;
      } else {
        x = 0; y = 0; z = cabD - 500 - d;
      }
    }

    // ORQA PANEL
    if (p.role === "back") {
      const backTreatment = profile.defaults.back.treatment;
      if (backTreatment === "overlay") {
        x = 0;
        y = placement === "nakladnoe" ? plinthH + t : plinthH;
        z = cabD;
      } else {
        x = t / 2; 
        y = plinthH + t / 2;
        z = cabD - backZone;
      }
    }

    panels.push({
      id: p.id,
      name: p.name,
      role: p.role as any,
      x,
      y,
      z,
      width: w,
      height: h,
      depth: d,
      material: p.role === "back" ? "hdf" : "ldsp",
      bands: p.edges
    });
  });

  return panels;
}
