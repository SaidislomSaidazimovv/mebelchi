// Phase K.2 — saving a from-scratch karkas block into «Mening bloklarim» (as project JSON).
import { describe, it, expect } from "vitest";
import { libraryItemFromKarkas } from "../apps/app/src/model/library.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

describe("Phase K.2 — karkas library entry", () => {
  it("builds a karkas library item (🔧 glyph, carries the project json)", () => {
    const item = libraryItemFromKarkas("Tumba 800", '{"version":1}');
    expect(item.glyph).toBe("🔧");
    expect(item.karkasJson).toBe('{"version":1}');
    expect(item.name).toBe("Tumba 800");
    expect(item.id).toBeTruthy();
    expect(item.cab).toEqual({}); // not a cabinet
  });

  it("a blank name falls back to a default", () => {
    expect(libraryItemFromKarkas("   ", "{}").name).toBe("Karkas blok");
  });

  it("a saved block's json round-trips back into the editor (design → save → reopen)", () => {
    useKarkas.getState().setModel(buildCarcassModel(700, 900, 500));
    useKarkas.getState().add("shelf");
    useKarkas.getState().add("door");
    const designed = useKarkas.getState().parts.length;

    const item = libraryItemFromKarkas("test", useKarkas.getState().exportProject());

    useKarkas.getState().setModel(buildCarcassModel(400, 400, 400)); // clobber (different block)
    expect(useKarkas.getState().parts.length).not.toBe(designed);

    useKarkas.getState().importProject(item.karkasJson!); // re-open from library
    expect(useKarkas.getState().parts.length).toBe(designed);
  });
});
