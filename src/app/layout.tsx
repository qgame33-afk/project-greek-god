import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// One sans font (docs/DESIGN-V3-SIMPLE.md §1.2.1). On the iPhone `-apple-system` matches first in
// --font-sans-stack, so SF Pro renders with native Dynamic Type and zero bytes; Inter (its
// optical-size axis gives the display cut at large sizes) is the fallback for desktop and Linux.
// Self-hosted by next/font (latin subset, swap, fallback metrics), so the CSP is unchanged; not
// preloaded, because the iPhone never needs it.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Project Greek God", template: "%s · Project Greek God" },
  description: "Training, food and progress in one place.",
  applicationName: "Project Greek God",
  appleWebApp: { capable: true, title: "Greek God", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the per-device appearance (src/lib/appearance.ts, `pgg.appearance`) before first paint:
// Motion = Reduce, and night dimming (Off, 9 PM–5 AM, Always). The stored transparency value is
// ignored. Mirrors applyAppearance(); keep the two in step.
const APPEARANCE_BOOT = `(function(){try{var a=JSON.parse(localStorage.getItem("pgg.appearance")||"{}")||{};var r=document.documentElement;if(a.motion==="reduce")r.setAttribute("data-motion","reduce");var d=new Date(),m=d.getHours()*60+d.getMinutes();if(a.night==="always"||(a.night!=="off"&&(m>=1260||m<300)))r.setAttribute("data-night","on")}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // the boot script and the shell set data-motion / data-night / data-nav
      suppressHydrationWarning
      className={inter.variable}
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
