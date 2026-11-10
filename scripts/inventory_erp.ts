import { createHash } from "crypto";
import { createReadStream, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { parse } from "csv-parse";
import { pipeline } from "stream/promises";

interface FileInventory {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  sha256: string;
  rowCount: number;
  columns: string[];
  dateColumn: string | null;
  minDate: string | null;
  maxDate: string | null;
  isRedelivered: boolean;
  notes: string;
}

const ERP_DIR = join(process.cwd(), "inputs\\ERP_Order_Exports");

/**
 * Compute SHA-256 of a file efficiently (streaming)
 */
async function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Analyze a single CSV file
 */
async function analyzeCsv(filePath: string): Promise<Omit<FileInventory, "isRedelivered" | "notes">> {
  const filename = basename(filePath);
  const stats = statSync(filePath);
  const sha256 = await computeSha256(filePath);

  let columns: string[] = [];
  let rowCount = 0;
  let dateColumn: string | null = null;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  // Possible date column names (in order of preference)
  const DATE_CANDIDATES = [
    "order_date",
    "OrderDate",
    "orderDate",
    "date",
    "Date",
    "transaction_date",
    "created_at",
    "order_datetime",
  ];

  await pipeline(
    createReadStream(filePath),
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }),
    async function* (source) {
      for await (const record of source) {
        if (rowCount === 0) {
          columns = Object.keys(record);

          // Detect date column
          dateColumn =
            DATE_CANDIDATES.find((c) => columns.includes(c)) ??
            columns.find((c) => c.toLowerCase().includes("date")) ??
            null;
        }

        rowCount++;

        if (dateColumn && record[dateColumn]) {
          const d = String(record[dateColumn]).slice(0, 10); // take YYYY-MM-DD part
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        }
      }
    }
  );

  return {
    filename,
    fullPath: filePath,
    sizeBytes: stats.size,
    sha256,
    rowCount,
    columns,
    dateColumn,
    minDate,
    maxDate,
  };
}

async function main() {
  console.log("🔍 Scanning ERP_Order_Exports...\n");

  const files = readdirSync(ERP_DIR)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => join(ERP_DIR, f))
    .sort();

  if (files.length === 0) {
    console.error("No CSV files found in ERP_Order_Exports/");
    process.exit(1);
  }

  const results: FileInventory[] = [];

  // First pass – analyze every file
  for (const file of files) {
    process.stdout.write(`  Analyzing ${basename(file)} ... `);
    const info = await analyzeCsv(file);
    results.push({
      ...info,
      isRedelivered: false,
      notes: "",
    });
    console.log(`✓  (${info.rowCount.toLocaleString()} rows)`);
  }

  // Second pass – detect redelivered files by SHA-256
  const shaMap = new Map<string, string[]>(); // sha → list of filenames

  for (const r of results) {
    if (!shaMap.has(r.sha256)) shaMap.set(r.sha256, []);
    shaMap.get(r.sha256)!.push(r.filename);
  }

  for (const r of results) {
    const sameHash = shaMap.get(r.sha256)!;
    if (sameHash.length > 1) {
      // Prefer the one without "REDELIVERED" in the name as the original
      const hasRedeliveredName = r.filename.toUpperCase().includes("REDELIVERED");
      if (hasRedeliveredName) {
        r.isRedelivered = true;
        r.notes = `Duplicate of ${sameHash.find((n) => !n.toUpperCase().includes("REDELIVERED")) ?? sameHash[0]}`;
      } else {
        r.notes = `Original – also received as: ${sameHash
          .filter((n) => n !== r.filename)
          .join(", ")}`;
      }
    }
  }

  // Pretty print
  console.log("\n" + "=".repeat(100));
  console.log("ERP ORDER EXPORTS – SOURCE INVENTORY");
  console.log("=".repeat(100));

  console.table(
    results.map((r) => ({
      File: r.filename,
      Rows: r.rowCount.toLocaleString(),
      "Date Range": r.minDate && r.maxDate ? `${r.minDate} → ${r.maxDate}` : "—",
      "SHA-256 (first 12)": r.sha256.slice(0, 12) + "…",
      Redelivered: r.isRedelivered ? "YES ⚠️" : "No",
      Notes: r.notes || "—",
    }))
  );

  console.log("\n📋 Full column list per file:\n");
  for (const r of results) {
    console.log(`${r.filename}`);
    console.log(`  Columns (${r.columns.length}): ${r.columns.join(", ")}`);
    console.log(`  Date column used: ${r.dateColumn ?? "not detected"}`);
    console.log(`  Full SHA-256: ${r.sha256}`);
    console.log("");
  }

  // Summary for the manifest
  const uniqueFiles = results.filter((r) => !r.isRedelivered);
  const totalRows = uniqueFiles.reduce((sum, r) => sum + r.rowCount, 0);

  console.log("=".repeat(100));
  console.log("SUMMARY FOR MANIFEST");
  console.log("=".repeat(100));
  console.log(`Total files found          : ${results.length}`);
  console.log(`Redelivered (excluded)     : ${results.filter((r) => r.isRedelivered).length}`);
  console.log(`Unique files to load       : ${uniqueFiles.length}`);
  console.log(`Total unique rows          : ${totalRows.toLocaleString()}`);
  console.log("");

  // Optional: write a machine-readable version
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "ERP_Order_Exports",
    files: results,
    uniqueRowCount: totalRows,
  };

  const fs = await import("fs/promises");
  await fs.writeFile(
    join(process.cwd(), "staging", "erp_inventory.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("✅ Machine-readable inventory written to staging/erp_inventory.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});