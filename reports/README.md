# Reports

This directory contains small, reviewable Markdown summaries. Large generated
outputs belong under `reports/generated/` and are ignored by Git.

- [`nav_nfl_2025_moneyline.md`](nav_nfl_2025_moneyline.md): Nav-backed NFL
  full-game moneyline experiment, candidate filters, and interpretation.
- [`nfl_2025_results.md`](nfl_2025_results.md): broader all-market NFL result
  snapshot.
- `generated/nfl_2025_moneyline_picks.xlsx`: locally generated workbook with
  game matrix, candidate ledgers, and summary sheets.

The workbook is reproducible from the cached Parquet and CSV outputs:

```bash
PYTHONPATH=/usr/lib/python3/dist-packages \
  .venv-nav/bin/python scripts/export_nfl_2025_picks_excel.py
```
