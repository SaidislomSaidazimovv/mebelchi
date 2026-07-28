import { panelDecomposition } from "./solver/panelDecomposition.js";
import { DesignProject } from "./contracts/design.js";
import { ConstructionProfile } from "./catalogs/profiles.js";

const testProfile: ConstructionProfile = {
  profileId: "TEST_PROFILE",
  name: "Qorasu Test",
  material: { carcass_mm10: 160, back_mm10: 40, front_mm10: 180, worktop_mm10: 380, density_kg_m3: 700 },
  kromka: { slots: { K1: { thickness_mm10: 10 }, K2: { thickness_mm10: 4 } } },
  grain: "L",
  defaults: {
    bottomPlacement: "vkladnoe",
    topStyle: "stretchers",
    stretcherWidth_mm10: 800,
    back: { treatment: "groove", grooveWidth_mm10: 40, grooveDepth_mm10: 60, grooveSetback_mm10: 200 },
    backZone_mm10: 300,
    shelfSetback_mm10: 200,
    plinth: { style: "box", height_mm10: 1000, placement: "under", role: "structural" },
    worktop: { sideOverhang_mm10: 0, frontOverhang_mm10: 200 },
    kromkaByRole: {
      side: { front: "K1", back: "K2", left: null, right: null, top: null, bottom: null },
      bottom: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      top: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      stretcher: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      shelf: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      back: { front: null, back: null, left: null, right: null, top: null, bottom: null },
      worktop: { front: "K1", back: null, left: "K1", right: "K1", top: null, bottom: null },
      door: { front: "K1", back: "K1", left: "K1", right: "K1", top: null, bottom: null },
      divider: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      plinth: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      filler: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
    },
    merge: { allowed: true, strategy: "shared_divider", limits: { maxSheetLength_mm10: 27500, maxSheetWidth_mm10: 18300, maxWeightKg: 150 } },
    grainPolicy: { mode: "lock_all", hiddenRoles: [] }
  },
  byType: {}
};

const testProject: DesignProject = {
  projectId: "PROJ_1",
  name: "Dry Run Test",
  slotBindings: { fasad: "MDF", korpus: "LDSP", orqa: "HDF" },
  overrides: [],
  nodes: [
    {
      nodeId: "CAB_1",
      kind: "cabinet",
      cabinetType: "kitchen_base",
      size: { w_mm10: 6000, h_mm10: 8200, d_mm10: 5600 },
      hasWorktop: true,
      children: [
        { nodeId: "DIV_1", kind: "divider" },
        { nodeId: "SH_1", kind: "shelf" }
      ]
    },
    {
      nodeId: "CAB_2",
      kind: "cabinet",
      cabinetType: "kitchen_base",
      size: { w_mm10: 6000, h_mm10: 8200, d_mm10: 5600 },
      hasWorktop: true,
      children: [
        { nodeId: "SH_2", kind: "shelf" }
      ]
    }
  ]
};

const result = panelDecomposition(testProject, testProfile);
console.log("=== DRY RUN RESULT ===");
console.log("Flags:", result.flags.length > 0 ? result.flags.join(", ") : "None");
console.log("Total Parts:", result.parts.length);
console.log("------------------------");
result.parts.forEach(p => {
  console.log(`[${p.id}] ${p.name.padEnd(20)} (${p.role.padEnd(10)}) | ${String(p.length_mm10).padStart(4)} x ${String(p.width_mm10).padStart(4)} x ${String(p.thickness_mm10).padStart(3)} | Ops: ${p.operations.length}`);
});
console.log("========================");
