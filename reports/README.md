# Reports

This directory contains small, reviewable Markdown summaries. Large generated
outputs belong under `reports/generated/` and are ignored by Git.

- [`nav_nfl_2025_moneyline.md`](nav_nfl_2025_moneyline.md): Nav-backed NFL
  full-game moneyline experiment, candidate filters, and interpretation.
- [`nfl_2025_results.md`](nfl_2025_results.md): broader all-market NFL result
  snapshot.
- `generated/nfl_2025_moneyline_picks.xlsx`: locally generated workbook with
  game matrix, candidate ledgers, and summary sheets.

The workbooks are reproducible from the cached Parquet and CSV outputs:

- WNBA 2026 analysis: [wnba_2026_moneyline.md](wnba_2026_moneyline.md)
- WNBA 2026 validation: [wnba_2026_validation.json](wnba_2026_validation.json)
- WNBA 2026 workbook: generated/wnba_2026_moneyline_picks.xlsx
- WNBA 2025 analysis: [wnba_2025_moneyline.md](wnba_2025_moneyline.md)
- WNBA 2025 validation: [wnba_2025_validation.json](wnba_2025_validation.json)
- WNBA 2025 workbook: generated/wnba_2025_moneyline_picks.xlsx
- NFL validation evidence: [nfl_2025_validation.json](nfl_2025_validation.json)
- NBA 2025 analysis: [nba_2025_moneyline.md](nba_2025_moneyline.md) · [validation](nba_2025_validation.json)
- MLB 2025 analysis: [mlb_2025_moneyline.md](mlb_2025_moneyline.md) · [validation](mlb_2025_validation.json)
- MLB 2026 analysis: [mlb_2026_moneyline.md](mlb_2026_moneyline.md) · [validation](mlb_2026_validation.json)
- NHL 2025 analysis: [nhl_2025_moneyline.md](nhl_2025_moneyline.md) · [validation](nhl_2025_validation.json)
- NCAAF 2025 analysis: [ncaaf_2025_moneyline.md](ncaaf_2025_moneyline.md) · [validation](ncaaf_2025_validation.json)
- NCAAB 2025 analysis: [ncaab_2025_moneyline.md](ncaab_2025_moneyline.md) · [validation](ncaab_2025_validation.json); the official source is explicitly limited coverage.

Generated workbooks are local artifacts under `reports/generated/`. Successful
GitHub-enabled refreshes mirror them to the stable `generated-workbooks` Release
instead of committing changing binary files to Git history. For large seasons,
the wide candidate matrix is limited to the top 500 candidates for Excel
usability; the complete candidate CSV outputs and full DuckDB ledger tables
remain in the local experiment.

```bash
PYTHONPATH=/usr/lib/python3/dist-packages \
  .venv-nav/bin/python scripts/export_nfl_2025_picks_excel.py
```
