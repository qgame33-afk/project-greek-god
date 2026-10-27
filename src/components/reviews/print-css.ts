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
    --bg: #fff;
    /* the V3 tokens, ink on paper (gold prints as bronze, the AI label as ink blue) */
    --card: #fff; --card-2: #f5f2eb; --card-3: #ece7dc; --sheet: #fff; --sheet-card: #fff; --surface: #fff; --control: #f5f2eb; --track: #ece7dc; --band: #ddd5c5;
    --text: #17120a; --text-2: #3f434a; --text-3: #5d636c; --line: #ddd5c5; --ui-line: #9a917f;
    --gold: #7d5c2e; --gold-soft: #f4ecdc; --gold-line: #b89a62; --gold-ring: #b89a62;
    --ai: #1f4f99; --ai-soft: #eef3fb; --ai-line: #9db8e0; --danger: #a3361f; --danger-soft: #fbeae6;
    color: var(--text);
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
