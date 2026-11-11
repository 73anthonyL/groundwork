/**
 * Button. One primary per page.
 *
 *   <Button variant="primary" size="md" loading={pending}>Approve payment rules</Button>
 *   <Link href="/x" className={buttonVariants({ variant: "secondary" })}>Cancel</Link>
 *
 * variant: "primary" (ink fill, the default) | "secondary" (white, 1px border) | "tertiary" (no
 *   border) | "destructive" (red text and border) | "link" (inline blue text).
 *   Old names still work: money / default / signal = primary, outline / stage = secondary, ghost = tertiary.
 * size: "sm" 28px (table rows) | "md" 32px (default; "default" is the same) | "lg" 40px (sign-in,
 *   landing page) | "icon" 32 | "icon-sm" 28 | "icon-xs" 24 | "icon-lg" 40 | "xs" 24.
 * loading: keeps the label, adds a spinner, sets aria-busy and ignores clicks. Never pre-disable a submit.
 * Everything else is a normal <button> prop (Base UI Button, so `render` works too).
 */
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Spinner } from "./spinner"

const primary = "border-transparent bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),var(--primary-foreground)_18%)] hover:shadow-[0_6px_22px_-6px_var(--primary)]"
const secondary = "border-input bg-card text-foreground hover:border-[color-mix(in_oklch,var(--foreground),transparent_45%)] hover:bg-muted aria-expanded:bg-muted"
const tertiary = "border-transparent text-foreground hover:bg-secondary aria-expanded:bg-secondary"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,scale,box-shadow,filter] duration-150 ease-out active:scale-[0.96] active:duration-75 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary,
        secondary,
        tertiary,
        destructive: "border-destructive/40 bg-card text-destructive hover:bg-destructive-soft",
        link: "h-auto! border-transparent rounded-sm px-0! font-normal text-link underline-offset-4 hover:underline active:scale-100",
        /* Aliases kept so older pages compile. */
        default: primary,
        money: primary,
        /* The accent button: terracotta, for the one call to action on a marketing page. */
        signal: "border-transparent bg-signal text-signal-foreground font-semibold hover:brightness-110 hover:shadow-[0_8px_28px_-8px_var(--signal)]",
        outline: secondary,
        stage: secondary,
        ghost: tertiary,
      },
      size: {
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-7 gap-1.5 px-2.5 text-[13px] leading-[18px] [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-8 gap-1.5 px-3 text-sm",
        default: "h-8 gap-1.5 px-3 text-sm",
        lg: "h-10 gap-2 px-4 text-sm",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }

function Button({ className, variant = "primary", size = "md", loading = false, children, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && <Spinner decorative />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants, type ButtonProps }
