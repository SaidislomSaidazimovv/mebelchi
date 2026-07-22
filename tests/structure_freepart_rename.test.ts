// M1.3a — renameFreePart: a free board's name is user-editable, and the new name flows through
// solveStructure → freePartToPart → the cut-list part (and thus the Details panel + SWJ008 export).
// Store-level only (a name has no geometry), undoable, blank falls back to a default.

import { describe, it, expect } from "vitest";

import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildStool } from "../engine/structure/demoModel.js";

const seatPart = () => useKarkas.getState().parts.find((p) => p.id.endsWith("__free_top"))!;

describe("M1.3a — renameFreePart", () => {
  it("renames a free board; the new name reaches the cut-list part", () => {
    useKarkas.getState().setModel(buildStool());
    useKarkas.getState().renameFreePart("top", "Mening o'rindig'im");
    expect(seatPart().name).toBe("Mening o'rindig'im");
  });

  it("only the target board changes — a leg keeps its name", () => {
    useKarkas.getState().setModel(buildStool());
    useKarkas.getState().renameFreePart("top", "O'rindiq");
    const leg = useKarkas.getState().parts.find((p) => p.id.endsWith("__free_leg_fl"))!;
    expect(leg.name).toBe("Ножка"); // untouched
  });

  it("a blank name falls back to a default (never a nameless part)", () => {
    useKarkas.getState().setModel(buildStool());
    useKarkas.getState().renameFreePart("top", "   ");
    expect(seatPart().name).toBe("Деталь");
  });

  it("rename is undoable", () => {
    useKarkas.getState().setModel(buildStool());
    const before = seatPart().name;
    useKarkas.getState().renameFreePart("top", "X");
    expect(seatPart().name).toBe("X");
    useKarkas.getState().undo();
    expect(seatPart().name).toBe(before);
  });
});
