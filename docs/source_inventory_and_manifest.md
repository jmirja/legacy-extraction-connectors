# Source Inventory & Ingestion Manifest

## 1. ERP Order Exports

| Filename                              | Rows     | Date Range          | SHA-256 (first 12) | Redelivered          | Notes |
|---------------------------------------|----------|---------------------|----------------|-----------------|-------|
| orders_2026-10-28.csv                 | 12   | 2026-10-28 → 2026-10-28 | `c90853fb441f…`     | No          | Daily file |
| orders_2026-10-29.csv                 | 12   | 2026-10-29 → 2026-10-29 | `298cc0ecd987…`     | No          | Original |
| orders_2026-10-29_REDELIVERED.csv     | 12   | 2026-10-29 → 2026-10-29 | `298cc0ecd987…`     | **Yes** | Duplicate of orders_2026-10-29.csv |
| orders_2026-10-30.csv                 | 12   | 2026-10-30 → 2026-10-30 | `5adddae0dc76…`     | Unique          | Daily file |

**Pattern observed**: Daily files named `orders_YYYY-MM-DD.csv`.  
**Deduplication rule**: Any file whose SHA-256 already exists is treated as a redelivery and is **not** loaded.

**Total unique rows to ingest**: 36

---

## 2. SFTP Inbound (Simulated)

**Source path**: `SFTP_Simulation/remote/inbound/`  
**Staging path**: `staging/`  
**Processed path**: `processed/`  
**Manifest**: `manifests/sftp_processed_manifest.json`

| Filename                              | SHA-256 (first 12) | Size      | Status  | 
|---------------------------------------|--------------------|-----------|---------|
| orders_2026-10-31.csv                 | c445df2aac9b…      | 796 B     | staged  |
| orders_2026-11-01.csv                 | a04fd2df7946…      | 791 B     | staged  | 
| warehouse_inventory_2026-11-01.csv    | 55ff558aacf9…      | 284 B     | staged  |

**Ingestion rule**: A file is considered already seen if its SHA-256 exists in the manifest, regardless of filename.
