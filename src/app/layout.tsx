import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Cormorant_Garamond, Inter_Tight } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Type (docs/DESIGN-V2.md §1.2.1). Self-hosted by next/font (latin subset, swap, automatic
// fallback metrics against CLS), so the CSP is unchanged.
// - The voice (titles, verdicts): Cormorant Garamond 600 is preloaded; the italic 500 is not.
// - The monument (90 px+ moment numbers only): Bodoni Moda, variable with the opsz axis, not preloaded.
// - The instrument: SF Pro on the iPhone (zero bytes, native Dynamic Type); Inter Tight is the
//   desktop/Linux fallback, so it is not preloaded either.
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: "600", variable: "--font-cormorant", display: "swap" });
const cormorantItalic = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "500",
  style: "italic",
  variable: "--font-cormorant-italic",
  display: "swap",
  preload: false,
});
const bodoni = Bodoni_Moda({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bodoni", display: "swap", preload: false });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Project Greek God", template: "%s · Project Greek God" },
  description: "The Ascent — build your greatest physique. Training, nutrition, recovery and progress in one place.",
  applicationName: "Project Greek God",
  appleWebApp: { capable: true, title: "Greek God", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#09090B",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the per-device appearance (src/lib/appearance.ts, `pgg.appearance`) before first paint:
// Motion = Reduce, Reduce transparency, and the night (Seal) variant — always, or 21:00–05:00.
// Mirrors applyAppearance(); keep the two in step.
const APPEARANCE_BOOT = `(function(){try{var a=JSON.parse(localStorage.getItem("pgg.appearance")||"{}")||{};var r=document.documentElement;if(a.motion==="reduce")r.setAttribute("data-motion","reduce");if(a.transparency==="reduce")r.setAttribute("data-transparency","reduce");var d=new Date(),m=d.getHours()*60+d.getMinutes();if(a.night==="always"||m>=1260||m<300)r.setAttribute("data-phase","seal")}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // the boot script and the shell set data-motion / data-transparency / data-phase / data-nav
      suppressHydrationWarning
      className={`${cormorant.variable} ${cormorantItalic.variable} ${bodoni.variable} ${interTight.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
