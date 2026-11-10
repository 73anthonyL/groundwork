import type { Metadata, Viewport } from "next";
import { Host_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { MotionProvider } from "@/components/viz/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/** Host Grotesk: the one sans, for interface and display. Weights 400, 500 and 600 are the ones in use. */
const host = Host_Grotesk({
  variable: "--font-host",
  subsets: ["latin"],
});

/** IBM Plex Mono: amounts in tables, IDs, hashes, clause references. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/** Newsreader: only for words quoted from a contract or a statutory form. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

/** Applies the theme and type set chosen in the lab before first paint, so there is no flash. */
const THEME_BOOT = `try{var d=document.documentElement,t=localStorage.getItem("gw-theme"),y=localStorage.getItem("gw-type");if(t)d.dataset.theme=t;if(y)d.dataset.type=y}catch(e){}`;

export const metadata: Metadata = {
  title: { default: "Groundwork", template: "%s · Groundwork" },
  description:
    "Reads subcontracts into payment rules a person approves, and pays subcontractors the moment the owner's money lands.",
};

export const viewport: Viewport = {
  themeColor: "#fafbfc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${host.variable} ${plexMono.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
