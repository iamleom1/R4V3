import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const JOB = process.argv[2];
const RETENTION_DAYS = clampInteger(process.env.EDM_LOG_RETENTION_DAYS, 14, 1, 365);
const LOG_ROOT = path.resolve("logs", "edm");

const JOBS = {
  ingest: {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["ingest:edm"],
    logPrefix: "ingest"
  },
  healthcheck: {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["healthcheck:edm"],
    logPrefix: "healthcheck"
  }
};

if (!JOBS[JOB]) {
  console.error(`Unknown EDM job: ${JOB}`);
  process.exit(1);
}

const startedAt = new Date();
const dateStamp = startedAt.toISOString().replace(/[:]/g, "-");
const logDir = path.join(LOG_ROOT, JOB);
const logPath = path.join(logDir, `${dateStamp}.log`);
const metaPath = path.join(logDir, `${dateStamp}.json`);

fs.mkdirSync(logDir, { recursive: true });
pruneOldLogs(LOG_ROOT, RETENTION_DAYS);

const meta = {
  job: JOB,
  startedAt: startedAt.toISOString(),
  logPath
};
fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

const child = spawn(JOBS[JOB].command, JOBS[JOB].args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"]
});

const logStream = fs.createWriteStream(logPath, { flags: "a" });

function writeChunk(chunk, target) {
  const text = chunk.toString();
  target.write(text);
  logStream.write(text);
}

child.stdout.on("data", (chunk) => writeChunk(chunk, process.stdout));
child.stderr.on("data", (chunk) => writeChunk(chunk, process.stderr));

child.on("close", (code) => {
  const endedAt = new Date();
  const nextMeta = {
    ...meta,
    endedAt: endedAt.toISOString(),
    exitCode: code ?? 1,
    success: code === 0
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(nextMeta, null, 2)}\n`);
  logStream.end(() => process.exit(code ?? 1));
});

function pruneOldLogs(rootDir, retentionDays) {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of walk(rootDir)) {
    const stat = fs.statSync(entry);
    if (!stat.isFile()) {
      continue;
    }
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(entry);
    }
  }
}

function walk(dir) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...walk(fullPath));
    } else {
      entries.push(fullPath);
    }
  }
  return entries;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
