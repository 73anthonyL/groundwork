/**
 * PageHero: the old page opener, kept so pages written against it still compile. It now renders the
 * light <PageHeader>, with its figure, stats and actions set plainly under the title. New pages use
 * PageHeader (and <Stat size="lg"> for the one money figure) directly.
 */
import { PageHeader } from "./page-header";
import { Stat, StatGroup } from "@/components/ui/stat";

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
  /** A way back up, above the title. */
  kicker?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  figure?: { label: string; value: React.ReactNode; note?: React.ReactNode };
  stats?: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
  /** Shown where the tabs go. */
  aside?: React.ReactNode;
  width?: "wide" | "narrow";
}) {
  const extra = figure || stats || actions;
  return (
    <PageHeader title={title} breadcrumbs={kicker} description={lede} tabs={aside} width={width === "narrow" ? "form" : "default"}>
      {extra && (
        <div className="flex flex-col gap-4">
          {figure && (
            <dl>
              <Stat size="lg" label={figure.label} value={figure.value} hint={figure.note} />
            </dl>
          )}
          {stats && stats.length > 0 && (
            <StatGroup>
              {stats.map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} />
              ))}
            </StatGroup>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </PageHeader>
  );
}
