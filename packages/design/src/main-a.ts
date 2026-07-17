// Variant A — direct-manipulation handles. Tap to select, grab to resize; the
// action bar adds shelves/dividers/door to the selected cabinet.
import { startApp } from "./core/app.ts";
import { wireResizeA } from "./variants/a-handles/resize.ts";
import { createActionBar } from "./core/actionbar.ts";

const app = startApp();
app.onDispose(wireResizeA(app));
app.onDispose(createActionBar(app));
