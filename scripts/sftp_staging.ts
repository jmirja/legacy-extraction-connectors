import { createHash } from "crypto";
import {
  createReadStream,
  readdirSync,
  statSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "fs";
import { join, basename } from "path";

interface ManifestEntry {
  filename: string;
  sha256: string;
  sizeBytes: number;
  stagedAt: string;
  processedAt?: string;
  status: "staged" | "processed" | "failed";
  sourcePath: string;
  stagingPath: string;
  notes?: string;
}

interface Manifest {
  version: 1;
  lastUpdated: string;
  entries: ManifestEntry[];
}

const REMOTE_INBOUND = join(process.cwd(), "inputs//SFTP_Simulation", "remote", "inbound");
const STAGING_DIR = join(process.cwd(), "staging");
const PROCESSED_DIR = join(process.cwd(), "processed");
const MANIFEST_PATH = join(process.cwd(), "manifests", "sftp_processed_manifest.json");

function ensureDirs() {
  for (const dir of [STAGING_DIR, PROCESSED_DIR, join(process.cwd(), "manifests")]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { version: 1, lastUpdated: new Date().toISOString(), entries: [] };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

function saveManifest(manifest: Manifest) {
  manifest.lastUpdated = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function main() {
  console.log("📡 SFTP Simulation – Staging Workflow\n");
  ensureDirs();

  const manifest = loadManifest();
  const alreadySeen = new Set(manifest.entries.map((e) => e.sha256));

  if (!existsSync(REMOTE_INBOUND)) {
    console.error(`Remote inbound folder not found: ${REMOTE_INBOUND}`);
    process.exit(1);
  }

  const remoteFiles = readdirSync(REMOTE_INBOUND)
    .filter((f) => f.endsWith(".csv") || f.endsWith(".xlsx") || f.endsWith(".txt"))
    .map((f) => join(REMOTE_INBOUND, f));

  if (remoteFiles.length === 0) {
    console.log("No files found in remote inbound.");
    return;
  }

  console.log(`Found ${remoteFiles.length} file(s) in remote inbound:\n`);

  let newCount = 0;
  let skippedCount = 0;

  for (const remotePath of remoteFiles) {
    const filename = basename(remotePath);
    const stats = statSync(remotePath);
    const sha256 = await computeSha256(remotePath);

    process.stdout.write(`  ${filename}  →  `);

    if (alreadySeen.has(sha256)) {
      console.log("SKIPPED (already in manifest)");
      skippedCount++;
      continue;
    }

    // Copy to staging
    const stagingPath = join(STAGING_DIR, filename);
    copyFileSync(remotePath, stagingPath);

    const entry: ManifestEntry = {
      filename,
      sha256,
      sizeBytes: stats.size,
      stagedAt: new Date().toISOString(),
      status: "staged",
      sourcePath: remotePath,
      stagingPath,
      notes: "Copied from simulated SFTP inbound",
    };

    manifest.entries.push(entry);
    alreadySeen.add(sha256);
    newCount++;

    console.log(`STAGED  (SHA-256: ${sha256.slice(0, 12)}…)`);
  }

  saveManifest(manifest);

  console.log("\n" + "=".repeat(80));
  console.log("STAGING SUMMARY");
  console.log("=".repeat(80));
  console.log(`New files staged     : ${newCount}`);
  console.log(`Already processed    : ${skippedCount}`);
  console.log(`Total in manifest    : ${manifest.entries.length}`);
  console.log(`Manifest location    : ${MANIFEST_PATH}`);
  console.log("");

  // Show current manifest status
  console.log("Current Manifest:");
  console.table(
    manifest.entries.map((e) => ({
      File: e.filename,
      Status: e.status,
      "SHA-256": e.sha256.slice(0, 12) + "…",
      Staged: e.stagedAt.slice(0, 19),
      Size: e.sizeBytes.toLocaleString() + " B",
    }))
  );

  console.log("\n✅ Staging complete. Files are ready in ./staging/");
  console.log("   Next: run schema checks / processing, then mark as processed.");
}

/**
 * Helper you can call later after successful processing
 * Example: markAsProcessed("orders_2026-10-31.csv")
 */
export function markAsProcessed(filename: string) {
  const manifest = loadManifest();
  const entry = manifest.entries.find((e) => e.filename === filename);

  if (!entry) {
    throw new Error(`File ${filename} not found in manifest`);
  }

  if (entry.status === "processed") {
    console.log(`${filename} is already marked as processed`);
    return;
  }

  // Move from staging → processed
  const target = join(PROCESSED_DIR, filename);
  renameSync(entry.stagingPath, target);

  entry.status = "processed";
  entry.processedAt = new Date().toISOString();
  entry.stagingPath = target; // update path

  saveManifest(manifest);
  console.log(`✅ Marked ${filename} as processed and moved to ./processed/`);
}

// Allow running directly
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}