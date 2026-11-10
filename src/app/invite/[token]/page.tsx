import type { Metadata } from "next";
import Link from "next/link";
import { getInvitation } from "@/server/actions/invitations";
import { buttonVariants } from "@/components/ui/button";
import { AuthFrame, authLink } from "../../sign-in/auth-frame";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept your invitation", robots: { index: false } };

const KIND: Record<"gc" | "sub" | "owner", string> = { gc: "general contractor", sub: "subcontractor", owner: "owner" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  if (!invitation) {
    return (
      <AuthFrame title="This invitation link doesn't work" description="The link may have been cut short when it was copied, or the invitation was replaced by a newer one.">
        <p className="text-muted-foreground">Ask the person who invited you to copy the link again and send it whole. If you already set a password, you can sign in.</p>
        <Next />
      </AuthFrame>
    );
  }

  const inviter = invitation.invitedBy.orgName === invitation.org.name ? invitation.invitedBy.name : `${invitation.invitedBy.name} of ${invitation.invitedBy.orgName}`;

  if (invitation.status === "accepted") {
    return (
      <AuthFrame title="This invitation has already been used" description={`An account for ${invitation.email} at ${invitation.org.name} was set up from this link.`}>
        <p className="text-muted-foreground">Sign in with that email and the password you chose. If that wasn&rsquo;t you, ask {invitation.invitedBy.name} to check who has joined.</p>
        <Next />
      </AuthFrame>
    );
  }

  if (invitation.status === "expired") {
    return (
      <AuthFrame title="This invitation has expired" description={`Invitations work for 14 days. This one, to join ${invitation.org.name}, ended on ${invitation.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`}>
        <p className="text-muted-foreground">Ask {inviter} to send a new one. It takes them a few seconds.</p>
        <Next />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={`Join ${invitation.org.name}`}
      description={
        <>
          {inviter} invited you to {invitation.org.name}&rsquo;s {KIND[invitation.org.kind]} account on Groundwork. Choose a password to finish.
        </>
      }
    >
      <AcceptForm token={token} email={invitation.email} name={invitation.name} orgName={invitation.org.name} />
      <p className="mt-6 text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className={authLink}>
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

function Next() {
  return (
    <div className="mt-6">
      <Link href="/sign-in" className={buttonVariants({ variant: "secondary", size: "lg" })}>
        Go to sign in
      </Link>
    </div>
  );
}
