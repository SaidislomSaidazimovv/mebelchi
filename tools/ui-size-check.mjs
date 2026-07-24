// U11.6 — the mobile-UI size gate. `npm run test:ui`
//
// The 2026-07-24 audit found the selected-part bar needing 1252 px inside a 351 px phone, and 117 tap
// targets under the 44 px minimum. None of it turned a unit test red, because none of it is arithmetic —
// it is layout. This walks the real app on three real phone sizes and fails the build on the two things
// that broke: something wider than the screen, or something too small to hit with a finger.
//
// It is NOT part of `npm test` on purpose: it needs a browser and a dev server, and the 1204 unit tests
// have to stay a two-second loop.
//
// Usage:  npm run dev -- --port 5199 --strictPort     (in one terminal)
//         npm run test:ui                              (in another)
import puppeteer from "puppeteer-core";

const URL = process.env.UI_URL ?? "http://localhost:5199/#karkas";
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MIN_TAP = 44; // Apple HIG / Material both land here

const DEVICES = [
  { name: "iPhone-SE", w: 375, h: 667 },  // the smallest phone still in real use — the hardest case
  { name: "Android-M", w: 393, h: 851 },
  { name: "iPhone-Pro", w: 430, h: 932 },
];

/** Selectors we own and therefore hold to the tap-target rule. Third-party/native widgets are exempt. */
const OURS = ".mob-round, .mob-iconbtn, .mob-unit, .mob-x, .mob-props-toggle, .mob-selbar__more, .mob-modeseg__b, .mob-addbtn, .mob-gbtn";

const MEASURE = (minTap, ours) => {
  const VW = window.innerWidth;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
  const name = (e) => `${e.tagName.toLowerCase()}${typeof e.className === "string" && e.className ? "." + e.className.split(" ").filter(Boolean)[0] : ""}` +
    (((e.textContent || "").trim()) ? ` «${(e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22)}»` : "");
  const all = [...document.querySelectorAll("body *")].filter(vis);
  return {
    // 1 — nothing may stick out past either edge of the screen
    offscreen: all.filter((e) => { const r = e.getBoundingClientRect();
      return (r.right > VW + 1 || r.left < -1) && r.width <= VW * 1.6; })
      .map((e) => ({ el: name(e), right: Math.round(e.getBoundingClientRect().right), vw: VW })),
    // 2 — no bar of ours may need sideways scrolling to reach its controls
    scrollsX: all.filter((e) => e.scrollWidth > e.clientWidth + 4 && e.clientWidth > 60 && /^mob-/.test(String(e.className)))
      .map((e) => ({ el: name(e), need: e.scrollWidth, have: e.clientWidth })),
    // 3 — every control of ours must be reachable with a finger
    tiny: [...document.querySelectorAll(ours)].filter(vis)
      .map((e) => { const r = e.getBoundingClientRect(); return { el: name(e), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.h < minTap || x.w < minTap),
  };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (p, re, ms = 500) => {
  const ok = await p.evaluate((s) => { const r = new RegExp(s);
    const el = [...document.querySelectorAll("button,[role=button]")].find((x) =>
      r.test((x.textContent || "").trim()) || r.test(x.getAttribute("title") || "") || r.test(x.getAttribute("aria-label") || ""));
    if (el) { el.click(); return true; } return false; }, re);
  await wait(ms); return ok;
};

const STATES = [
  { id: "rest", label: "hech narsa tanlanmagan", run: async () => {} },
  { id: "carcass", label: "karkas taxtasi tanlangan", run: async (p) => {
      await p.evaluate(() => window.__karkas.getState().tapPart("blk_main__side_l")); await wait(600); } },
  { id: "carcass-sheet", label: "karkas taxtasi + ⋮ varaq", run: async (p) => {
      await p.evaluate(() => window.__karkas.getState().tapPart("blk_main__side_l")); await wait(500);
      await click(p, "Boshqa amallar", 600); } },
  { id: "free", label: "erkin qism tanlangan", run: async (p) => {
      await p.evaluate(() => window.__karkas.getState().addFreeBoard("board")); await wait(400);
      await p.evaluate(() => { const s = window.__karkas.getState(); const f = s.model.blocks[0].freeParts.at(-1);
        s.tapPart(`blk_main__free_${f.id}`); }); await wait(600); } },
  { id: "free-size", label: "erkin qism · o'lcham rejimi", run: async (p) => {
      await p.evaluate(() => window.__karkas.getState().addFreeBoard("board")); await wait(400);
      await p.evaluate(() => { const s = window.__karkas.getState(); const f = s.model.blocks[0].freeParts.at(-1);
        s.tapPart(`blk_main__free_${f.id}`); }); await wait(500);
      await click(p, "O'lcham", 500); } },
  { id: "free-sheet", label: "erkin qism + ⋮ varaq", run: async (p) => {
      await p.evaluate(() => window.__karkas.getState().addFreeBoard("board")); await wait(400);
      await p.evaluate(() => { const s = window.__karkas.getState(); const f = s.model.blocks[0].freeParts.at(-1);
        s.tapPart(`blk_main__free_${f.id}`); }); await wait(500);
      await click(p, "Boshqa amallar", 600); } },
  { id: "add", label: "«Qo'shish» varag'i", run: async (p) => { await click(p, "Qo'shish", 700); } },
  { id: "swatch", label: "material tanlash", run: async (p) => { await click(p, "Materiallar", 600);
      await p.evaluate(() => { const r = [...document.querySelectorAll("button")].filter((x) => /ЛДСП|ХДФ/.test(x.textContent || "")); r[0]?.click(); }); await wait(800); } },
  { id: "tree", label: "detallar ro'yxati", run: async (p) => { await click(p, "Detallar ro'yxati", 700); } },
  // M12 — the room panel is the newest and densest sheet in the app (two material grids, a rug row and
  // its colours). It has to obey the same rules as everything else.
  { id: "room", label: "«Xona» varag'i", run: async (p) => {
      await p.evaluate(() => window.__karkas.getState().setRoom("L", [3000, 2400])); await wait(600);
      await click(p, "^Xona$", 800); } },
  { id: "room-rug", label: "«Xona» varag'i + gilam", run: async (p) => {
      await p.evaluate(() => { const s = window.__karkas.getState(); s.setRoom("L", [3000, 2400]);
        s.setRoomRug({ w_mm: 2000, d_mm: 3000, color: "#8f9c8a" }); }); await wait(700);
      await click(p, "^Xona$", 800); } },
  { id: "parts", label: "«Detallar» tabi", run: async (p) => { await click(p, "^Detallar$", 900); } },
];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
let failures = 0, checks = 0;

for (const dev of DEVICES) {
  for (const st of STATES) {
    const p = await browser.newPage();
    await p.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.goto(URL, { waitUntil: "networkidle2" });
    await p.waitForFunction("!!window.__karkas3d && !!window.__karkas", { timeout: 30000 });
    await wait(700);
    await st.run(p);
    await wait(350);
    const m = await p.evaluate(MEASURE, MIN_TAP, OURS);
    await p.close();
    checks++;
    const where = `${dev.name} · ${st.label}`;
    if (m.offscreen.length) { failures++;
      console.error(`✗ ${where} — ${m.offscreen.length} element ekrandan chiqib ketgan:`);
      for (const o of m.offscreen.slice(0, 4)) console.error(`    ${o.el} → right ${o.right} > ${o.vw}`); }
    if (m.scrollsX.length) { failures++;
      console.error(`✗ ${where} — ${m.scrollsX.length} panel yonga scroll bo'ladi:`);
      for (const s of m.scrollsX.slice(0, 4)) console.error(`    ${s.el} → kerak ${s.need}, bor ${s.have}`); }
    if (m.tiny.length) { failures++;
      console.error(`✗ ${where} — ${m.tiny.length} tugma ${MIN_TAP}px dan kichik:`);
      for (const t of m.tiny.slice(0, 5)) console.error(`    ${t.el} → ${t.w}×${t.h}`); }
    if (!m.offscreen.length && !m.scrollsX.length && !m.tiny.length) console.log(`✓ ${where}`);
  }
}
await browser.close();
console.log(`\n${checks} holat tekshirildi · ${failures} muammo`);
process.exit(failures ? 1 : 0);
