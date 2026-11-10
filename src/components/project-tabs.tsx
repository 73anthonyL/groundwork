import Link from "next/link";

/** Board (the working table) and Live view (the same project as pictures). */
export function ProjectTabs({ projectId, active }: { projectId: string; active: "board" | "live" }) {
  const tabs = [
    { id: "board", label: "Board", href: `/gc/projects/${projectId}` },
    { id: "live", label: "Live view", href: `/gc/projects/${projectId}/live` },
  ] as const;
  return (
    <nav aria-label="Project views" className="inline-flex gap-0.5 rounded-full bg-secondary p-1 text-sm">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined} className={`rounded-full px-4 py-1.5 font-medium transition-colors ${t.id === active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
