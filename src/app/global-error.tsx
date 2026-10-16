"use client";

// Last-resort screen when the root layout itself fails. It renders its own document without the
// app's stylesheet or fonts, so everything here is inline and matches the offline page in sw.js.
export default function GlobalError({ error }: { error: unknown }) {
  console.error(error);
  return (
    <html lang="en">
      <head>
        <title>Something broke · Project Greek God</title>
        <meta name="theme-color" content="#08090C" />
      </head>
      <body style={{ margin: 0, minHeight: "100dvh", background: "#08090C", color: "#F2EFE8", font: '500 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <main
          role="alert"
          style={{
            minHeight: "100dvh",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))",
          }}
        >
          <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "#E2C185" }}>Project Greek God</p>
          <h1 style={{ margin: 0, font: '700 28px/1 "Barlow Condensed", "Arial Narrow", sans-serif', letterSpacing: ".02em", textTransform: "uppercase" }}>The app didn&apos;t load</h1>
          <p style={{ margin: "12px auto 0", maxWidth: "32ch", color: "#A3A9B4" }}>Your logs are safe in your account. Check the connection and load it again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, height: 48, padding: "0 24px", borderRadius: 14, border: "1px solid rgba(213,172,103,.38)", background: "#1C2026", color: "#E2C185", font: "inherit", fontWeight: 700, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
