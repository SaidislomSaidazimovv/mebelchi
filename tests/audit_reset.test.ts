// Audit fix (2026-07-09) — loading a project must reset the FULL edit context: the redo stack (`future`,
// else redo restores the previous project → data loss) and the manufacturing `exportOverride` (else block
// A's "master override" leaks to block B and its unreviewed joint findings ship silently).
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

describe("Audit — openWith/importProject reset override + redo", () => {
  it("a fresh openWith clears exportOverride and the redo stack", () => {
    const st = useKarkas.getState();
    st.openWith(buildCarcassModel(600, 720, 560));
    st.setExportOverride(true);
    st.resize("w", 800);
    st.undo(); // builds a redo (future) stack
    expect(useKarkas.getState().exportOverride).toBe(true);
    expect(useKarkas.getState().canRedo()).toBe(true);

    useKarkas.getState().openWith(buildCarcassModel(400, 400, 400));
    expect(useKarkas.getState().exportOverride).toBe(false); // override didn't leak
    expect(useKarkas.getState().canRedo()).toBe(false); // no stale redo into the old project
  });

  it("importProject also clears exportOverride and the redo stack", () => {
    const st = useKarkas.getState();
    st.openWith(buildCarcassModel(600, 720, 560));
    const json = st.exportProject();
    useKarkas.getState().setExportOverride(true);
    useKarkas.getState().resize("w", 500);
    useKarkas.getState().undo(); // future stack from the OLD project
    useKarkas.getState().importProject(json);
    expect(useKarkas.getState().exportOverride).toBe(false);
    expect(useKarkas.getState().canRedo()).toBe(false); // redo can't resurrect the pre-import model
  });
});
