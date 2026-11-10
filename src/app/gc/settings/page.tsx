import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/server/auth";
import { railName } from "@/server/rails";
import { coverage } from "@/domain/statutes";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Settings" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b px-4 py-3 last:border-0 sm:grid-cols-[180px_1fr]">
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm leading-5">{children}</dd>
    </div>
  );
}

/** What is true about this account. Nothing here pretends to be a setting that does not exist. */
export default async function SettingsPage() {
  const { org, user } = await requireAuth("gc");
  const simulated = railName() === "simulated";
  const states = coverage();
  return (
    <>
      <PageHeader width="form" title="Settings" />
      <PageBody width="form">
        <Panel title="Company" padded={false}>
          <dl>
            <Row label="Company name">{org.name}</Row>
            <Row label="Type">General contractor</Row>
            <Row label="Signed in as">
              {user.name}
              <div className="type-mono text-[13px] text-muted-foreground">{user.email}</div>
            </Row>
          </dl>
        </Panel>

        <Panel title="Payments" actions={simulated ? <Badge tone="hold">Test mode</Badge> : <Badge tone="money">Ramp</Badge>}>
          {simulated ? (
            <div className="flex flex-col gap-2 text-sm leading-5">
              <p className="font-medium">Test mode: no real money moves.</p>
              <p className="text-muted-foreground">
                No real money moves. Payments are created and marked sent, but no bank transfer is made.
              </p>
            </div>
          ) : (
            <p className="text-sm leading-5 text-muted-foreground">Payments are sent as bills through Ramp, and a payment is marked paid when Ramp confirms it.</p>
          )}
        </Panel>

        <Panel title="State payment law">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="max-w-md text-sm leading-5 text-muted-foreground">
              Deadlines, retainage caps and waiver forms come from researched statute data for {states.jurisdictions} jurisdictions, each with its citation. It is not legal advice and has not been reviewed by a lawyer.
            </p>
            <Link href="/statutes" className={buttonVariants({ variant: "secondary" })}>
              Open the reference
            </Link>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
