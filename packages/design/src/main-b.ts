// Variant B — tap-then-numpad. Tap to select (shared core), TYPE the size on the
// on-screen numpad; the action bar adds shelves/dividers/door and does undo/redo —
// the SAME shared core as Variant A. Only the resize gesture differs (type vs drag).
import { startApp } from "./core/app.ts";
import { createActionBar } from "./core/actionbar.ts";
import { wireNumpadB } from "./variants/b-numpad/numpad.ts";

const app = startApp();
app.onDispose(createActionBar(app));
app.onDispose(wireNumpadB(app));
