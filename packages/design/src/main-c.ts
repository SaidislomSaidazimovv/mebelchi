// Variant C — line/seam dragging. Tap to select (shared core), then DRAG a seam:
// an inner seam (divider) re-flows the compartments, an outer seam (side) resizes the
// cabinet. The action bar adds shelves/dividers/door and does undo/redo — the SAME
// shared core as Variants A and B. Only the edit gesture differs (drag a line).
import { startApp } from "./core/app.ts";
import { createActionBar } from "./core/actionbar.ts";
import { wireSeamC } from "./variants/c-seam/seam.ts";

const app = startApp();
app.onDispose(createActionBar(app));
app.onDispose(wireSeamC(app));
