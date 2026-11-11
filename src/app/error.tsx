"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { AuthFrame } from "./sign-in/auth-frame";

/** Shown when a page fails to load. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <AuthFrame title="This page could not be loaded" description="Something went wrong while loading it. Try again. If it keeps happening, go back to the home page and open it from there.">
      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Go to the home page
        </Link>
      </div>
    </AuthFrame>
  );
}
