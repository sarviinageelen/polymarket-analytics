# Contributing

## Before opening a change

1. Keep raw data and generated databases out of commits.
2. Make joins by `condition_id`, not display names.
3. Preserve the cache-first behavior unless a refresh is explicitly requested.
4. Add or update tests for replay and accounting changes.
5. Update the relevant documentation when the data contract or collection
   window changes.

Run:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
```

For changes to the Nav experiment, also rebuild the local DuckDB and inspect
the audit report before updating any conclusions.
