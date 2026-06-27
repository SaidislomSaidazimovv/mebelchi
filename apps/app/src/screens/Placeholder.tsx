// Routable placeholder for phases not built yet. Keeps the journey navigable and
// the price ticker wired while we build screens one phase at a time.
export function Placeholder({ phase, title }: { phase: string; title: string }) {
  return (
    <section className="screen">
      <div className="qnum">{phase}</div>
      <h1 className="h1">{title}</h1>
      <p className="sub">
        Следующий экран в очереди. Каркас готов: тот же стор, тот же тикер цены — этот
        экран подключится сюда.
      </p>
      <div className="ph-box">Скоро</div>
    </section>
  );
}
