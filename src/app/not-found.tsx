import type { Metadata } from "next";
import Link from "next/link";
import { auth, homeFor } from "@/server/auth";
import { buttonVariants } from "@/components/ui/button";
import { AuthFrame } from "./sign-in/auth-frame";

export const metadata: Metadata = { title: "Page not found" };

/** Shown for an address that matches nothing, and for a record the signed-in company cannot see. */
export default async function NotFound() {
  const session = await auth();
  return (
    <AuthFrame title="This page could not be found" description="The link may be out of date, or it may belong to a project your company is not part of.">
      <Link href={session ? homeFor(session.org.kind) : "/"} className={buttonVariants({ variant: "secondary", size: "lg" })}>
        {session ? "Go to your home page" : "Go to the Groundwork home page"}
      </Link>
    </AuthFrame>
  );
}
