// Local export bridge for the Pedro Pathing Visualizer.
//
// Adds a tiny HTTP API (mounted under /__bridge/) to the Vite dev server AND
// the `vite preview` server so the running web app can write generated IVY
// classes straight into a local Android Studio project — no download step,
// works in any browser, because the write happens in this Node process.
//
// It only does anything when a `visualizer.export.json` file exists next to
// this config (see visualizer.export.example.json). Without it every write is
// refused and the UI just shows a hint.
//
// Safety: loopback connections only, paths are confined to the configured
// projectRoot, and only *.java (plus the manifest) may be written.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";

const CONFIG_FILE = "visualizer.export.json";
const MANIFEST_NAME = ".visualizer-manifest.json";
const CLASS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PREFIX = "/__bridge/";
const BODY_LIMIT = 5 * 1024 * 1024;

const DEFAULT_PACKAGES = {
  paths: "org/firstinspires/ftc/teamcode/vis/paths",
  auto: "org/firstinspires/ftc/teamcode/vis/auto",
};

function sendJson(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error("payload-too-large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isLoopback(req) {
  const addr = (req.socket && req.socket.remoteAddress) || "";
  return (
    addr === "" ||
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

function loadConfig(rootDir) {
  const file = path.join(rootDir, CONFIG_FILE);
  try {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    return { cfg, error: null };
  } catch (e) {
    if (e && e.code === "ENOENT") return { cfg: null, error: null };
    return { cfg: null, error: String((e && e.message) || e) };
  }
}

function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const projectRoot = cfg.projectRoot
    ? path.resolve(String(cfg.projectRoot))
    : null;
  const packages = {
    paths: String((cfg.packages && cfg.packages.paths) || DEFAULT_PACKAGES.paths)
      .replace(/^[\\/]+|[\\/]+$/g, ""),
    auto: String((cfg.packages && cfg.packages.auto) || DEFAULT_PACKAGES.auto)
      .replace(/^[\\/]+|[\\/]+$/g, ""),
  };
  return { projectRoot, packages, allowGit: cfg.allowGit === true };
}

// Resolve `parts` under `root`, returning null if the result escapes `root`.
function safeJoin(root, ...parts) {
  const abs = path.resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

const dirToPackage = (relDir) =>
  relDir.split(/[\\/]+/).filter(Boolean).join(".");

function gitInfo(cwd) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
      { timeout: 2500 },
      (err, out) => {
        if (err) return resolve(null);
        const branch = String(out).trim();
        execFile(
          "git",
          ["-C", cwd, "status", "--porcelain"],
          { timeout: 2500 },
          (err2, out2) => {
            resolve({
              branch,
              dirty: !err2 && String(out2).trim().length > 0,
            });
          },
        );
      },
    );
  });
}

async function readManifest(projectRoot) {
  try {
    const raw = await fsp.readFile(
      path.join(projectRoot, MANIFEST_NAME),
      "utf8",
    );
    const m = JSON.parse(raw);
    if (m && Array.isArray(m.entries)) return m;
  } catch {
    /* missing / unreadable → fresh manifest */
  }
  return { version: 1, entries: [] };
}

async function writeManifest(projectRoot, manifest) {
  await fsp.writeFile(
    path.join(projectRoot, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

async function scanJavaClasses(absDir) {
  try {
    const names = await fsp.readdir(absDir);
    return names
      .filter((n) => n.endsWith(".java"))
      .map((n) => n.slice(0, -5));
  } catch {
    return [];
  }
}

function makeHandler(getRootDir) {
  return async function handler(req, res, next) {
    if (!req.url || !req.url.startsWith(PREFIX)) return next();
    if (!isLoopback(req)) return sendJson(res, 403, { error: "loopback-only" });

    const rootDir = getRootDir();
    const url = new URL(req.url, "http://localhost");
    const action = url.pathname.slice(PREFIX.length);
    const { cfg, error: configError } = loadConfig(rootDir);
    const norm = normalizeConfig(cfg);

    // ---- status --------------------------------------------------------
    if (action === "status" && req.method === "GET") {
      if (!norm) {
        return sendJson(res, 200, {
          configured: false,
          configError,
          configFile: CONFIG_FILE,
          example: "visualizer.export.example.json",
        });
      }
      const projectRoot = norm.projectRoot;
      const rootExists = !!projectRoot && fs.existsSync(projectRoot);
      const pathsDir = rootExists
        ? safeJoin(projectRoot, norm.packages.paths)
        : null;
      const autoDir = rootExists
        ? safeJoin(projectRoot, norm.packages.auto)
        : null;
      const manifest = rootExists
        ? await readManifest(projectRoot)
        : { entries: [] };
      const git =
        rootExists && norm.allowGit ? await gitInfo(projectRoot) : null;
      return sendJson(res, 200, {
        configured: true,
        projectRoot,
        rootExists,
        packages: norm.packages,
        javaPackages: {
          paths: dirToPackage(norm.packages.paths),
          auto: dirToPackage(norm.packages.auto),
        },
        dirsExist: {
          paths: !!pathsDir && fs.existsSync(pathsDir),
          auto: !!autoDir && fs.existsSync(autoDir),
        },
        manifestCount: manifest.entries.length,
        allowGit: norm.allowGit,
        git,
      });
    }

    // Everything past this point needs a usable projectRoot.
    if (!norm || !norm.projectRoot || !fs.existsSync(norm.projectRoot)) {
      return sendJson(res, 409, {
        error: "not-configured",
        detail:
          "Create visualizer.export.json with a projectRoot that points at your TeamCode Java source root.",
      });
    }
    const projectRoot = norm.projectRoot;

    // ---- list ---------------------------------------------------------
    if (action === "list" && req.method === "GET") {
      const wanted = url.searchParams.get("type");
      const manifest = await readManifest(projectRoot);
      const out = [];
      for (const type of ["paths", "auto"]) {
        if (wanted && wanted !== type) continue;
        const relDir = norm.packages[type];
        const absDir = safeJoin(projectRoot, relDir);
        const onDisk = new Set(absDir ? await scanJavaClasses(absDir) : []);
        const seen = new Set();
        for (const e of manifest.entries.filter((x) => x.type === type)) {
          seen.add(e.className);
          out.push({ ...e, managed: true, existsOnDisk: onDisk.has(e.className) });
        }
        for (const className of onDisk) {
          if (seen.has(className)) continue;
          out.push({
            type,
            className,
            relPath: `${relDir}/${className}.java`,
            source: null,
            exportedAt: null,
            managed: false,
            existsOnDisk: true,
          });
        }
      }
      return sendJson(res, 200, { entries: out });
    }

    // ---- read (for pre-overwrite diff/preview) -----------------------
    if (action === "read" && req.method === "GET") {
      const type = url.searchParams.get("type");
      const className = url.searchParams.get("className") || "";
      if (!["paths", "auto"].includes(type) || !CLASS_RE.test(className)) {
        return sendJson(res, 400, { error: "bad-params" });
      }
      const abs = safeJoin(
        projectRoot,
        norm.packages[type],
        className + ".java",
      );
      if (!abs) return sendJson(res, 400, { error: "path-escape" });
      try {
        return sendJson(res, 200, {
          contents: await fsp.readFile(abs, "utf8"),
        });
      } catch {
        return sendJson(res, 404, { error: "not-found" });
      }
    }

    // ---- write ------------------------------------------------------
    if (action === "write" && req.method === "POST") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return sendJson(res, 400, { error: "bad-json" });
      }
      const { type, className, contents, overwrite, source } = body || {};
      if (!["paths", "auto"].includes(type)) {
        return sendJson(res, 400, { error: "bad-type" });
      }
      if (!CLASS_RE.test(String(className || ""))) {
        return sendJson(res, 400, { error: "bad-classname" });
      }
      if (typeof contents !== "string" || !contents.trim()) {
        return sendJson(res, 400, { error: "empty-contents" });
      }

      const relDir = norm.packages[type];
      const absDir = safeJoin(projectRoot, relDir);
      const absFile = absDir ? safeJoin(absDir, className + ".java") : null;
      if (!absDir || !absFile) {
        return sendJson(res, 400, { error: "path-escape" });
      }

      const existed = fs.existsSync(absFile);
      if (existed && !overwrite) {
        return sendJson(res, 409, {
          error: "exists",
          relPath: `${relDir}/${className}.java`,
        });
      }

      await fsp.mkdir(absDir, { recursive: true });
      await fsp.writeFile(absFile, contents, "utf8");

      const hash = crypto
        .createHash("sha256")
        .update(contents)
        .digest("hex")
        .slice(0, 12);
      const manifest = await readManifest(projectRoot);
      const entry = {
        type,
        className,
        relPath: `${relDir}/${className}.java`,
        source: source ? String(source) : null,
        hash,
        exportedAt: new Date().toISOString(),
      };
      const idx = manifest.entries.findIndex(
        (e) => e.type === type && e.className === className,
      );
      if (idx >= 0) manifest.entries[idx] = entry;
      else manifest.entries.push(entry);
      await writeManifest(projectRoot, manifest);

      return sendJson(res, 200, {
        action: existed ? "updated" : "created",
        relPath: entry.relPath,
        absPath: absFile,
        bytes: Buffer.byteLength(contents),
        hash,
      });
    }

    return sendJson(res, 404, { error: "unknown-action", action });
  };
}

export function exportBridge() {
  let rootDir = process.cwd();
  const handler = makeHandler(() => rootDir);
  const mount = (server) => {
    server.middlewares.use((req, res, next) => {
      handler(req, res, next).catch((err) => {
        try {
          sendJson(res, 500, { error: "bridge-failure", detail: String(err) });
        } catch {
          next(err);
        }
      });
    });
  };
  return {
    name: "vite-plugin-export-bridge",
    configResolved(resolved) {
      rootDir = resolved.root || process.cwd();
    },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default exportBridge;
