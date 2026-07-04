// Phase D1 — project karkas-block list (separate from the kitchen `cabs`, so isolated + safe).
import { describe, it, expect } from "vitest";
import { useStore } from "../apps/app/src/store.js";

describe("Phase D1 — projectBlocks", () => {
  it("add / remove manage the project's karkas-block list", () => {
    useStore.setState({ projectBlocks: [] });
    useStore.getState().addProjectBlock("Tumba", '{"version":1,"model":{"blocks":[]}}');
    useStore.getState().addProjectBlock("Shkaf", '{"version":1,"model":{"blocks":[]}}');
    expect(useStore.getState().projectBlocks.length).toBe(2);
    expect(useStore.getState().projectBlocks.map((b) => b.name)).toEqual(["Tumba", "Shkaf"]);

    const firstId = useStore.getState().projectBlocks[0]!.id;
    useStore.getState().removeProjectBlock(firstId);
    expect(useStore.getState().projectBlocks.length).toBe(1);
    expect(useStore.getState().projectBlocks[0]!.name).toBe("Shkaf");
  });

  it("adding does not touch the kitchen cabinets (isolation)", () => {
    useStore.setState({ projectBlocks: [], cabs: [] });
    useStore.getState().addProjectBlock("X", "{}");
    expect(useStore.getState().cabs.length).toBe(0); // kitchen flow untouched
  });
});
