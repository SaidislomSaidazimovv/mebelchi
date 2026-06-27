// Quiz / space illustrations (ported verbatim from v7-journey.html `ill()`).
// Static SVG inner-markup keyed by `pic`; rendered into a shared <svg> frame.

const W = "#cfc7b7";
const D = "#9a917e";
const G = "#b8b0a0";
const ACC = "#c0883a";

const F: Record<string, string> = {
  oven_under: `<rect x="60" y="30" width="80" height="20" rx="3" fill="${G}"/><rect x="60" y="52" width="80" height="58" rx="3" fill="${W}" stroke="${D}"/><rect x="70" y="62" width="60" height="38" rx="3" fill="#3a362f"/>`,
  oven_tall: `<rect x="62" y="14" width="76" height="118" rx="4" fill="${W}" stroke="${D}"/><rect x="72" y="46" width="56" height="40" rx="3" fill="#3a362f"/>`,
  hood_integ: `<rect x="50" y="20" width="100" height="26" rx="3" fill="${W}" stroke="${D}"/><rect x="74" y="46" width="52" height="10" rx="2" fill="${G}"/><rect x="60" y="92" width="80" height="14" rx="2" fill="#3a362f"/>`,
  hood_dome: `<path d="M70 24 L130 24 L116 56 L84 56 Z" fill="${G}" stroke="${D}"/><rect x="92" y="14" width="16" height="14" fill="${G}"/><rect x="60" y="92" width="80" height="14" rx="2" fill="#3a362f"/>`,
  fridge_integ: `<rect x="74" y="14" width="52" height="118" rx="4" fill="${W}" stroke="${D}"/><line x1="100" y1="60" x2="100" y2="64" stroke="${D}"/>`,
  fridge_free: `<rect x="76" y="20" width="48" height="112" rx="5" fill="${G}" stroke="${D}"/><line x1="76" y1="70" x2="124" y2="70" stroke="${D}"/><rect x="115" y="36" width="4" height="14" fill="${D}"/>`,
  lay_i: `<rect x="46" y="58" width="108" height="14" fill="${D}"/><rect x="46" y="44" width="108" height="14" fill="${W}" stroke="${D}"/>`,
  lay_l: `<rect x="46" y="58" width="80" height="14" fill="${D}"/><rect x="126" y="40" width="14" height="60" fill="${D}"/><rect x="46" y="44" width="80" height="14" fill="${W}" stroke="${D}"/>`,
  // galley — two parallel runs
  lay_galley: `<rect x="46" y="40" width="108" height="14" fill="${D}"/><rect x="46" y="86" width="108" height="14" fill="${D}"/><rect x="46" y="54" width="108" height="6" fill="${G}"/><rect x="46" y="80" width="108" height="6" fill="${G}"/>`,
  // U — three connected sides, open at the bottom
  lay_u: `<rect x="46" y="40" width="108" height="14" fill="${D}"/><rect x="46" y="40" width="14" height="62" fill="${D}"/><rect x="140" y="40" width="14" height="62" fill="${D}"/>`,
  // peninsula — one run + a leg jutting into the room
  lay_peninsula: `<rect x="46" y="40" width="108" height="14" fill="${D}"/><rect x="124" y="54" width="14" height="50" fill="${D}"/><rect x="124" y="98" width="34" height="14" rx="2" fill="${G}"/>`,
  shape_i: `<rect x="30" y="40" width="140" height="60" fill="none" stroke="${D}" stroke-width="3"/><rect x="34" y="44" width="132" height="10" fill="${ACC}" opacity=".5"/>`,
  shape_l: `<path d="M30 40 H170 V100 H100 V72 H30 Z" fill="none" stroke="${D}" stroke-width="3"/>`,
};

export function Illustration({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 200 140" className="ill" dangerouslySetInnerHTML={{ __html: F[kind] ?? "" }} />
  );
}
