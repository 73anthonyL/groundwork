import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, homeFor } from "@/server/auth";
import { AuthFrame, authLink } from "./auth-frame";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ switch?: string }> }) {
  const session = await auth();
  const { switch: switching } = await searchParams;
  if (session && !switching) redirect(homeFor(session.org.kind));

  return (
    <AuthFrame title="Sign in to Groundwork">
      <SignInForm />
      <p className="mt-6 text-muted-foreground">
        New to Groundwork?{" "}
        <Link href="/sign-up" className={authLink}>
          Create an account
        </Link>
      </p>
      <p className="mt-8 border-t pt-6 type-meta text-muted-foreground">
        Just looking?{" "}
        <Link href="/sample" className="rounded-sm underline underline-offset-4 hover:text-foreground">
          Explore the sample workspace
        </Link>
      </p>
    </AuthFrame>
  );
}
