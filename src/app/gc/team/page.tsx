import type { Metadata } from "next";
import { headers } from "next/headers";
import { isSampleWorkspace, requireAuth } from "@/server/auth";
import { listInvitations, listMembers } from "@/server/scoped";
import { gcSubcontractors } from "@/server/read/gc-lists";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-field";
import { Panel, Section } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

const ROLE: Record<string, string> = { admin: "Admin", ap: "Accounts payable", pm: "Project manager", viewer: "Viewer" };
const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The people in the contractor's company, and the invitations it has sent, each with its link to copy. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { org, user } = await requireAuth("gc");
  const { invite } = await searchParams;
  const sample = isSampleWorkspace(org);
  const [members, invitations, subs, h] = await Promise.all([listMembers(org), listInvitations(org), gcSubcontractors(org), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return (
    <>
      <PageHeader title="Team" description={`People at ${org.name}, and the invitations you have sent to teammates and subcontractors.`} />
      <PageBody>
        <Section title="Members">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && <TableEmpty colSpan={4}>No members yet.</TableEmpty>}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {m.name}
                    {m.id === user.id && <span className="ml-2 font-normal text-muted-foreground">You</span>}
                    {m.title && <div className="type-meta font-normal text-muted-foreground">{m.title}</div>}
                  </TableCell>
                  <TableCell className="type-mono text-[13px]">{m.email}</TableCell>
                  <TableCell muted>{ROLE[m.role] ?? m.role}</TableCell>
                  <TableCell>{sample ? <Badge>Sample person</Badge> : m.hasPassword ? <Badge tone="settled">Active</Badge> : <Badge tone="hold">Has not joined</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        {sample ? (
          <Panel title="Invitations are turned off in the sample workspace">
            <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
              The people here are made up. Create your own account to invite real teammates and subcontractors.
            </p>
          </Panel>
        ) : (
          <>
            <Panel title="Invite someone" description="Teammates join your company. A subcontractor's contact joins theirs.">
              <InviteForm own={{ id: org.id, name: org.name }} subs={subs} preselect={invite} />
            </Panel>

            <Section title="Invitations" description="Groundwork does not send email yet. Copy each link and send it yourself. A link works once and expires after 14 days.">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Company they join</TableHead>
                    <TableHead>Invited by</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[30%] min-w-[260px]">Invite link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 && <TableEmpty colSpan={5}>No invitations yet.</TableEmpty>}
                  {invitations.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="type-mono text-[13px]">{i.email}</span>
                        {i.name && <div className="type-meta text-muted-foreground">{i.name}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {i.org.name}
                        <div className="type-meta text-muted-foreground">{i.org.id === org.id ? "Your company" : i.org.kind === "sub" ? "Subcontractor" : "Owner"}</div>
                      </TableCell>
                      <TableCell muted className="whitespace-nowrap">
                        {i.invitedBy.name}, {date(i.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {i.status === "pending" ? <Badge tone="hold">Not accepted yet</Badge> : i.status === "accepted" ? <Badge tone="settled">Accepted</Badge> : <Badge>Expired</Badge>}
                        <div className="type-meta mt-0.5 text-muted-foreground">{i.status === "pending" ? `Expires ${date(i.expiresAt)}` : i.status === "accepted" && i.acceptedAt ? date(i.acceptedAt) : `Expired ${date(i.expiresAt)}`}</div>
                      </TableCell>
                      <TableCell>{i.path ? <CopyField value={`${origin}${i.path}`} ariaLabel={`Invite link for ${i.email}`} /> : <span className="type-meta text-muted-foreground">{i.status === "accepted" ? "Used" : "Expired. Create a new invitation for this email."}</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          </>
        )}
      </PageBody>
    </>
  );
}
