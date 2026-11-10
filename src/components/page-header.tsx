/**
 * PageHeader and PageBody: the top of every page and the column under it. Light, on the page: no band.
 *
 *   <PageHeader
 *     breadcrumbs={[{ label: "Projects", href: "/gc/projects" }, { label: "Harbor Tower" }]}
 *     title="Harbor Tower"
 *     badge={<Badge tone="hold">2 waiting</Badge>}
 *     actions={<><Button>Record owner payment</Button><Button variant="secondary">Add subcontract</Button></>}
 *     description="1200 Marina Way, Oakland, California"
 *     tabs={<ProjectTabs projectId={id} />}
 *   />
 *   <PageBody>…sections, 32px apart…</PageBody>
 *
 * PageHeader props: `title`; `breadcrumbs?` ({ label, href? }[]; the last one is the current page);
 * `badge?`; `actions?` (buttons, primary first, ONE primary per page); `description?` (one line);
 * `tabs?` (a <Tabs> or <ProjectTabs>); `children?` (extra content under the description);
 * `width` "form" (640px) | "default" (1100px) | "full" (document review).
 * PageBody props: `width` (use the same value as the header), `className?`, `children`. It stacks
 * its children 32px apart; pass className="gap-4" (or any gap) to change that.
 * Put both directly inside the layout (a fragment is fine), not inside a wrapper div.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";

export type PageWidth = "form" | "default" | "full";
export type Crumb = { label: React.ReactNode; href?: string };

const WIDTH: Record<PageWidth, string> = {
  form: "max-w-[640px]",
  default: "max-w-[1100px]",
  full: "max-w-none",
};

export function PageHeader({
  title,
  breadcrumbs,
  badge,
  actions,
  description,
  tabs,
  children,
  width = "default",
  className,
}: {
  title: React.ReactNode;
  breadcrumbs?: Crumb[] | React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  description?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <header data-page="header" className={cn("mx-auto mb-6 w-full", WIDTH[width], className)}>
      {Array.isArray(breadcrumbs) ? (
        breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="type-caption flex flex-wrap items-center gap-1 text-muted-foreground">
              {(breadcrumbs as Crumb[]).map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight aria-hidden className="size-3 opacity-70" />}
                  {c.href ? (
                    <Link href={c.href} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current={i === (breadcrumbs as Crumb[]).length - 1 ? "page" : undefined}>{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )
      ) : (
        breadcrumbs && <div className="type-caption mb-2 text-muted-foreground [&_a]:underline-offset-4 [&_a]:hover:text-foreground [&_a]:hover:underline">{breadcrumbs}</div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="type-title min-w-0">{title}</h1>
          {badge}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      {tabs && <div className="mt-4">{tabs}</div>}
    </header>
  );
}

export function PageBody({ width = "default", className, children }: { width?: PageWidth; className?: string; children: React.ReactNode }) {
  return (
    <div data-page="body" className={cn("mx-auto flex w-full flex-col gap-8", WIDTH[width], className)}>
      {children}
    </div>
  );
}
