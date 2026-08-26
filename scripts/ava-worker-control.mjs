import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const action = process.argv[2] ?? "status";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const label = "com.projectava.analysis-worker";
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${label}`;
const launchAgents = path.join(os.homedir(), "Library", "LaunchAgents");
const plist = path.join(launchAgents, `${label}.plist`);
const logs = path.join(root, ".ava-runtime");
const xml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function installed() {
  return spawnSync("launchctl", ["print", target], { stdio: "ignore" }).status === 0;
}

function writePlist() {
  mkdirSync(launchAgents, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>
<string>${xml(process.execPath)}</string><string>--env-file=.env.local</string>
<string>${xml(path.join(root, "scripts", "analysis-worker.mjs"))}</string>
</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict>
<key>MEDIAPIPE_PYTHON</key><string>${xml(path.join(root, ".venv", "bin", "python"))}</string>
<key>PATH</key><string>${xml(`${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`)}</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(path.join(logs, "analysis-worker.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, "analysis-worker.error.log"))}</string>
</dict></plist>\n`;
  writeFileSync(plist, contents, { mode: 0o600 });
}

if (action === "start") {
  writePlist();
  if (!installed()) {
    // RunAtLoad starts a newly bootstrapped service. A simultaneous kickstart
    // races launchd and can return EX_OSERR even though the service is healthy.
    execFileSync("launchctl", ["bootstrap", domain, plist], { stdio: "inherit" });
  } else {
    execFileSync("launchctl", ["kickstart", "-k", target], { stdio: "inherit" });
  }
  console.log(`AVA analysis worker started (${label}). Logs: ${logs}`);
} else if (action === "stop") {
  if (installed()) execFileSync("launchctl", ["bootout", target], { stdio: "inherit" });
  console.log("AVA analysis worker stopped.");
} else if (action === "status") {
  if (!installed()) {
    console.log("AVA analysis worker is stopped.");
    process.exitCode = 1;
  } else {
    execFileSync("launchctl", ["print", target], { stdio: "inherit" });
  }
} else {
  console.error("Usage: npm run ava:start | ava:stop | ava:status");
  process.exitCode = 2;
}
