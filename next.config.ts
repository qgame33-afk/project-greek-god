import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origin of the Supabase project (REST, Auth, Storage signed URLs, Realtime). */
function supabaseOrigins(): { http: string; ws: string } {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "");
    return { http: u.origin, ws: u.origin.replace(/^http/, "ws") };
  } catch {
    return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
  }
}

/**
 * Content-Security-Policy without nonces (every screen stays statically renderable): scripts
 * and styles only from this origin (Next.js needs its inline bootstrap scripts and styles),
 * data only from this origin and Supabase, images also as data:/blob: previews and Supabase
 * signed URLs, fonts self-hosted by next/font, blob: workers for the export zipper. Gemini,
 * USDA and Open Food Facts are only ever called from the server. No frames, no plugins.
 */
function contentSecurityPolicy() {
  const sb = supabaseOrigins();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${sb.http}`,
    "font-src 'self' data:",
    // dev: the HMR websocket
    `connect-src 'self' ${sb.http} ${sb.ws}${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const nextConfig: NextConfig = {
  // The app's screens are private, per-user and render on the client (dates must follow the
  // user's timezone), so server-side Cache Components / partial prefetching add nothing here.
  cacheComponents: false,
  partialPrefetching: false,
  devIndicators: false,
  poweredByHeader: false,
  // One id per build: the service worker's cache name carries it (src/components/providers.tsx), so
  // each deploy starts with a clean shell cache even when Vercel's system variables aren't exposed.
  env: {
    APP_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || `b${Date.now().toString(36)}`,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          // HTTPS only from now on (ignored by browsers over plain-http localhost)
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
