// three/arLink.ts — M6.2. The Scene Viewer link, kept apart from karkasAr.ts on purpose: it is pure
// string work with no three.js, no WebGL and no DOM, so it can be unit-tested in plain Node. One wrong
// character in this URL shows up as "nothing happens" on a phone we do not have in the room, which is
// exactly the kind of failure a test has to catch instead of the usta.

/** Google's Scene Viewer ships inside the Google app — present on virtually every Android phone. */
export const SCENE_VIEWER_PACKAGE = "com.google.android.googlequicksearchbox";

/** Scene Viewer exists only on Android; iOS wants a .usdz through Quick Look (not built yet). */
export function isAndroid(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /android/i.test(ua);
}

/**
 * Build the `intent://` URL that hands a hosted .glb to Scene Viewer (format per
 * developers.google.com/ar/develop/scene-viewer).
 *
 * `resizable=false` is deliberate: Scene Viewer lets the user pinch-scale by default, and a client who
 * shrinks the wardrobe until it "fits" has been shown a lie — the whole point of AR here is that 1 m is
 * 1 m. `fallbackUrl` is where the browser lands if the Google app is missing or too old: our own page,
 * which still offers the .glb download.
 */
export function sceneViewerUrl(fileUrl: string, title: string, fallbackUrl: string): string {
  const params = new URLSearchParams({
    file: fileUrl,
    mode: "ar_preferred",
    title: title.slice(0, 60), // Scene Viewer truncates past 60 chars anyway
    resizable: "false",
  });
  const intent = [
    "scheme=https",
    `package=${SCENE_VIEWER_PACKAGE}`,
    "action=android.intent.action.VIEW",
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`,
    "end",
  ].join(";");
  return `intent://arvr.google.com/scene-viewer/1.0?${params.toString()}#Intent;${intent};`;
}
