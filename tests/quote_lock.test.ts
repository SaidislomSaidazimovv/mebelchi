// Step 11 — the approved-quote lock (client sign-off) persists through the project file: lock a total,
// save, load into a fresh state → the locked quote comes back. A new block starts unlocked.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

describe("Step 11 — approved-quote lock", () => {
  it("locks a total, persists it in the file, and restores it on load", () => {
    useKarkas.getState().openWith(buildCarcassModel(600, 720, 560));
    expect(useKarkas.getState().lockedQuote).toBeNull(); // fresh block → unlocked

    useKarkas.getState().lockQuote(1234567);
    expect(useKarkas.getState().lockedQuote?.total).toBe(1234567);
    const json = useKarkas.getState().exportProject();

    useKarkas.getState().setModel(buildCarcassModel(400, 400, 400)); // a new model clears the lock
    expect(useKarkas.getState().lockedQuote).toBeNull();

    useKarkas.getState().importProject(json); // reload the saved project
    expect(useKarkas.getState().lockedQuote?.total).toBe(1234567); // approved quote came back

    useKarkas.getState().unlockQuote();
    expect(useKarkas.getState().lockedQuote).toBeNull();
  });
});
