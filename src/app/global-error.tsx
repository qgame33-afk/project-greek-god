"use client";

// Last-resort screen when the root layout itself fails (docs/DESIGN-V3-SIMPLE.md §4.12). It
// renders its own document without the app's stylesheet or fonts, so everything here is inline,
// in the V3 tokens: a centred card, "Something went wrong.", a secondary "Try again" and a ghost
// "Go to Today".
const card = "#141416";
const control = "#222226";
const text = "#f5f5f7";
const text2 = "#a1a1a6";

export default function GlobalError({ error }: { error: unknown }) {
  console.error(error);
  const button = { height: 52, borderRadius: 999, border: 0, font: "inherit", fontWeight: 700, cursor: "pointer", width: "100%" } as const;
  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Project Greek God</title>
        <meta name="theme-color" content="#000000" />
      </head>
      <body style={{ margin: 0, minHeight: "100dvh", background: "#000000", color: text, font: '400 17px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}>
        <main
          role="alert"
          style={{ minHeight: "100dvh", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))" }}
        >
          <div style={{ width: "100%", maxWidth: 400, background: card, borderRadius: 24, padding: "28px 24px", textAlign: "center", boxSizing: "border-box" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Something went wrong.</h1>
            <p style={{ margin: "8px auto 0", maxWidth: "32ch", color: text2, fontSize: 15 }}>Your logs are safe in your account.</p>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => window.location.reload()} style={{ ...button, background: control, color: text }}>
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the root layout failed: a full page load */}
              <a href="/" style={{ ...button, display: "grid", placeItems: "center", color: text, textDecoration: "none" }}>
                Go to Today
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
