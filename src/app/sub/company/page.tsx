import type { Metadata } from "next";
import { headers } from "next/headers";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { listInvitations, listMembers } from "@/server/scoped";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-field";
import { Panel, Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Notice } from "../_shared/notice";
import { fullDay } from "../_shared/format";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Company" };

const ROLE: Record<string, string> = { admin: "Admin", ap: "Accounts payable", pm: "Project manager", viewer: "Viewer" };

/** The subcontractor's own company: who is in it, and the invitations it has sent, each with its link to copy. */
export default async function SubCompanyPage() {
  const { org, user } = await requireAuth("sub");
  const sample = isSampleWorkspace(org);
  const [members, invitations, h] = await Promise.all([listMembers(org), listInvitations(org), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const pending = invitations.filter((i) => i.status === "pending" && i.path);
  const past = invitations.filter((i) => i.status !== "pending");

  return (
    <>
      <PageHeader title="Company" description="Who can bill, sign waivers and see payments for your company." />
      <PageBody>
        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3">
            <dt className="type-meta text-muted-foreground">Company name</dt>
            <dd className="mt-0.5 text-sm leading-5 font-medium">{org.name}</dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="type-meta text-muted-foreground">Works as</dt>
            <dd className="mt-0.5 text-sm leading-5 font-medium">Subcontractor</dd>
          </div>
          <div className="bg-card px-4 py-3">
            <dt className="type-meta text-muted-foreground">People</dt>
            <dd className="num mt-0.5 text-sm leading-5 font-medium">{members.length}</dd>
          </div>
        </dl>

        <Section title="Members">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="max-md:hidden">Email</TableHead>
                <TableHead className="max-sm:hidden">Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && <TableEmpty colSpan={4}>No members yet.</TableEmpty>}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.id === user.id && <span className="ml-2 font-normal text-muted-foreground">You</span>}
                    {m.title && <div className="type-meta font-normal text-muted-foreground">{m.title}</div>}
                    <div className="type-mono text-[12px] font-normal break-all text-muted-foreground md:hidden">{m.email}</div>
                  </TableCell>
                  <TableCell className="type-mono text-[13px] max-md:hidden">{m.email}</TableCell>
                  <TableCell muted className="max-sm:hidden">
                    {ROLE[m.role] ?? m.role}
                  </TableCell>
                  <TableCell className="max-sm:align-top">{sample ? <Badge>Sample person</Badge> : m.hasPassword ? <Badge tone="settled">Active</Badge> : <Badge tone="hold">Has not joined</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        {sample ? (
          <Notice tone="hold" title="You cannot invite teammates in the sample workspace">
            <p>The sample workspace is rebuilt whenever it is reset, so an account made here would be erased. In your own company&rsquo;s account, this is where you add the people who bill and sign for you.</p>
          </Notice>
        ) : (
          <Panel title="Invite a teammate" description={`They join ${org.name} and can bill, sign waivers and see payments.`}>
            <InviteForm orgName={org.name} />
          </Panel>
        )}

        {!sample && (
          <Section title="Pending invitations" description="Email sending is not connected. Copy a link and send it yourself; it works once, for 14 days.">
            {pending.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input px-4 py-4 text-sm text-muted-foreground">No invitations are waiting. Create one above and its link appears here.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {pending.map((i) => (
                  <li key={i.id} className="grid gap-x-6 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="text-sm leading-5 font-medium break-all">{i.name ?? i.email}</p>
                      <p className="type-meta text-muted-foreground">
                        {i.name && <span className="type-mono break-all">{i.email}, </span>}
                        expires {fullDay(i.expiresAt)}
                      </p>
                    </div>
                    <CopyField value={`${origin}${i.path}`} ariaLabel={`Invite link for ${i.name ?? i.email}`} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {past.length > 0 && (
          <Section title="Past invitations">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invited</TableHead>
                  <TableHead className="max-sm:hidden">Sent by</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {past.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="font-medium break-all">{i.name ?? i.email}</span>
                      {i.name && <div className="type-mono text-[12px] break-all text-muted-foreground">{i.email}</div>}
                    </TableCell>
                    <TableCell muted className="max-sm:hidden">
                      {i.invitedBy.name}
                    </TableCell>
                    <TableCell>{i.status === "accepted" ? <Badge tone="settled">Joined{i.acceptedAt ? ` ${fullDay(i.acceptedAt)}` : ""}</Badge> : <Badge>Expired {fullDay(i.expiresAt)}</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        )}
      </PageBody>
    </>
  );
}
