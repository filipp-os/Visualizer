// Auto-update check. Runs automatically before `npm start` (package.json
// "prestart"), and on demand via `npm run update`.
//
// It fast-forwards this checkout to the latest pushed commit on the default
// branch and reinstalls dependencies only if they changed. It NEVER blocks the
// app: anything unusual (offline, local edits, diverged history) just prints a
// note and lets the launch continue with whatever you have.
//
// Opt out with:  VIS_NO_UPDATE=1   (env var), or the --no-update flag.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function git(args, timeout = 15000) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function tryGit(args, timeout) {
  try {
    return { ok: true, out: git(args, timeout) };
  } catch {
    return { ok: false, out: "" };
  }
}

function stop(msg) {
  if (msg) console.log(msg);
  process.exit(0);
}

function main() {
  if (process.env.VIS_NO_UPDATE === "1" || process.argv.includes("--no-update")) {
    stop("• Update check skipped (VIS_NO_UPDATE).");
  }

  if (!tryGit(["rev-parse", "--is-inside-work-tree"]).ok) stop(); // not a git checkout
  if (!tryGit(["remote", "get-url", "origin"]).ok) {
    stop("• No 'origin' remote — skipping update check.");
  }

  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  let def = tryGit(["rev-parse", "--abbrev-ref", "origin/HEAD"]).out.replace(
    /^origin\//,
    "",
  );
  if (!def) def = "main";
  if (branch === "HEAD") stop("• Detached HEAD — skipping update check.");
  if (branch !== def) {
    stop(`• On branch '${branch}', not '${def}' — skipping update check.`);
  }

  process.stdout.write("• Checking for updates... ");
  if (!tryGit(["fetch", "--quiet", "origin", def], 20000).ok) {
    stop("couldn't reach GitHub (offline?). Continuing.");
  }

  const behind = Number(
    tryGit(["rev-list", "--count", `HEAD..origin/${def}`]).out || "0",
  );
  if (!behind) stop("up to date.");
  console.log(`${behind} new commit${behind === 1 ? "" : "s"}.`);

  if (tryGit(["status", "--porcelain"]).out) {
    stop(
      "• NOT updated — you have local changes to the visualizer.\n" +
        "  To take the update, from this folder run one of:\n" +
        "      git stash                       (keep your changes for later)\n" +
        `      git reset --hard origin/${def}   (throw your changes away)\n` +
        "  then start again.",
    );
  }

  const before = tryGit(["rev-parse", "HEAD"]).out;
  if (!tryGit(["merge", "--ff-only", `origin/${def}`], 20000).ok) {
    stop(
      "• Couldn't fast-forward (history diverged). From this folder run:\n" +
        `      git reset --hard origin/${def}`,
    );
  }
  const after = tryGit(["rev-parse", "HEAD"]).out;

  const log = tryGit([
    "log",
    "--oneline",
    "--no-decorate",
    `${before}..${after}`,
  ]).out;
  if (log) console.log(log.replace(/^/gm, "    "));

  const changed = tryGit(["diff", "--name-only", before, after]).out.split("\n");
  if (changed.includes("package-lock.json") || changed.includes("package.json")) {
    console.log("• Dependencies changed — running npm install...");
    try {
      execFileSync(isWin ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], {
        cwd: repoRoot,
        stdio: "inherit",
        timeout: 300000,
        shell: isWin,
      });
    } catch {
      stop(`• npm install failed — run it yourself in ${repoRoot}`);
    }
  }

  stop(`• Updated to ${after.slice(0, 7)}. Enjoy.`);
}

try {
  main();
} catch (err) {
  console.log("• Update check hit an error; continuing without it.");
  process.exit(0);
}
