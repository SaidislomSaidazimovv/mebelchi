import { useStore } from "../store";

// The navbar was removed to reclaim vertical space; the journey menu now opens
// from this floating button pinned to the top-right (over whatever the screen's
// own top bar is). Same drawer as before (store.openMenu / Menu.tsx).
export function MenuButton() {
  const openMenu = useStore((s) => s.openMenu);

  return (
    <button className="menu-fab" aria-label="Меню" type="button" onClick={openMenu}>
      <span />
      <span />
    </button>
  );
}
