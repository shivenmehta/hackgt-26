import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const candidates = process.env.PYTHON_COMMAND
  ? [[process.env.PYTHON_COMMAND]]
  : [
      ["python"],
      ["py", "-3"],
      ["python3"],
      [
        join(
          homedir(),
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
        ),
      ],
    ];
const python = candidates.find(
  ([command, ...args]) =>
    spawnSync(command, [...args, "--version"], { windowsHide: true }).status ===
    0,
);
if (!python)
  throw new Error(
    "Install Python 3.10+ or set PYTHON_COMMAND to its executable path.",
  );
const env = {
  ...process.env,
  LOCATION_SERVICE_TOKEN:
    process.env.LOCATION_SERVICE_TOKEN || randomBytes(32).toString("hex"),
};
const port = env.LOCATION_SERVICE_PORT || "8765";
env.LOCATION_SERVICE_URL = `http://127.0.0.1:${port}`;
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 300).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function start(command, args) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  return child;
}
start(python[0], [...python.slice(1), "-B", "-m", "src.lib.location.service"]);
let ready = false;
for (let i = 0; i < 40; i++) {
  try {
    const response = await fetch(`${env.LOCATION_SERVICE_URL}/health`, {
      headers: { Authorization: `Bearer ${env.LOCATION_SERVICE_TOKEN}` },
      signal: AbortSignal.timeout(500),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready) {
  console.error(
    "Location service did not start. Check the port and Python configuration.",
  );
  stop(1);
} else {
  const args = process.argv.slice(2);
  const production = args.includes("--production");
  const next = join("node_modules", "next", "dist", "bin", "next");
  if (!existsSync(next)) {
    console.error("Run npm ci first.");
    stop(1);
  } else
    start(process.execPath, [
      next,
      production ? "start" : "dev",
      ...(production ? [] : ["--webpack"]),
      ...args.filter((a) => a !== "--production"),
    ]);
}
