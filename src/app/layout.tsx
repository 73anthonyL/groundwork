import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { MotionProvider } from "@/components/viz/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexCondensed = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-condensed",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

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
    "Compiles subcontracts into executable payment rules and pays subcontractors the moment the owner's money lands.",
};

export const viewport: Viewport = {
  themeColor: "#eceeeb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plex.variable} ${plexCondensed.variable} ${plexMono.variable} ${newsreader.variable} h-full antialiased`}
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
