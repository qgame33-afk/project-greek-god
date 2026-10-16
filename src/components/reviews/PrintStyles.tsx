/**
 * "Save as PDF" theme. Scoped to #pgg-review: hides the app chrome and every control,
 * and re-points the design tokens to a clean ink-on-paper palette (gold stays as bronze),
 * so the browser's Save as PDF produces a readable, printable document.
 */
const CSS = `
@media print {
  @page { size: auto; margin: 14mm 12mm 16mm; }
  :root, html { color-scheme: light !important; background: #fff !important; }
  body { background: #fff !important; }
  body { min-height: 0 !important; }
  header.chrome, nav, aside, [aria-label="Quick log"], [data-sonner-toaster], section[aria-label^="Notifications"] { display: none !important; }
  main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  body * { visibility: hidden; }
  #pgg-review, #pgg-review * { visibility: visible; }
  #pgg-review [data-print="hide"] { display: none !important; }
  #pgg-review [data-print="only"] { display: block !important; }
  #pgg-review {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    --bg: #fff; --surface-1: #fff; --surface-2: #fff; --surface-3: #f5f2eb; --surface-4: #ece7dc; --surface-5: #e4ddcf;
    --text-1: #17120a; --text-2: #3f434a; --text-3: #5d636c;
    --line-hair: #ece6d9; --line: #ddd5c5; --line-strong: #c9bfa9; --line-gold: #b89a62;
    --gold-50: #8a6a35; --gold-200: #7d5c2e; --gold-300: #7d5c2e; --gold-400: #7d5c2e; --gold-800: #c9b48a;
    --lapis-text: #1f4f99; --lapis-line: #9db8e0; --success: #23744a; --s-marble: #8b857a;
    --grad-card: linear-gradient(#fff, #fff);
    --grad-spotlight: linear-gradient(#fff, #fff);
    --grad-monument-border: linear-gradient(180deg, #b89a62, #e5dccb);
    --e1: none; --e2: none;
    color: var(--text-1);
    font-size: 12px;
  }
  #pgg-review .review-grid { display: block !important; }
  #pgg-review .review-card, #pgg-review .card-monument, #pgg-review article { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; box-shadow: none !important; }
  #pgg-review .card-monument { background: #fff !important; border: 1px solid #b89a62 !important; }
  #pgg-review .review-priorities { display: block !important; }
  #pgg-review .review-priorities > * { margin-bottom: 8px; }
  #pgg-review img { break-inside: avoid; }
}
`;

export function PrintStyles() {
  return <style>{CSS}</style>;
}
