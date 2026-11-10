/**
 * The dark band at the top of a page: who or what this page is about, its one big figure, and the
 * things you can do. It runs edge to edge and joins the navigation bar above it, so every main page
 * opens the same way the landing page does.
 */
export function PageHero({
  kicker,
  title,
  lede,
  figure,
  stats,
  actions,
  aside,
  width = "wide",
}: {
  /** A way back up, above the title (a link, never a label). */
  kicker?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** The one number the page is about. */
  figure?: { label: string; value: React.ReactNode; note?: React.ReactNode };
  stats?: { label: string; value: React.ReactNode }[];
  /** Buttons: the things this person can do from here. */
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  width?: "wide" | "narrow";
}) {
  return (
    <section className="stage relative left-1/2 -mt-8 mb-10 w-screen -translate-x-1/2 sm:-mt-10">
      <div className={`mx-auto px-4 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-12 ${width === "wide" ? "max-w-6xl" : "max-w-xl"}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            {kicker && <div className="text-sm text-stage-muted">{kicker}</div>}
            <h1 className={`font-bold leading-[1.05] ${kicker ? "mt-2" : ""} ${width === "wide" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>{title}</h1>
            {lede && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stage-muted">{lede}</p>}
          </div>
          {aside}
        </div>

        {(figure || stats) && (
          <div className="mt-10 flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
            {figure && (
              <div>
                <div className="text-sm text-stage-muted">{figure.label}</div>
                <div className={`type-numeral mt-2 font-bold tracking-tight ${width === "wide" ? "text-6xl sm:text-7xl lg:text-8xl" : "text-6xl"}`}>{figure.value}</div>
                {figure.note && <p className="mt-4 text-[15px] text-stage-muted">{figure.note}</p>}
              </div>
            )}
            {stats && (
              <dl className="num flex flex-wrap gap-x-10 gap-y-4 text-sm">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="font-sans text-stage-muted">{s.label}</dt>
                    <dd className="mt-1 text-2xl font-semibold">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {actions && <div className="mt-9 flex flex-wrap items-start gap-3">{actions}</div>}
      </div>
    </section>
  );
}
