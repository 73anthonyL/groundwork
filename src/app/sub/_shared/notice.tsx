import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "cn";

const TONE = {
  settled: { box: "border-settled/30 bg-settled-soft", icon: "text-settled", Icon: CircleCheck },
  hold: { box: "border-hold/30 bg-hold-soft", icon: "text-hold", Icon: CircleAlert },
  danger: { box: "border-destructive/30 bg-destructive-soft", icon: "text-destructive", Icon: CircleAlert },
  info: { box: "border-border bg-card", icon: "text-muted-foreground", Icon: Info },
} as const;

/**
 * Notice: one message about what just happened or what is blocking, with an icon so the state never
 * rests on color. `tone` "settled" (done) | "hold" (waiting) | "danger" (failed) | "info".
 * `role` defaults to "status"; pass "alert" for an error the person must act on.
 */
export function Notice({ tone = "info", title, children, role = "status", className }: { tone?: keyof typeof TONE; title?: React.ReactNode; children?: React.ReactNode; role?: "status" | "alert"; className?: string }) {
  const t = TONE[tone];
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-5", t.box, className)}>
      <t.Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.icon)} />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "text-muted-foreground" : undefined}>{children}</div>}
      </div>
    </div>
  );
}
