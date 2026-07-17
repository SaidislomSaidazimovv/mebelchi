// Variant A — direct-manipulation handles. Tap to select, then grab the cabinet
// and drag to resize (the right edge follows your finger).
import { startApp } from "./core/app.ts";
import { wireResizeA } from "./variants/a-handles/resize.ts";

const app = startApp();
app.onDispose(wireResizeA(app)); // register the resize unbind for teardown
