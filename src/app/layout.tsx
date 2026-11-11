import type { Metadata, Viewport } from "next";
import { Libre_Franklin, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { MotionProvider } from "@/components/viz/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/** Host Grotesk: the one sans, for interface and display. Weights 400, 500 and 600 are the ones in use. */
const franklin = Libre_Franklin({
  variable: "--font-franklin",
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

export const metadata: Metadata = {
  title: { default: "Groundwork", template: "%s · Groundwork" },
  description:
    "Groundwork reads a subcontract's payment terms into rules you approve once, then splits every owner payment between your subcontractors.",
};

export const viewport: Viewport = {
  themeColor: "#0e1914",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${franklin.variable} ${plexMono.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <noscript>
          <style>{`[data-inview] .iv,[data-inview] .iv-pop{opacity:1!important}[data-inview] .iv-grow{transform:none!important}`}</style>
        </noscript>
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
