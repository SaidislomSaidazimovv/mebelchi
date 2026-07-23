// M6.1 — the AR upload endpoint's guard. The endpoint is PUBLIC (Scene Viewer must be able to fetch the
// model, so nothing about it can sit behind a login), which makes the guard the only thing between the
// founder's Blob store and anyone who finds the URL. Every refusal is pinned here, plus the exact wire
// format of the Blob PUT — that one was read out of @vercel/blob's dist rather than any public doc, so a
// silent change on Vercel's side has to break a test, not the usta's AR button.

import { describe, it, expect } from "vitest";

import { AR_MAX_BYTES, blobPutRequest, checkArUpload, credentialReport, normalizeStoreId, resolveBlobAuth, storeIdFromToken } from "../api/ar-upload.js";

/** A body that starts like a real .glb ("glTF" + version + length), padded to `n` bytes. */
const glb = (n = 32): Uint8Array => {
  const b = new Uint8Array(n);
  b.set([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
  return b;
};

const req = (o: Partial<Parameters<typeof checkArUpload>[0]> = {}) =>
  checkArUpload({
    method: "POST",
    origin: "https://mebelchi.vercel.app",
    host: "mebelchi.vercel.app",
    contentLength: 32,
    head: glb(),
    ...o,
  });

describe("M6.1 — a real AR upload gets through", () => {
  it("POST from our own page with a .glb body is accepted", () => {
    expect(req()).toEqual({ ok: true });
  });

  it("a preview deployment is its own origin and works too", () => {
    const host = "mebelchi-git-feat-karkas-engine-port-x.vercel.app";
    expect(req({ host, origin: `https://${host}` })).toEqual({ ok: true });
  });

  it("a missing Origin is tolerated — some in-app browsers omit it, and the usta must not be locked out", () => {
    expect(req({ origin: null })).toEqual({ ok: true });
  });
});

describe("M6.1 — the guard refuses what it must", () => {
  it("GET cannot upload (405)", () => {
    const r = req({ method: "GET" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.status).toBe(405);
  });

  it("another site posting here is refused (403) — not a free file host", () => {
    const r = req({ origin: "https://evil.example.com" });
    expect(r.ok === false && r.status).toBe(403);
  });

  it("a body over 4 MB is refused (413) before it reaches storage", () => {
    const r = req({ contentLength: AR_MAX_BYTES + 1 });
    expect(r.ok === false && r.status).toBe(413);
  });

  it("exactly at the limit is still fine (the cap is a ceiling, not a trap)", () => {
    expect(req({ contentLength: AR_MAX_BYTES })).toEqual({ ok: true });
  });

  it("a PNG renamed .glb is refused (400) — the magic word is checked, not the name", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const r = req({ head: png });
    expect(r.ok === false && r.status).toBe(400);
  });

  it("an empty body is refused (400)", () => {
    const r = req({ head: new Uint8Array(), contentLength: 0 });
    expect(r.ok === false && r.status).toBe(400);
  });
});

describe("M6.1 — which credential the deployment uses", () => {
  // Measured on this very project (2026-07-23): connecting a Blob store in the dashboard created
  // BLOB_STORE_ID but NO BLOB_READ_WRITE_TOKEN — Vercel now authenticates functions with the rotating
  // VERCEL_OIDC_TOKEN. Both shapes must work, or AR breaks depending on how the store was set up.
  it("prefers a long-lived read-write token when one exists", () => {
    const auth = resolveBlobAuth({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_STORE123_secret", BLOB_STORE_ID: "store_OTHER", VERCEL_OIDC_TOKEN: "oidc" });
    expect(auth).toEqual({ token: "vercel_blob_rw_STORE123_secret", storeId: "STORE123" });
  });

  it("falls back to OIDC + store id — how this project is actually configured", () => {
    expect(resolveBlobAuth({ VERCEL_OIDC_TOKEN: "oidc.jwt", BLOB_STORE_ID: "store_ubZcVsKW" }))
      .toEqual({ token: "oidc.jwt", storeId: "ubZcVsKW" });
  });

  // THE LIVE BUG (2026-07-23): the first production deploy answered «Blob saqlagichi ulanmagan» because
  // VERCEL_OIDC_TOKEN is NOT an env var on Vercel — the credential rides on each request as
  // `x-vercel-oidc-token` (the env var only exists locally, via `vercel env pull`).
  it("takes the OIDC token from the request header — where production actually puts it", () => {
    const headers = new Headers({ "x-vercel-oidc-token": "header.jwt" });
    expect(resolveBlobAuth({ BLOB_STORE_ID: "store_ubZcVsKW" }, headers))
      .toEqual({ token: "header.jwt", storeId: "ubZcVsKW" });
  });

  it("the header wins over a stale pulled env token", () => {
    const headers = new Headers({ "x-vercel-oidc-token": "fresh.jwt" });
    expect(resolveBlobAuth({ VERCEL_OIDC_TOKEN: "stale.jwt", BLOB_STORE_ID: "store_x" }, headers)?.token).toBe("fresh.jwt");
  });

  it("a header token without a store id is still no credential", () => {
    expect(resolveBlobAuth({}, new Headers({ "x-vercel-oidc-token": "header.jwt" }))).toBeNull();
  });

  it("strips the store_ prefix the dashboard publishes", () => {
    expect(normalizeStoreId("store_ubZcVsKW")).toBe("ubZcVsKW");
    expect(normalizeStoreId("ubZcVsKW")).toBe("ubZcVsKW");
  });

  it("an OIDC token WITHOUT a store id is no credential at all (the header would be empty)", () => {
    expect(resolveBlobAuth({ VERCEL_OIDC_TOKEN: "oidc.jwt" })).toBeNull();
  });

  it("nothing configured → null, so the endpoint can say «Blob ulanmagan» instead of failing blindly", () => {
    expect(resolveBlobAuth({})).toBeNull();
  });

  it("the failure report names what was missing and NEVER leaks a value", () => {
    const report = credentialReport({ BLOB_STORE_ID: "store_x", BLOB_READ_WRITE_TOKEN: "" }, new Headers());
    expect(report).toEqual({
      BLOB_READ_WRITE_TOKEN: false,
      "x-vercel-oidc-token": false,
      VERCEL_OIDC_TOKEN: false,
      BLOB_STORE_ID: true,
    });
    expect(Object.values(report).every((v) => typeof v === "boolean")).toBe(true);
  });
});

describe("M6.1 — the Blob PUT is byte-for-byte what the SDK sends", () => {
  const TOKEN = "vercel_blob_rw_STORE123_secretsecret";
  const AUTH = { token: TOKEN, storeId: "STORE123" };

  it("the store id is the 4th underscore segment of the token", () => {
    expect(storeIdFromToken(TOKEN)).toBe("STORE123");
  });

  it("goes to vercel.com/api/blob (NOT blob.vercel-storage.com, which only serves files)", () => {
    const { url } = blobPutRequest(AUTH, "ar/karkas.glb", "model/gltf-binary");
    expect(url).toBe("https://vercel.com/api/blob/?pathname=ar%2Fkarkas.glb");
  });

  it("carries the pinned api version, the store id, public access and the content type", () => {
    const { headers } = blobPutRequest(AUTH, "ar/karkas.glb", "model/gltf-binary");
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["x-api-version"]).toBe("12");
    expect(headers["x-vercel-blob-store-id"]).toBe("STORE123");
    expect(headers["x-vercel-blob-access"]).toBe("public");
    expect(headers["x-content-type"]).toBe("model/gltf-binary");
  });

  it("asks for a random suffix — two ustas uploading at once must not collide or overwrite", () => {
    expect(blobPutRequest(AUTH, "ar/karkas.glb", "model/gltf-binary").headers["x-add-random-suffix"]).toBe("1");
  });
});
