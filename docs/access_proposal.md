# Access Proposal – SEC-2026-104  
**Legacy Data Extraction for Northstar Retail**  
**Date:** 2026-11-10  
**Status:** For Security Review

## 1. Context

Request **SEC-2026-104** for production ERP Orders API access was **DENIED**.

- Requested scopes included `orders.read`, `orders.write`, and `admin`.
- Denial reason: *“Overprivileged token; production write/admin scopes and unapproved exposure of customer fields.”*

Security requirements stated:
- Read-only scoped access  
- Minimum necessary fields  
- Documented retention and audit logs  
- Approved service account  

**Business need:** Daily order and settlement reporting completed by **09:00 JST**.

---

## 2. Options Comparison

| Criterion              | Option A<br>Read-only API                  | Option B<br>Read Replica                          | Option C<br>Scheduled File Drop                      |
|------------------------|--------------------------------------------|---------------------------------------------------|------------------------------------------------------|
| **Freshness**          | Near real-time                             | Near real-time (subject to lag)                   | Batch (can meet 09:00 JST with overnight drop)       |
| **Authorization**      | Scoped read-only service identity          | Read-only role + network allowlist                | Least-privilege service account (list + download only) |
| **Data Minimization**  | Possible via field-level scoping           | Possible via limited views                        | Excellent (only required columns exported)           |
| **Auditability**       | Good (API access logs)                     | Medium                                            | Excellent (checksum + manifest + file retention)     |
| **Operational Burden** | Medium (token rotation, rate limits)       | High (replica management, lag monitoring)         | Low–Medium (already partially implemented)           |
| **Incident Response**  | Revoke token / rotate credentials          | Network isolation + role revocation               | Disable account + quarantine files                   |
| **Fit for Legacy ERP** | Fragile / limited endpoint maturity        | Requires additional infrastructure                | Natural fit (system already produces CSV/XLSX)       |

---

## 3. Recommendation

**Primary recommendation: Option C – Scheduled File Drop**

### Why Option C
- The legacy ERP already produces daily CSV exports and finance settlement files.
- We have already implemented a secure local staging workflow with SHA-256 deduplication, schema validation, and a processed-file manifest.
- It fully satisfies Security’s requirements (read-only, minimum fields, audit trail, approved service account).
- Lowest blast radius and strongest auditability of the three options.
- Can reliably meet the 09:00 JST reporting SLA with an overnight secure drop.

### Proposed Controls
- Restricted SFTP / secure object storage location  
- Service account with **list + download only** permissions  
- Mandatory SHA-256 checksum verification  
- Schema validation before any downstream load  
- Processed manifest to prevent reprocessing  
- Encryption at rest + documented retention policy  

---

## 4. Secondary Option

**Option A (Read-only API)** is acceptable as a future enhancement **only if**:
- Scopes are strictly limited to the minimum required fields  
- A dedicated read-only service identity is approved  
- No write or admin permissions are ever granted  

**Option B (Read Replica)** is not recommended at this time due to higher operational complexity and infrastructure cost for a legacy source that already supports file export.

---

## 5. Request

We request Security approval to proceed with **Option C – Scheduled File Drop**, using the controls outlined above.

We can provide:
- Current ingestion manifest and data-quality report  
- Proposed service-account permissions  
- Retention and encryption details  

---

**Prepared by:** Mirja Adnan Hossain
**Related ticket:** SEC-2026-104