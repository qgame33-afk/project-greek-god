// The printable recap's paper palette (Print or save → `?view=ledger`). Print is the one place the
// app is not dark: ink on white, gold as bronze, the AI label as ink blue, so these are literal
// colours by necessity. Scoped to #pgg-review inside @media print.
export const CSS = `
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
    /* the V3 tokens, ink on paper (gold prints as bronze, the AI label as ink blue) */
    --card: #fff; --card-2: #f5f2eb; --card-3: #ece7dc; --surface: #fff; --control: #f5f2eb; --track: #ece7dc;
    --text: #17120a; --text-3: #5d636c; --gold: #7d5c2e; --gold-soft: #f4ecdc; --gold-line: #b89a62; --ai: #1f4f99; --ai-soft: #eef3fb; --ai-line: #9db8e0; --danger: #a3361f;
    /* the old tokens, ink on paper (leaf prints as bronze, the AI tag as ink blue) */
    --night: #fff; --obsidian: #fff; --m1: #fff; --m2: #fff; --m3: #f5f2eb; --m4: #ece7dc; --m5: #e4ddcf;
    --vein: #ece6d9; --vein-2: #ddd5c5; --vein-3: #c9bfa9; --ui-line: #9a917f;
    --ivory: #17120a; --stone: #3f434a; --ash: #5d636c; --disabled: #9a917f;
    --leaf-100: #8a6a35; --leaf-200: #7d5c2e; --leaf-300: #7d5c2e; --leaf-400: #7d5c2e; --leaf-500: #6b4f27; --leaf-600: #5c4421; --leaf-700: #c9b48a;
    --leaf-line: #b89a62; --leaf-tint: #f4ecdc;
    --aegean: #1f4f99; --aegean-line: #9db8e0; --aegean-tint: #eef3fb; --cinnabar: #a3361f;
    --spot: none;
    --grad-card: linear-gradient(#fff, #fff);
    --grad-spotlight: linear-gradient(#fff, #fff);
    --grad-monument-border: linear-gradient(180deg, #b89a62, #e5dccb);
    --e1: none; --e2: none;
    color: var(--text-1);
    font-size: 12px;
  }
  #pgg-review .review-grid { display: block !important; }
  /* section cards in reading order (Physical, Training, Nutrition, Recovery), one column */
  #pgg-review .review-sections { display: flex !important; flex-direction: column; gap: 10px; margin-top: 10px !important; }
  #pgg-review .review-sections > div { display: contents !important; }
  #pgg-review .review-card, #pgg-review article { box-shadow: none !important; }
  #pgg-review .review-grid > * { margin-bottom: 10px; }
  /* tall cards may continue on the next page, but only between whole blocks */
  #pgg-review .review-card { break-inside: auto; }
  #pgg-review article, #pgg-review .review-sub, #pgg-review .review-metrics, #pgg-review figure { break-inside: avoid; page-break-inside: avoid; }
  #pgg-review .review-card > div:first-child, #pgg-review .review-subhead { break-after: avoid; page-break-after: avoid; }
  #pgg-review .review-priorities { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; }
  #pgg-review .review-priorities article { padding: 12px !important; }
  #pgg-review section[aria-labelledby="priorities-title"] { margin-top: 16px !important; break-inside: avoid; }
  #pgg-review img { break-inside: avoid; }
  #pgg-review .review-chart-grid { stroke: #e6dfd0 !important; }
}
`;
