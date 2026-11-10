import { createReadStream, readdirSync, existsSync, readFileSync } from "fs";
import { join, basename } from "path";
import { parse } from "csv-parse";
import { pipeline } from "stream/promises";

interface ValidationIssue {
  type: "error" | "warning" | "info";
  code: string;
  message: string;
  count?: number;
  examples?: string[];
}

interface FileValidationResult {
  filename: string;
  source: "ERP" | "SFTP";
  rowCount: number;
  columns: string[];
  issues: ValidationIssue[];
  isClean: boolean;
  grain: string;
}

// ---------- Configuration (adjust after you inspect real headers) ----------
const MANDATORY_COLUMNS = [
  "order_id",           
  "order_date",
  "order_status",
  "unit_price_jpy", 
  "gross_amount_jpy",   
  "order_status",
  "quantity",    
  "channel"            
];

const DATE_COLUMNS = ["order_date", "OrderDate"];
const QTY_COLUMNS = ["quantity", "qty", "Quantity"];
const ID_COLUMNS = ["order_id", "OrderID", "orderId", "product_id", "customer_id"];

// grain – order_id + customer_id 
const GRAIN_CANDIDATES = [
  ["order_id", "customer_id"],
  ["sku", "warehouse_id"],
];

// --------------------------------------------------------------------------

function findColumn(columns: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const found = columns.find((col) => col.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  // fuzzy
  for (const c of candidates) {
    const found = columns.find((col) => col.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
}

async function validateFile(
  filePath: string,
  source: "ERP" | "SFTP"
): Promise<FileValidationResult> {
  const filename = basename(filePath);
  const issues: ValidationIssue[] = [];
  let columns: string[] = [];
  let rowCount = 0;

  // For duplicate detection
  const seenKeys = new Map<string, number>();
  let grainUsed = "unknown";

  // Counters
  let nullIdCount = 0;
  let negativeQtyCount = 0;
  let invalidDateCount = 0;
  const nullIdExamples: string[] = [];
  const negQtyExamples: string[] = [];
  const badDateExamples: string[] = [];

  await pipeline(
    createReadStream(filePath),
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }),
    async function* (sourceStream) {
      for await (const record of sourceStream) {
        if (rowCount === 0) {
          columns = Object.keys(record);
        }
        rowCount++;

        // --- 1. Non-null Order / Transaction ID ---
        const idCol = findColumn(columns, ID_COLUMNS);
        if (idCol) {
          const val = record[idCol];
          if (val === null || val === undefined || String(val).trim() === "") {
            nullIdCount++;
            if (nullIdExamples.length < 3) {
              nullIdExamples.push(`row ${rowCount}`);
            }
          }
        }

        // --- 2. Positive quantity ---
        const qtyCol = findColumn(columns, QTY_COLUMNS);
        if (qtyCol) {
          const raw = record[qtyCol];
          const num = Number(raw);
          if (!Number.isFinite(num) || num <= 0) {
            negativeQtyCount++;
            if (negQtyExamples.length < 3) {
              negQtyExamples.push(`row ${rowCount}: "${raw}"`);
            }
          }
        }

        // --- 3. Valid dates ---
        for (const candidate of DATE_COLUMNS) {
          const dateCol = findColumn(columns, [candidate]);
          if (dateCol && record[dateCol]) {
            const d = new Date(record[dateCol]);
            if (isNaN(d.getTime())) {
              invalidDateCount++;
              if (badDateExamples.length < 3) {
                badDateExamples.push(`row ${rowCount}: "${record[dateCol]}"`);
              }
            }
          }
        }

        // --- 4. Duplicate detection (we decide grain on first rows) ---
        if (rowCount === 1) {
          // Try to detect best grain
          for (const candidate of GRAIN_CANDIDATES) {
            if (candidate.every((c) => findColumn(columns, [c]))) {
              grainUsed = candidate.join(" + ");
              break;
            }
          }
        }

        // Build key according to grain
        let key = "";
        if (grainUsed.includes("+")) {
          const parts = grainUsed.split(" + ").map((c) => {
            const col = findColumn(columns, [c]);
            return col ? String(record[col] ?? "") : "";
          });
          key = parts.join("|");
        } else {
          const col = findColumn(columns, [grainUsed]);
          key = col ? String(record[col] ?? "") : `row-${rowCount}`;
        }

        seenKeys.set(key, (seenKeys.get(key) ?? 0) + 1);
      }
    }
  );

  // ----- Build issues -----

  // Mandatory columns
  const missing: string[] = [];
  for (const req of MANDATORY_COLUMNS) {
    if (!findColumn(columns, [req])) {
      missing.push(req);
    }
  }
  if (missing.length > 0) {
    issues.push({
      type: "error",
      code: "MISSING_COLUMNS",
      message: `Missing mandatory columns: ${missing.join(", ")}`,
    });
  }

  if (nullIdCount > 0) {
    issues.push({
      type: "error",
      code: "NULL_ORDER_ID",
      message: `Found ${nullIdCount} rows with null/empty order/transaction ID`,
      count: nullIdCount,
      examples: nullIdExamples,
    });
  }

  if (negativeQtyCount > 0) {
    issues.push({
      type: "error",
      code: "NON_POSITIVE_QTY",
      message: `Found ${negativeQtyCount} rows with quantity <= 0 or non-numeric`,
      count: negativeQtyCount,
      examples: negQtyExamples,
    });
  }

  if (invalidDateCount > 0) {
    issues.push({
      type: "error",
      code: "INVALID_DATE",
      message: `Found ${invalidDateCount} rows with invalid dates`,
      count: invalidDateCount,
      examples: badDateExamples,
    });
  }

  // Duplicates
  const duplicates = [...seenKeys.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    const totalDupRows = duplicates.reduce((sum, [, c]) => sum + c, 0);
    issues.push({
      type: "warning",
      code: "DUPLICATE_KEYS",
      message: `Found ${duplicates.length} duplicate keys under grain "${grainUsed}" (affecting ${totalDupRows} rows)`,
      count: duplicates.length,
      examples: duplicates.slice(0, 3).map(([k, c]) => `${k} (×${c})`),
    });
  }

  // Info: extra columns
  issues.push({
    type: "info",
    code: "COLUMNS",
    message: `Columns present: ${columns.join(", ")}`,
  });

  const isClean = issues.every((i) => i.type !== "error");

  return {
    filename,
    source,
    rowCount,
    columns,
    issues,
    isClean,
    grain: grainUsed,
  };
}

async function main() {
  console.log("🔎 Running Schema & Data Quality Checks\n");

  const results: FileValidationResult[] = [];

  // 1. ERP files (skip redelivered)
  const erpDir = join(process.cwd(), "inputs\\ERP_Order_Exports");
  const erpFiles = readdirSync(erpDir)
    .filter((f) => f.endsWith(".csv") && !f.toUpperCase().includes("REDELIVERED"))
    .map((f) => join(erpDir, f));

  for (const file of erpFiles) {
    process.stdout.write(`  Checking ${basename(file)} ... `);
    const result = await validateFile(file, "ERP");
    results.push(result);
    console.log(result.isClean ? "✅ CLEAN" : "❌ ISSUES FOUND");
  }

  // 2. Staged SFTP files
  const stagingDir = join(process.cwd(), "staging");
  if (existsSync(stagingDir)) {
    const stagedFiles = readdirSync(stagingDir)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => join(stagingDir, f));

    for (const file of stagedFiles) {
      process.stdout.write(`  Checking ${basename(file)} ... `);
      const result = await validateFile(file, "SFTP");
      results.push(result);
      console.log(result.isClean ? "✅ CLEAN" : "❌ ISSUES FOUND");
    }
  }

  // ---------- Report ----------
  console.log("\n" + "=".repeat(100));
  console.log("DATA QUALITY REPORT");
  console.log("=".repeat(100));

  for (const r of results) {
    console.log(`\n📄 ${r.filename}  (${r.source})  –  ${r.rowCount.toLocaleString()} rows`);
    console.log(`   Grain used for duplicate check: ${r.grain}`);
    console.log(`   Status: ${r.isClean ? "✅ CLEAN" : "❌ HAS ERRORS"}`);

    for (const issue of r.issues) {
      const icon = issue.type === "error" ? "❌" : issue.type === "warning" ? "⚠️" : "ℹ️";
      console.log(`   ${icon} [${issue.code}] ${issue.message}`);
      if (issue.examples && issue.examples.length > 0) {
        console.log(`      Examples: ${issue.examples.join(" | ")}`);
      }
    }
  }

  // Summary
  const cleanCount = results.filter((r) => r.isClean).length;
  const errorCount = results.filter((r) => !r.isClean).length;

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));
  console.log(`Files checked     : ${results.length}`);
  console.log(`Clean             : ${cleanCount}`);
  console.log(`With errors       : ${errorCount}`);

  // Write machine-readable report
  const reportPath = join(process.cwd(), "staging", "data_quality_report.json");
  const fs = await import("fs/promises");
  await fs.writeFile(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
  );
  console.log(`\n✅ Full report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});