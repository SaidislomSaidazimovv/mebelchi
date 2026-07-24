// M10.5 — line icons for the «Qo'shish» palette.
//
// The 21 primitives were labelled with whatever unicode glyph came closest — ▬ ▮ ┃ ◧ ◎ ⬤ ◺ ◠ △ ◗ ⬡ ⋀.
// They render at different sizes in different fonts, several are near-identical at button size, and a
// couple fall back to a tofu box on some Android builds. Moblo draws each shape; so do we. Every icon is
// the same 24×24 stroke drawing, inherits `currentColor`, and shows the shape in the ISOMETRIC view the
// palette adds it in, so what you tap is what lands in the scene.
import type { JSX } from "react";

/** every shape the palette can add, plus the three board OPERATIONS at the bottom of the sheet */
export type PrimKind =
  | "board" | "panel" | "post" | "box"
  | "rail" | "cylinder" | "tube" | "sphere" | "wedge"
  | "arc" | "cone" | "halfCylinder" | "hexagon" | "torus" | "hairpin"
  | "corner" | "cutout" | "kromka" | "block" | "divider" | "space";

const P = ({ d, fill }: { d: string; fill?: boolean }): JSX.Element => <path d={d} fill={fill ? "currentColor" : "none"} fillOpacity={fill ? 0.13 : undefined} />;

/** the drawing for one shape — paths only; the wrapper supplies the svg + stroke settings */
function shape(kind: PrimKind): JSX.Element {
  switch (kind) {
    // ── flat stock: an isometric slab, thin or thick, lying down or standing up ──
    case "board": return <>
      <P d="M2.5 12.5 12 8 21.5 12.5 12 17 Z" fill />
      <P d="M2.5 12.5v2.6L12 19.6v-2.6M21.5 12.5v2.6L12 19.6" />
    </>;
    case "panel": return <>
      <P d="M8 5.4 11.5 3.8 17 6.4 13.5 8 Z" fill />
      <P d="M8 5.4v12.2L13.5 20.2V8M17 6.4v12.2L13.5 20.2" />
    </>;
    case "post": return <>
      <P d="M9 4.6 12 3.2 15.4 4.8 12.4 6.2 Z" fill />
      <P d="M9 4.6v13.6l3.4 1.6V6.2M15.4 4.8v13.6l-3 1.4" />
    </>;
    case "box": return <>
      <P d="M3 8 12 3.6 21 8 12 12.4 Z" fill />
      <P d="M3 8v8l9 4.4 9-4.4V8M12 12.4v8" />
    </>;
    // ── turned / bent stock: never sawn from a sheet, so it reads round, not flat ──
    case "rail": return <>
      <P d="M6 8.5h12" /><P d="M6 15.5h12" />
      <ellipse cx="6" cy="12" rx="2.1" ry="3.5" /><ellipse cx="18" cy="12" rx="2.1" ry="3.5" fill="currentColor" fillOpacity={0.13} />
    </>;
    case "cylinder": return <>
      <ellipse cx="12" cy="6" rx="5.2" ry="2.3" fill="currentColor" fillOpacity={0.13} />
      <P d="M6.8 6v12M17.2 6v12" /><P d="M6.8 18a5.2 2.3 0 0 0 10.4 0" />
    </>;
    case "tube": return <> {/* the HOLE is the whole difference from a cylinder — draw it big */}
      <ellipse cx="12" cy="6.5" rx="5.4" ry="2.4" /><ellipse cx="12" cy="6.5" rx="3.1" ry="1.35" fill="currentColor" fillOpacity={0.18} />
      <P d="M6.6 6.5v11M17.4 6.5v11" /><P d="M6.6 17.5a5.4 2.4 0 0 0 10.8 0" />
      <path d="M8.9 6.5v11M15.1 6.5v11" fill="none" strokeDasharray="2 2" />
    </>;
    case "sphere": return <>
      <circle cx="12" cy="12" r="7.4" fill="currentColor" fillOpacity={0.13} />
      <P d="M6.4 15.6a7.4 7.4 0 0 1 8.6-8.8" />
    </>;
    case "wedge": return <>
      <P d="M3.5 18.5 20.5 18.5 20.5 6.5 Z" fill />
      <P d="M3.5 18.5 6.6 20.4 20.5 20.4 20.5 18.5M20.5 6.5 20.5 8.4" />
    </>;
    // ── shapes a workshop turns by hand or buys in ──
    case "arc": return <>
      <P d="M3.5 16.5C7 10.5 17 10.5 20.5 16.5" />
      <P d="M3.5 19.6C7 13.6 17 13.6 20.5 19.6" />
      <P d="M3.5 16.5v3.1M20.5 16.5v3.1" />
    </>;
    case "cone": return <>
      <ellipse cx="12" cy="5.6" rx="4.6" ry="2" fill="currentColor" fillOpacity={0.13} />
      <P d="M7.4 5.6 10.3 18.6M16.6 5.6 13.7 18.6" />
      <ellipse cx="12" cy="18.6" rx="1.7" ry="0.85" />
    </>;
    case "halfCylinder": return <>
      <P d="M4 6.5h8a5.5 5.5 0 0 1 0 11H4Z" fill />
      <P d="M12 6.5v11" />
    </>;
    case "hexagon": return <>
      <P d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6Z" fill />
    </>;
    case "torus": return <> {/* a RING seen face-on: two circles. Flattened ellipses read as an eye. */}
      <circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="4.2" />
      <P d="M12 3.8a8.2 8.2 0 0 1 0 16.4" fill />
    </>;
    case "hairpin": return <>
      <P d="M5 20.5 11.6 4.4 18.4 20.5" /><P d="M8.2 20.5 11.6 8.6 15.2 20.5" />
      <P d="M8.6 4.4h6" />
    </>;
    // ── operations on a board that is already there ──
    case "corner": return <P d="M5 4.5h6.5v8h8V19.5H5Z" fill />;
    case "cutout": return <>
      <P d="M4 5.5h16v13H4Z" />
      <P d="M13 5.5h7v7h-7Z" fill />
    </>;
    case "kromka": return <>
      <P d="M4 6.5h16v11H4Z" />
      <path d="M4 6.5h2.6v11H4Z" fill="currentColor" fillOpacity={0.55} stroke="none" />
    </>;
    // ── structure, not stock ──
    case "block": return <>
      <P d="M4 4.5h16v15H4Z" fill /><P d="M12 4.5v15M4 12h16" />
    </>;
    case "divider": return <><P d="M4 4.5h16v15H4Z" /><P d="M12 4.5v15" /></>;
    case "space": return <P d="M4 4.5h16v15H4Z" />;
  }
}

/** One palette icon. `size` is the drawn box in CSS px; colour follows the button's text colour. */
export function PrimIcon({ kind, size = 20 }: { kind: PrimKind; size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false"
      stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" fill="none"
      style={{ flex: "0 0 auto", display: "block" }}>
      {shape(kind)}
    </svg>
  );
}
