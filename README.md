# Legacy Extraction Connectors

A compact data-ingestion and reconciliation toolkit for legacy ERP and SFTP-style file feeds. It inventories source files, stages inbound drops with checksum-based deduplication, validates schemas/data quality, and reconciles finance settlement output against ERP totals.

Note: the raw data source for this project lives under `inputs/`.

## Project goals

- Ingest and inventory ERP order CSV exports
- Simulate SFTP inbound delivery and prevent duplicate reprocessing
- Check schema and row-level quality before downstream use
- Reconcile settlement data from email-attached Excel files against ERP figures
- Maintain audit-friendly artifacts in `staging/`, `processed/`, and `manifests/`

## Source data

- `inputs/ERP_Order_Exports/` — daily ERP order CSV exports, including redelivered duplicates
- `inputs/Inbox_Attachments/` — finance settlement email and extracted Excel attachment
- `inputs/SFTP_Simulation/remote/inbound/` — simulated inbound drop for SFTP processing

## Repository layout

- `scripts/` — ingestion, validation, and reconciliation logic
- `staging/` — generated quality reports and intermediate outputs
- `processed/` — finalized or marked-processed files
- `manifests/` — durable processed-file manifest and tracking metadata
- `docs/` — security/access proposal and reconciliation notes

## Available commands

```bash
npm install
npm run inventory
npm run sftp
npm run schema
npm run reconcile
```

## Workflow

1. Inventory ERP exports
   - scans `inputs/ERP_Order_Exports/`
   - computes SHA-256 checksums
   - flags duplicate/redelivered files
   - writes `staging/erp_inventory.json`

2. Stage simulated SFTP files
   - scans `inputs/SFTP_Simulation/remote/inbound/`
   - skips already-seen files using the manifest
   - copies new files into `staging/`
   - records state in `manifests/sftp_processed_manifest.json`

3. Run schema/data-quality checks
   - validates required order columns and dates
   - flags null IDs, invalid quantities, and duplicate keys
   - writes `staging/data_quality_report.json`

4. Reconcile finance settlement
   - extracts the Excel attachment from the email
   - compares settlement totals against matching ERP data
   - writes `staging/reconciliation_result.json`

## Output highlights

- `staging/erp_inventory.json` — ERP inventory and duplicate detection results
- `staging/data_quality_report.json` — validation findings
- `staging/reconciliation_result.json` — finance vs ERP match summary
- `manifests/sftp_processed_manifest.json` — exact-once processing manifest

## Notes

- The project intentionally treats `inputs/` as the authoritative raw source.
- The warehouse inventory CSV is structurally different from order data and should be validated using an inventory-specific schema instead of the order schema.
- The settlement reconciliation confirms gross amounts, refunds, and order counts align with ERP data; the remaining net-amount difference is explained by pending orders.
