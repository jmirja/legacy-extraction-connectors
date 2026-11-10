---
name: legacy-sftp-staging
description: Local simulation of SFTP inbound ingestion for legacy systems. Copies files from a simulated remote inbound folder into staging, records SHA-256 checksums, and maintains a durable processed-file manifest. Use for SFTP_Simulation/remote/inbound workflows or any local-folder-as-SFTP pattern. Prevents reprocessing of the same file.
---

# Legacy SFTP Staging Skill

## When to use
- Any time you need to treat a local folder as if it were a remote SFTP inbound directory
- Especially for the path `SFTP_Simulation/remote/inbound`
- When you must guarantee exactly-once processing via checksums

## Core Workflow
1. Scan source directory (`SFTP_Simulation/remote/inbound`)
2. For every file:
   - Compute SHA-256
   - If SHA-256 already exists in the manifest → skip
   - Otherwise copy to `staging/` and append to manifest with status `staged`
3. After downstream processing succeeds, call `markAsProcessed(filename)`
   - File is moved to `processed/`
   - Manifest status becomes `processed`

## Key files
- Script: `scripts/sftp_staging.ts`
- Manifest: `manifests/sftp_processed_manifest.json`
- Staging area: `staging/`
- Final location: `processed/`

## Commands
```bash
npm run sftp          # run the staging workflow