"use client";

// Last-resort screen when the root layout itself fails. It renders its own document without the
// app's stylesheet or fonts, so everything here is inline and matches the offline page in sw.js.
export default function GlobalError({ error }: { error: unknown }) {
  console.error(error);
  return (
    <html lang="en">
      <head>
        <title>Something broke · Project Greek God</title>
        <meta name="theme-color" content="#09090B" />
      </head>
      <body style={{ margin: 0, minHeight: "100dvh", background: "#09090B", color: "#F2EBDD", font: '500 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
          <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#A39B8D" }}>Project Greek God</p>
          <h1 style={{ margin: 0, font: '600 34px/1.05 "Cormorant Garamond", Georgia, serif' }}>The app didn&apos;t load</h1>
          <p style={{ margin: "12px auto 0", maxWidth: "32ch", color: "#B9B1A2" }}>Your logs are safe in your account. Check the connection and load it again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, height: 48, padding: "0 24px", borderRadius: 16, border: 0, boxShadow: "inset 0 0 0 1px rgba(224,184,102,.38)", background: "#1E1E23", color: "#EED08B", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
