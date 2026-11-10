import { Wordmark } from "@/components/wordmark";

/**
 * The frame for sign-in, sign-up, the invitation page and the sample workspace entry: the wordmark,
 * a title and one narrow column on the flat page background.
 * Props: `title`, `description?`, `width` "form" (400px, the default) | "list" (640px), `children`.
 */
export function AuthFrame({
  title,
  description,
  width = "form",
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  width?: "form" | "list";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background px-4 text-sm leading-5">
      <main className={`mx-auto flex w-full flex-1 flex-col pt-12 pb-16 sm:pt-[14vh] ${width === "form" ? "max-w-[400px]" : "max-w-[640px]"}`}>
        <Wordmark />
        <h1 className="mt-10 text-[22px] leading-7 font-semibold tracking-[-0.01em]">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground">{description}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

/** A plain text link for the lines under an auth form. */
export const authLink = "rounded-sm font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground";
