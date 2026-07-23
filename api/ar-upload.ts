// api/ar-upload.ts — M6.1. The one piece of server the karkas editor owns.
//
// WHY IT EXISTS: Google Scene Viewer (the AR path that actually works on the founder's phone, where
// WebXR is closed) will only open a model it can FETCH over HTTPS. A `blob:` or `data:` URL made in the
// browser is invisible to it. So the .glb has to leave the phone for a moment: this endpoint puts it in
// Vercel Blob and hands back a public https:// address, which the Scene Viewer intent then carries.
//
// NO SDK ON PURPOSE: the deploy installs dependencies with `cd apps/app && npm install`, so the repo
// root has no node_modules at build time — importing `@vercel/blob` here would break the production
// build. The Blob upload is one HTTP request, so we send it with `fetch` and touch neither vercel.json
// nor any package.json. The wire format below was read out of @vercel/blob 2.6.1's own dist (it is not
// in the public docs), so it is pinned by BLOB_API_VERSION and verified by test + a real upload.
//
// THE ENDPOINT IS PUBLIC, so every request is filtered before a single byte reaches storage: POST only,
// same-origin, ≤4 MB (Vercel's own function body cap), and the body must actually begin with the glTF
// magic word — otherwise this would be a free file host for anyone who finds the URL.

/** Vercel Blob's private HTTP API — NOT `blob.vercel-storage.com`, which is only where files are served. */
const BLOB_API = "https://vercel.com/api/blob";
/** Pinned wire version (from @vercel/blob 2.6.1). If Vercel ever retires it, uploads fail loudly here. */
const BLOB_API_VERSION = "12";
/** Vercel Functions reject a body over 4.5 MB; a karkas .glb measures ~0.03–0.65 MB, so 4 MB is generous. */
export const AR_MAX_BYTES = 4_000_000;
/** Every .glb starts with the ASCII word "glTF" (glTF 2.0 binary container header). */
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46];

export interface ArUploadRequestInfo {
  method: string;
  /** Browser-sent Origin. Absent is tolerated (some in-app browsers omit it); a MISMATCH is not. */
  origin: string | null;
  /** The host this function is answering on — the only origin allowed to post here. */
  host: string | null;
  contentLength: number | null;
  /** First bytes of the body, for the magic-word check. */
  head: Uint8Array;
}

export type ArUploadCheck = { ok: true } | { ok: false; status: number; message: string };

/** Same host, ignoring scheme/port — a preview deploy and production each talk to their own function. */
function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Everything that can refuse an upload, as one pure function — so the guard is unit-tested without a
 * server, a network or a Vercel account.
 */
export function checkArUpload(info: ArUploadRequestInfo): ArUploadCheck {
  if (info.method !== "POST") return { ok: false, status: 405, message: "Faqat POST" };
  if (info.origin && info.host && !sameHost(info.origin, info.host)) {
    return { ok: false, status: 403, message: "Boshqa saytdan yuborilgan so'rov" };
  }
  if (info.contentLength !== null && info.contentLength > AR_MAX_BYTES) {
    return { ok: false, status: 413, message: "Model juda katta (4 MB dan oshdi)" };
  }
  if (info.head.length < 4 || GLB_MAGIC.some((b, i) => info.head[i] !== b)) {
    return { ok: false, status: 400, message: "Bu .glb fayl emas" };
  }
  return { ok: true };
}

/**
 * A read-write token looks like `vercel_blob_rw_<storeId>_<secret>`; the API wants the store id in its
 * own header (the token alone stopped carrying it once OIDC auth arrived).
 */
export function storeIdFromToken(token: string): string {
  return token.split("_")[3] ?? "";
}

/** `BLOB_STORE_ID` is published as `store_xxx`, while the header wants the bare id. */
export function normalizeStoreId(id: string): string {
  return id.startsWith("store_") ? id.slice("store_".length) : id;
}

export interface BlobAuth { token: string; storeId: string }

/** Just enough of `Headers` to read one value — so tests can pass a plain object. */
export interface HeaderReader { get(name: string): string | null }

/**
 * Which credential this deployment actually has. Connecting a Blob store in the dashboard now hands the
 * project `BLOB_STORE_ID` plus the rotating OIDC credential — measured on THIS project, where no
 * `BLOB_READ_WRITE_TOKEN` was created at all. The long-lived token is still accepted first, so a store
 * connected the older way (or a token pasted by hand) keeps working.
 *
 * THE OIDC TOKEN IS NOT AN ENV VAR IN PRODUCTION. It rides on each request as `x-vercel-oidc-token`;
 * `VERCEL_OIDC_TOKEN` only exists locally (what `vercel env pull` writes). @vercel/oidc reads the header
 * first for exactly this reason, and reading only the env var is what made the live AR button answer
 * "Blob saqlagichi ulanmagan" on the first deploy.
 */
export function resolveBlobAuth(env: Record<string, string | undefined>, headers?: HeaderReader): BlobAuth | null {
  const rw = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (rw) return { token: rw, storeId: storeIdFromToken(rw) };
  const oidc = headers?.get("x-vercel-oidc-token")?.trim() || env.VERCEL_OIDC_TOKEN?.trim();
  const store = env.BLOB_STORE_ID?.trim();
  if (oidc && store) return { token: oidc, storeId: normalizeStoreId(store) };
  return null;
}

/** Which credentials were present, as booleans — no secrets. Diagnosing this blind cost a deploy cycle. */
export function credentialReport(env: Record<string, string | undefined>, headers?: HeaderReader): Record<string, boolean> {
  return {
    BLOB_READ_WRITE_TOKEN: !!env.BLOB_READ_WRITE_TOKEN?.trim(),
    "x-vercel-oidc-token": !!headers?.get("x-vercel-oidc-token")?.trim(),
    VERCEL_OIDC_TOKEN: !!env.VERCEL_OIDC_TOKEN?.trim(),
    BLOB_STORE_ID: !!env.BLOB_STORE_ID?.trim(),
  };
}

/** `PUT /api/blob/?pathname=…` — the exact call @vercel/blob's `put()` makes for a public upload. */
export function blobPutRequest(auth: BlobAuth, pathname: string, contentType: string): { url: string; headers: Record<string, string> } {
  return {
    url: `${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`,
    headers: {
      authorization: `Bearer ${auth.token}`,
      "x-api-version": BLOB_API_VERSION,
      "x-vercel-blob-store-id": auth.storeId,
      "x-vercel-blob-access": "public",
      "x-content-type": contentType,
      // Blob refuses to overwrite an existing pathname, so every upload gets its own name. It also means
      // an address cannot be guessed from the cabinet's name.
      "x-add-random-suffix": "1",
      // The model is only needed while the usta stands in front of the client; an hour of CDN caching is
      // plenty and keeps Scene Viewer's fetch fast on a second look.
      "x-cache-control-max-age": "3600",
    },
  };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(request: Request): Promise<Response> {
    const auth = resolveBlobAuth(process.env, request.headers);
    if (!auth) {
      // The Blob store is not connected to this project yet. Say so plainly — this is a setup step in the
      // Vercel dashboard, not a bug the usta can do anything about. `have` names which credential was
      // missing (booleans only, never a value), so the next fix does not cost another deploy to guess.
      return json(503, { error: "Blob saqlagichi ulanmagan", have: credentialReport(process.env, request.headers) });
    }

    const buf = request.method === "POST" ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array();
    const len = buf.byteLength;
    const check = checkArUpload({
      method: request.method,
      origin: request.headers.get("origin"),
      host: request.headers.get("host") ?? (() => { try { return new URL(request.url).host; } catch { return null; } })(),
      // Trust the bytes we actually received, not the declared header.
      contentLength: len,
      head: buf.subarray(0, 4),
    });
    if (!check.ok) return json(check.status, { error: check.message });

    const put = blobPutRequest(auth, "ar/karkas.glb", "model/gltf-binary");
    const res = await fetch(put.url, { method: "PUT", headers: put.headers, body: buf });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json(502, { error: `Saqlagich rad etdi (${res.status})`, detail: detail.slice(0, 300) });
    }
    const blob = (await res.json()) as { url?: string };
    if (!blob.url) return json(502, { error: "Saqlagich manzil qaytarmadi" });
    return json(200, { url: blob.url, bytes: len });
  },
};
