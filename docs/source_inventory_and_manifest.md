# Source Inventory & Ingestion Manifest

## 1. ERP Order Exports

| Filename                              | Rows     | Date Range          | SHA-256 (full) | Status          | Notes |
|---------------------------------------|----------|---------------------|----------------|-----------------|-------|
| orders_2026-10-28.csv                 | 12,450   | 2026-10-28 → 2026-10-28 | `...`     | Unique          | Daily file |
| orders_2026-10-29.csv                 | 13,102   | 2026-10-29 → 2026-10-29 | `...`     | Unique          | Original |
| orders_2026-10-29_REDELIVERED.csv     | 13,102   | 2026-10-29 → 2026-10-29 | `...`     | **REDELIVERED** | Same SHA-256 as above – excluded from load |
| orders_2026-10-30.csv                 | 11,987   | 2026-10-30 → 2026-10-30 | `...`     | Unique          | Daily file |

**Pattern observed**: Daily files named `orders_YYYY-MM-DD.csv`.  
**Deduplication rule**: Any file whose SHA-256 already exists is treated as a redelivery and is **not** loaded.

**Total unique rows to ingest**: XX,XXX