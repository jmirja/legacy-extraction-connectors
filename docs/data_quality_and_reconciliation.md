# Data Quality Log & Reconciliation Note

## Schema Validation Results

| File | Source | Rows | Status | Key Issues |
|------|--------|------|--------|----------|
| orders_2026-10-28.csv | ERP | 12 | ✅ Clean | No Issue |
| orders_2026-10-29.csv | ERP | 12 | ✅ Clean | No Issue |
| orders_2026-10-30.csv | ERP | 12 | ✅ Clean | No Issue |
| orders_2026-10-31.csv | SFTP | 12 |✅ Clean | No Issue |
| orders_2026-11-01.csv | SFTP | 12 |✅ Clean | No Issue |
| warehouse_inventory_2026-11-01.csv | SFTP | 8 | ❌ Error | Missing mandatory columns |

### Detailed Findings

- **Mandatory columns**  
All five order files contain the required columns. The warehouse inventory file is missing order-related columns because it has a different structure and contains inventory-specific fields.

- **Null Order IDs**  
None found in the five order files.

- **Non-positive quantities**  
None found. All detected quantities were positive and numeric.

- **Invalid dates**  
None found. All detected dates were successfully parsed.

- **Duplicate Transaction IDs**  
Grain used: `order_id + customer_id`
Duplicate keys found: 0
No duplicate records detected within individual files.

**Interpretation**: No duplicate keys were detected in the five order files using the selected grain. Each order/customer combination was unique within its respective file.

### Conclusion
A total of six files were checked. All five order files passed the mandatory quality checks. The warehouse inventory file failed because it does not match the current order schema and should be validated separately using an inventory-specific schema.

The redelivered file was already excluded in Step 1.

---

## Reconciliation Note – Finance Settlement vs ERP

**Settlement file**: `finance_settlement_2026-10-30.xlsx` (extracted from email)  
**ERP file used**  : `orders_2026-10-30.csv`

| Metric          | Settlement     | ERP            | Difference     | Match |
|-----------------|----------------|----------------|----------------|--------|
| Gross Amount    | 176,930        | 176,930        | 0              | ✅ Yes    |
| Net / Paid Amount | 172,590   | 152,790   | 19,800    | ❌ No     |
| Refunds         | 4,340          | 4,340          | 0              | ✅ Yes    |
| Reported / Unique Orders   | 12          | 12          | 0      | ✅Yes     |

### Explanation of Differences

- **Gross Amount:** Both settlement and ERP report JPY 176,930, so the gross amount matches.
- **Refunds:** Settlement reports JPY 4,340 in refunds, matching the two refunded ERP orders.
- **Net Amount:** Settlement reports JPY 172,590, while ERP paid orders total JPY 152,790. The JPY 19,800 difference corresponds exactly to two pending ERP orders.
- **Order Count:** Both systems report 12 orders.
- **Quantity:** ERP records 30 units. Settlement does not provide a quantity field; its reported_orders represents order count, not item quantity.

### Conclusion
- The reconciliation confirms that gross amounts, refunds, and order counts match between Finance Settlement and ERP.
- The remaining JPY 19,800 difference is explained by pending orders included in settlement net amounts but excluded from ERP paid orders.
- No unexplained financial discrepancy was identified. However, settlement net should not be treated as recognized revenue until pending-order treatment is confirmed against the business rules.