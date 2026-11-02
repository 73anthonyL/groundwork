import { redirect } from "next/navigation";
import { auth, homeFor } from "@/server/auth";

export default async function Home() {
  const session = await auth();
  redirect(session ? homeFor(session.org.kind) : "/sign-in");
}
