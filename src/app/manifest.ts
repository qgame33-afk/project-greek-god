import type { MetadataRoute } from "next";

/** Installable PWA (Add to Home Screen). The apple-touch-icon is declared in the root layout. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Project Greek God",
    short_name: "Greek God",
    description: "The Ascent — build your greatest physique. Training, nutrition, recovery and progress in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090B",
    theme_color: "#09090B",
    lang: "en",
    dir: "ltr",
    categories: ["health", "fitness", "lifestyle"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log food", short_name: "Log food", url: "/nutrition?add=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Log weight", short_name: "Weigh-in", url: "/progress?tab=weight&log=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Training", short_name: "Train", url: "/training", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
