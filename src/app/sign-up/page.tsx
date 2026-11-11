import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame, authLink } from "../sign-in/auth-frame";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthFrame title="Create an account" description="For general contractors. Subcontractors and owners join from an invitation.">
      <SignUpForm />
      <p className="mt-6 text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className={authLink}>
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}
