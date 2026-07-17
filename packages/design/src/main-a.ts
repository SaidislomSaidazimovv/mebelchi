// Variant A entry point. Phase 0.1 — skeleton only; the shared core and this
// variant's interaction layer arrive in later steps. Kept minimal so the 3-bundle
// build is provable now.
const el = document.createElement("div");
el.style.cssText = "color:#e8ecec;font:600 18px system-ui;position:fixed;inset:0;display:grid;place-content:center;text-align:center";
el.textContent = "Variant A — skelet tayyor (Bosqich 0.1)";
document.body.appendChild(el);

export {};
