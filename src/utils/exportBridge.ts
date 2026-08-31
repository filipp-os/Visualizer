// Client for the local export bridge (see vite-plugin-export-bridge.js).
//
// Every call is a same-origin fetch to /__bridge/*. When the app is served
// without the plugin (e.g. a static host), the requests 404 / fail and every
// helper degrades to "bridge not available" so the UI can hide itself.

export type IvyKind = "paths" | "auto";

export interface BridgeStatus {
  configured: boolean;
  configError?: string | null;
  configFile?: string;
  example?: string;
  projectRoot?: string;
  rootExists?: boolean;
  packages?: Record<IvyKind, string>;
  javaPackages?: Record<IvyKind, string>;
  dirsExist?: Record<IvyKind, boolean>;
  manifestCount?: number;
  allowGit?: boolean;
  git?: { branch: string; dirty: boolean } | null;
}

export interface BridgeEntry {
  type: IvyKind;
  className: string;
  relPath: string;
  source: string | null;
  exportedAt: string | null;
  hash?: string;
  managed?: boolean;
  existsOnDisk?: boolean;
  // true / false when git tracking is known, null when git is unavailable or
  // allowGit is off.
  tracked?: boolean | null;
}

export interface BridgeWriteResult {
  ok: boolean;
  status: number;
  action?: "created" | "updated";
  relPath?: string;
  absPath?: string;
  bytes?: number;
  error?: string;
}

const BASE = "/__bridge/";

async function call(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(BASE + path, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: "bad-response" };
  }
  return { ok: res.ok, status: res.status, data };
}

/** null → the bridge isn't reachable at all (not running / not built in). */
export async function bridgeStatus(): Promise<BridgeStatus | null> {
  try {
    const { ok, data } = await call("status");
    if (!ok || !data) return null;
    return data as BridgeStatus;
  } catch {
    return null;
  }
}

export async function bridgeList(type?: IvyKind): Promise<BridgeEntry[]> {
  try {
    const { ok, data } = await call("list" + (type ? `?type=${type}` : ""));
    return ok && Array.isArray(data?.entries) ? (data.entries as BridgeEntry[]) : [];
  } catch {
    return [];
  }
}

export async function bridgeRead(
  type: IvyKind,
  className: string,
): Promise<string | null> {
  try {
    const { ok, data } = await call(
      `read?type=${type}&className=${encodeURIComponent(className)}`,
    );
    return ok ? (data?.contents ?? null) : null;
  } catch {
    return null;
  }
}

export async function bridgeWrite(input: {
  type: IvyKind;
  className: string;
  contents: string;
  overwrite: boolean;
  source?: string | null;
}): Promise<BridgeWriteResult> {
  try {
    const { ok, status, data } = await call("write", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return {
      ok,
      status,
      action: data?.action,
      relPath: data?.relPath,
      absPath: data?.absPath,
      bytes: data?.bytes,
      error: data?.error,
    };
  } catch (e) {
    return { ok: false, status: 0, error: "network" };
  }
}

export interface BridgeDeleteResult {
  ok: boolean;
  status: number;
  fileDeleted?: boolean;
  manifestRemoved?: boolean;
  wasTracked?: boolean;
  relPath?: string;
  error?: string;
}

export async function bridgeDelete(input: {
  type: IvyKind;
  className: string;
}): Promise<BridgeDeleteResult> {
  try {
    const { ok, status, data } = await call("delete", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return {
      ok: ok && data?.ok !== false,
      status,
      fileDeleted: data?.fileDeleted,
      manifestRemoved: data?.manifestRemoved,
      wasTracked: data?.wasTracked,
      relPath: data?.relPath,
      error: data?.error,
    };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

export interface BridgeGitResult {
  ok: boolean;
  status: number;
  action?: "add" | "untrack";
  tracked?: boolean;
  forced?: boolean;
  note?: string;
  error?: string;
  detail?: string;
}

export async function bridgeGit(input: {
  type: IvyKind;
  className: string;
  action: "add" | "untrack";
}): Promise<BridgeGitResult> {
  try {
    const { ok, status, data } = await call("git", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return {
      ok: ok && data?.ok !== false,
      status,
      action: data?.action,
      tracked: data?.tracked,
      forced: data?.forced,
      note: data?.note,
      error: data?.error,
      detail: data?.detail,
    };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

/** Header comment prepended to every generated file (download + bridge). */
export function ivyBanner(source: string | null | undefined): string {
  const src = source ? `${source}.pp` : "(unsaved path)";
  return (
    `/*\n` +
    ` * Generated by the Pedro Pathing Visualizer.\n` +
    ` * Source: ${src}\n` +
    ` * Exported: ${new Date().toISOString()}\n` +
    ` *\n` +
    ` * Re-export from the visualizer to update this file. Manual edits here\n` +
    ` * will be overwritten on the next export.\n` +
    ` */\n`
  );
}
