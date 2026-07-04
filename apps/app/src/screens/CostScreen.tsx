// Phase Д — "Смета": the client-facing quote. Runs the real pricing engine
// (packages/pricing) over the constructed run and shows the grouped breakdown +
// a per-module list, so the design becomes a price the customer can see.
// NOTE: rates are PARTLY real now — packages/pricing seed carries the Chin Wood prices
// for распил/кромка/ЧПУ (05.2026); плита/фурнитура/столешница/сборка/доставка are still
// estimates (not in the Chin Wood list — need the board/fittings supplier price).

import { useMemo } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { costBreakdown } from "../model/toProject";
import { useMoney } from "../useMoney";
import { blockPriceUzs } from "../three/estimate";
import type { Cabinet } from "../model/cabinet";
import type { QuoteGroup } from "@mebelchi/schema";

// order the groups so the biggest, most tangible costs read first
const GROUP_ORDER: QuoteGroup[] = ["carcassFacade", "worktopEdge", "hardware", "cnc", "delivery"];

export function CostScreen() {
  const t = useT();
  const money = useMoney();
  const cabs = useStore((s) => s.cabs);
  const projectBlocks = useStore((s) => s.projectBlocks);
  const settings = useStore((s) => s.settings);
  const data = useMemo(() => costBreakdown(cabs), [cabs]);
  // placed karkas blocks fold into the same quote (each solved + priced fresh, in UZS)
  const blocks = useMemo(() => projectBlocks.map((b) => ({ id: b.id, name: b.name, cost: blockPriceUzs(b.karkasJson) })), [projectBlocks]);
  const blocksTotal = blocks.reduce((s, b) => s + b.cost, 0);

  const cabLabel = (c: Cabinet): string => {
    if (c.appliance && c.appliance !== "none" && c.appliance !== "filler") return t.labels.appl[c.appliance] ?? t.labels.tech;
    if (c.corner) return t.labels.corner;
    const k = c.kind === "upper" ? t.labels.kindUpper : c.kind === "tall" ? t.labels.kindTall : t.labels.kindBase;
    return `${k} ${c.w}`;
  };

  if (!data && blocks.length === 0) {
    return (
      <section className="screen">
        <div className="qnum">{t.cost.num}</div>
        <h1 className="h1">{t.cost.title}</h1>
        <p className="sub" style={{ marginTop: 12 }}>{t.cost.emptySub}</p>
      </section>
    );
  }

  const quote = data?.quote ?? null;
  const perCab = data?.perCab ?? [];
  const real = cabs.filter((c) => !c.furniture);
  const grandTotal = (quote?.total ?? 0) + blocksTotal;
  const maxGroup = quote ? Math.max(...GROUP_ORDER.map((g) => quote.groups[g]), 1) : 1;
  const items = perCab
    .map((p) => ({ ...p, cab: real.find((c) => c.id === p.id) }))
    .filter((p): p is { id: string; cost: number; cab: Cabinet } => !!p.cab)
    .sort((a, b) => b.cost - a.cost);

  return (
    <section className="screen cost-screen">
      <div className="qnum">{t.cost.num}</div>
      <h1 className="h1">{t.cost.title}</h1>

      {(settings.company || settings.name || settings.phone) && (
        <div className="cost-from">
          {settings.company && <span className="cost-from-co">{settings.company}</span>}
          {[settings.name, settings.phone].filter(Boolean).length > 0 && (
            <span className="cost-from-meta">{[settings.name, settings.phone].filter(Boolean).join(" · ")}</span>
          )}
        </div>
      )}

      <div className="cost-total">{money(grandTotal)}</div>
      <div className="cost-total-sub">{t.cost.totalSub((quote?.itemCount ?? 0) + blocks.length)}</div>

      {quote && (
        <div className="cost-groups">
          {GROUP_ORDER.filter((g) => quote.groups[g] > 0).map((g) => (
            <div className="cost-group" key={g}>
              <div className="cost-group-head">
                <span className="cost-group-name">{t.labels.groups[g]}</span>
                <span className="cost-group-amt">{money(quote.groups[g])}</span>
              </div>
              <div className="cost-bar">
                <span style={{ width: `${(quote.groups[g] / maxGroup) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && <div className="cost-sec-title">{t.cost.byModule}</div>}
      <div className="cost-items">
        {items.map(({ id, cost, cab }) => (
          <div className="cost-item" key={id}>
            <span className="cost-item-name">
              {cabLabel(cab)}
              <span className="cost-item-dim"> · {Math.round(cab.w / 10)}×{Math.round(cab.h / 10)} {t.labels.cm}</span>
            </span>
            <span className="cost-item-amt">{money(cost)}</span>
          </div>
        ))}
      </div>

      {/* placed karkas blocks — folded into the same quote */}
      {blocks.length > 0 && (
        <>
          <div className="cost-sec-title">🧩 Karkas bloklar</div>
          <div className="cost-items">
            {blocks.map((b) => (
              <div className="cost-item" key={b.id}>
                <span className="cost-item-name">{b.name}</span>
                <span className="cost-item-amt">{money(b.cost)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="cost-note">{t.cost.note}</p>
    </section>
  );
}
