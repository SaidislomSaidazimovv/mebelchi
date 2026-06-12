// Session 4 — catalog schema extension (doc 17 sequence step 1).
// grade / source / verified / media / packVersion on every SKU-bearing spec type.
// Additive only: the pre-existing dummy catalog must load unchanged, and the new
// fields must typecheck. No behavior change anywhere.

import { describe, expect, it } from "vitest";

import { loadHardwareSpec } from "../engine/catalogs/hardwareSpec.js";
import type {
  CatalogMeta,
  ConnectorSpec,
  HingeSpec,
  SkuGrade,
  SkuMedia,
} from "../engine/primitives/types.js";

describe("catalog schema extension — additive, no behavior change", () => {
  it("the existing dummy catalog still loads and typechecks", () => {
    const spec = loadHardwareSpec();
    // Old required provenance fields are intact; unverified entries stay false.
    expect(spec.connectors.DUMMY_RASTEX_15!.verified).toBe(false);
    expect(spec.connectors.DUMMY_RASTEX_15!.source).toContain("CONFIRM");
    // New fields are optional: absent on legacy entries, present on the verified hinge.
    expect(spec.connectors.DUMMY_RASTEX_15!.grade).toBeUndefined();
    expect(spec.connectors.DUMMY_RASTEX_15!.packVersion).toBeUndefined();
    expect(spec.hinges.DUMMY_CUP_110!.verified).toBe(true);
    expect(spec.hinges.DUMMY_CUP_110!.grade).toBe("manufacturing");
  });

  it("a fully-annotated SKU typechecks (compile-time assertion)", () => {
    const media: SkuMedia = {
      image: "sha256:abc123",
      drawing: "sha256:def456",
    };
    const annotated: HingeSpec = {
      brand: "GTV",
      verified: true,
      source: "GTV Furniture Accessories 2025, p.412",
      grade: "manufacturing",
      media,
      packVersion: "gtv@2025.06",
      cup: { diameter: 35, depth: 13 },
      cupCenterFromDoorEdge: 21.5,
      satelliteMarks: { count: 2, diameter: 3, depth: 1, alongFromCupCenter: 26, beyondCupFromEdge: 5.5 },
    };
    expect(annotated.grade).toBe("manufacturing");

    // The grade union is closed: only "browse" | "manufacturing".
    // @ts-expect-error — invalid grade value must not compile
    const bad: SkuGrade = "premium";
    void bad;

    // CatalogMeta is the shared shape across all spec types.
    const meta: CatalogMeta = annotated;
    const connectorMeta: CatalogMeta = {
      verified: false,
      source: "research",
      grade: "browse",
    } satisfies Partial<ConnectorSpec> as CatalogMeta;
    expect(meta.packVersion).toBe("gtv@2025.06");
    expect(connectorMeta.grade).toBe("browse");
  });

  it("browse-grade SKUs carry no claim of drilling truth (doc 17 §2 invariant, as data)", () => {
    // The safety line is semantic: grade "manufacturing" requires verified true.
    // Encode the expectation the compiler can't: a helper the future compiler step uses.
    const mayDriveDrilling = (m: CatalogMeta) => m.grade === "manufacturing" && m.verified;
    expect(mayDriveDrilling({ verified: false, source: "bulk import", grade: "browse" })).toBe(false);
    expect(mayDriveDrilling({ verified: false, source: "bulk import", grade: "manufacturing" })).toBe(false);
    expect(mayDriveDrilling({ verified: true, source: "datasheet p.7", grade: "manufacturing" })).toBe(true);
  });
});
