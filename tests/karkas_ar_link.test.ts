// M6.2 — the Scene Viewer link. This string is the whole AR fallback: it is what a phone with a closed
// WebXR (the founder's) actually opens. We cannot debug it on that phone from here, and a malformed
// intent fails SILENTLY — the tap just does nothing — so every part of the format is pinned here.

import { describe, it, expect } from "vitest";

import { isAndroid, sceneViewerUrl, SCENE_VIEWER_PACKAGE } from "../apps/app/src/three/arLink.js";

const GLB = "https://xyz.public.blob.vercel-storage.com/ar/karkas-a1b2.glb";
const PAGE = "https://mebelchi.vercel.app/#karkas";
const url = (): string => sceneViewerUrl(GLB, "Karkas blok", PAGE);

describe("M6.2 — the intent Scene Viewer understands", () => {
  it("addresses Scene Viewer 1.0 over the intent scheme", () => {
    expect(url().startsWith("intent://arvr.google.com/scene-viewer/1.0?")).toBe(true);
  });

  it("ends with the Intent block, terminated by `end;` — an unterminated intent does nothing at all", () => {
    expect(url().endsWith(";end;")).toBe(true);
    expect(url()).toContain("#Intent;scheme=https;");
    expect(url()).toContain("action=android.intent.action.VIEW");
  });

  it("targets the Google app, not ARCore (ARCore only launches the engine, not the viewer)", () => {
    expect(SCENE_VIEWER_PACKAGE).toBe("com.google.android.googlequicksearchbox");
    expect(url()).toContain(`package=${SCENE_VIEWER_PACKAGE};`);
  });

  it("asks for the camera straight away (ar_preferred), not the 3D turntable", () => {
    expect(url()).toContain("mode=ar_preferred");
  });

  it("forbids resizing — a client must not pinch the wardrobe down until it 'fits'", () => {
    expect(url()).toContain("resizable=false");
  });

  it("carries the model URL escaped, so its own ?query cannot leak into the intent", () => {
    const signed = `${GLB}?token=abc&x=1`;
    const built = sceneViewerUrl(signed, "Karkas blok", PAGE);
    expect(built).toContain(`file=${encodeURIComponent(signed)}`);
    expect(built).not.toContain("&x=1&mode="); // not spliced in as separate params
  });

  it("falls back to our own page when the Google app is missing or too old", () => {
    expect(url()).toContain(`S.browser_fallback_url=${encodeURIComponent(PAGE)}`);
  });

  it("truncates the title to the 60 chars Scene Viewer keeps", () => {
    const long = "Oshxona uchun juda uzun nomli katta burchakli shkaf va tokchalar to'plami";
    const built = sceneViewerUrl(GLB, long, PAGE);
    const title = new URLSearchParams(built.slice(built.indexOf("?") + 1, built.indexOf("#"))).get("title");
    expect(title).toBe(long.slice(0, 60));
  });
});

describe("M6.2 — who gets the Scene Viewer path", () => {
  it("an Android phone does", () => {
    expect(isAndroid("Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(true);
  });

  it("an iPhone does not (it needs .usdz / Quick Look, which we have not built)", () => {
    expect(isAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });

  it("a desktop does not", () => {
    expect(isAndroid("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe(false);
  });
});
