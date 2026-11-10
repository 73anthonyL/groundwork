import Link from "next/link";

/** Board (the working table) and Live view (the same project as pictures). */
export function ProjectTabs({ projectId, active }: { projectId: string; active: "board" | "live" }) {
  const tabs = [
    { id: "board", label: "Board", href: `/gc/projects/${projectId}` },
    { id: "live", label: "Live view", href: `/gc/projects/${projectId}/live` },
  ] as const;
  return (
    <nav aria-label="Project views" className="inline-flex gap-0.5 rounded-full bg-white/10 p-0.5 text-[13px]">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined} className={`rounded-full px-3.5 py-1 font-medium transition-colors ${t.id === active ? "bg-white text-stage" : "text-stage-muted hover:text-white"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
