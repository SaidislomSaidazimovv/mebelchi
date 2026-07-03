// Global thumbnail capture registry.
// The active 3D scene (VariantScene) registers a capture function that returns a small,
// already-downscaled JPEG data-URL (it downscales straight from its WebGL canvas — a
// canvas source draws synchronously, unlike an <img> whose data-URL load is async and
// would draw BLANK). saveCurrent() in the store calls captureThumbnail() when saving.
//
// We also keep the LAST good capture: a save can fire after the user has navigated away
// (the 30s auto-save debounce, or leaving the constructor), by which point the scene is
// unmounted. Returning the cached frame means those saves still get a real image instead
// of nothing.

let _capture: (() => string | null) | null = null;
let _last: string | null = null;

/** Register the active scene's capture callback (call with null to unregister). */
export function registerCapture(fn: (() => string | null) | null): void {
  _capture = fn;
}

/** Remember a freshly captured frame — e.g. from a scene about to unmount — so a save
 *  that fires afterwards still has an image. */
export function cacheThumbnail(dataUrl: string | null): void {
  if (dataUrl) _last = dataUrl;
}

/** The active scene's thumbnail, else the last cached one (so saves after navigating
 *  away still get an image). Null only if nothing has ever been captured this session. */
export function captureThumbnail(): string | null {
  if (_capture) {
    const shot = _capture();
    if (shot) {
      _last = shot;
      return shot;
    }
  }
  return _last;
}
