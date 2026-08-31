<script lang="ts">
  import { onMount } from "svelte";
  import {
    bridgeStatus,
    bridgeList,
    bridgeWrite,
    bridgeDelete,
    bridgeGit,
    type BridgeStatus,
    type BridgeEntry,
    type IvyKind,
  } from "../../utils/exportBridge";

  // "ivy-paths" | "ivy-opmode"
  export let kind: "ivy-paths" | "ivy-opmode";
  // The user-editable base class name from the dialog (e.g. "CloseAuto").
  export let baseName: string;
  // Source .pp base name, for the manifest / banner.
  export let source: string;
  // Supplied by the dialog: regenerate IVY code for a specific package +
  // base name, returning the real on-disk class name and the file contents.
  export let build: (
    baseName: string,
    packageName: string,
  ) => Promise<{ className: string; code: string }>;

  // The dialog reuses one panel instance and just swaps `kind` when you flip
  // between "IVY — Paths class" and "IVY — Full OpMode", so these must be
  // reactive, not computed once.
  $: type = (kind === "ivy-paths" ? "paths" : "auto") as IvyKind;
  $: kindLabel = kind === "ivy-paths" ? "Paths class" : "OpMode";

  let status: BridgeStatus | null = null;
  let entries: BridgeEntry[] = [];
  let checking = true;
  let busy = false;
  let result: { ok: boolean; text: string } | null = null;
  let existsPrompt = false; // "write new" hit an existing file
  let selectedExisting = "";
  let confirmOverwrite = false;
  let confirmDelete = false;

  $: pkgName = status?.javaPackages?.[type] ?? "";
  $: managedExisting = entries.filter((e) => e.type === type && e.managed);
  $: selectedEntry =
    managedExisting.find((e) => e.className === selectedExisting) ?? null;
  // git button only makes sense when tracking state is actually known
  $: gitKnown = typeof selectedEntry?.tracked === "boolean";

  function resetSelectionUi() {
    confirmOverwrite = false;
    confirmDelete = false;
  }

  // Clear per-target UI state when the format switches.
  let lastType: IvyKind | "" = "";
  $: if (type !== lastType) {
    lastType = type;
    result = null;
    existsPrompt = false;
    selectedExisting = "";
    resetSelectionUi();
  }

  async function recheck() {
    checking = true;
    result = null;
    existsPrompt = false;
    status = await bridgeStatus();
    entries =
      status && status.configured && status.rootExists
        ? await bridgeList() // both types; filtered per `type` reactively
        : [];
    checking = false;
  }
  onMount(recheck);

  async function doWrite(className: string, code: string, overwrite: boolean) {
    return bridgeWrite({ type, className, contents: code, overwrite, source });
  }

  async function writeNew(force = false) {
    if (!pkgName || busy) return;
    busy = true;
    result = null;
    try {
      const { className, code } = await build(baseName, pkgName);
      const r = await doWrite(className, code, force);
      if (r.status === 409 && r.error === "exists") {
        existsPrompt = true;
        result = {
          ok: false,
          text: `${className}.java already exists in ${pkgName}.`,
        };
      } else if (r.ok) {
        existsPrompt = false;
        result = {
          ok: true,
          text: `${r.action === "updated" ? "Updated" : "Created"} ${r.relPath}`,
        };
        entries = await bridgeList();
      } else {
        result = { ok: false, text: `Write failed (${r.error || r.status}).` };
      }
    } finally {
      busy = false;
    }
  }

  async function overwriteExisting() {
    if (!selectedExisting || !pkgName || busy) return;
    if (!confirmOverwrite) {
      confirmOverwrite = true;
      return;
    }
    confirmOverwrite = false;
    busy = true;
    result = null;
    try {
      // Managed entries always follow the generator's naming rule, so peeling
      // the "Paths" suffix back off gives a base name that regenerates to the
      // exact same class name.
      const derivedBase =
        type === "paths"
          ? selectedExisting.replace(/Paths$/, "")
          : selectedExisting;
      const { className, code } = await build(derivedBase, pkgName);
      if (className !== selectedExisting) {
        result = {
          ok: false,
          text: `Name mismatch (${className} vs ${selectedExisting}); use "Write new" instead.`,
        };
        return;
      }
      const r = await doWrite(className, code, true);
      result = r.ok
        ? { ok: true, text: `Updated ${r.relPath}` }
        : { ok: false, text: `Write failed (${r.error || r.status}).` };
      if (r.ok) entries = await bridgeList();
    } finally {
      busy = false;
    }
  }

  async function deleteSelected() {
    if (!selectedExisting || busy) return;
    if (!confirmDelete) {
      confirmDelete = true;
      return;
    }
    confirmDelete = false;
    busy = true;
    result = null;
    try {
      const r = await bridgeDelete({ type, className: selectedExisting });
      if (r.ok) {
        const parts: string[] = [];
        if (r.fileDeleted) parts.push("file");
        if (r.manifestRemoved) parts.push("manifest entry");
        let text = parts.length
          ? `Deleted ${selectedExisting} (${parts.join(" + ")})`
          : `${selectedExisting} was already gone — nothing to delete`;
        if (r.wasTracked) text += " · git shows a deletion to stage";
        result = { ok: true, text };
        selectedExisting = "";
        entries = await bridgeList();
      } else {
        result = { ok: false, text: `Delete failed (${r.error || r.status}).` };
      }
    } finally {
      busy = false;
    }
  }

  async function toggleGit() {
    if (!selectedEntry || busy) return;
    const act: "add" | "untrack" = selectedEntry.tracked ? "untrack" : "add";
    busy = true;
    result = null;
    try {
      const r = await bridgeGit({ type, className: selectedExisting, action: act });
      if (r.ok) {
        result = {
          ok: true,
          text:
            act === "add"
              ? `Added ${selectedExisting}.java to git${r.forced ? " (forced past .gitignore)" : ""}`
              : `Untracked ${selectedExisting}.java — working file kept`,
        };
        entries = await bridgeList();
      } else {
        result = {
          ok: false,
          text: `git ${act} failed (${r.error || r.status})${r.detail ? `: ${r.detail}` : ""}`,
        };
      }
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-sm"
>
  {#if checking}
    <span class="text-neutral-500 dark:text-neutral-400">Checking local project…</span>
  {:else if !status}
    <span class="text-neutral-500 dark:text-neutral-400">
      Local export unavailable — run the visualizer with <code>npm run dev</code>
      (or <code>npm run preview</code>) to write straight into your project.
    </span>
  {:else if !status.configured}
    <div class="flex flex-col gap-1">
      <span class="font-medium text-neutral-700 dark:text-neutral-200">
        Send to project — not set up yet
      </span>
      <span class="text-neutral-500 dark:text-neutral-400">
        Copy <code>{status.example}</code> to <code>{status.configFile}</code> and
        point <code>projectRoot</code> at your TeamCode Java source root.
      </span>
      {#if status.configError}
        <span class="text-red-600 dark:text-red-400"
          >Config error: {status.configError}</span
        >
      {/if}
      <button
        class="self-start mt-1 text-xs underline text-blue-600 dark:text-blue-400"
        on:click={recheck}>Re-check</button
      >
    </div>
  {:else if !status.rootExists}
    <div class="flex flex-col gap-1">
      <span class="text-red-600 dark:text-red-400">
        projectRoot does not exist: <code>{status.projectRoot}</code>
      </span>
      <button
        class="self-start text-xs underline text-blue-600 dark:text-blue-400"
        on:click={recheck}>Re-check</button
      >
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      <div
        class="flex items-center justify-between gap-2 flex-wrap text-xs text-neutral-500 dark:text-neutral-400"
      >
        <span>
          {kindLabel} →
          <code class="text-neutral-700 dark:text-neutral-200">{pkgName}</code>
          {#if status.git}
            · <span title="current git branch">{status.git.branch}{status.git.dirty ? "*" : ""}</span>
          {/if}
        </span>
        <button class="underline hover:text-blue-500" on:click={recheck}>Re-check</button>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50"
          disabled={busy || !baseName.trim()}
          on:click={() => writeNew(false)}
        >
          Write new class
        </button>

        {#if existsPrompt}
          <button
            class="px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm disabled:opacity-50"
            disabled={busy}
            on:click={() => writeNew(true)}
          >
            Overwrite it
          </button>
        {/if}

        {#if managedExisting.length}
          <span class="text-neutral-400">|</span>
          <select
            bind:value={selectedExisting}
            on:change={resetSelectionUi}
            class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a class…</option>
            {#each managedExisting as e (e.className)}
              <option value={e.className}>
                {e.className}{e.tracked === false ? " (untracked)" : ""}{!e.existsOnDisk
                  ? " (missing)"
                  : ""}
              </option>
            {/each}
          </select>
          <button
            class="px-3 py-1 rounded-md text-sm text-white disabled:opacity-50 {confirmOverwrite
              ? 'bg-amber-600 hover:bg-amber-500'
              : 'bg-neutral-600 hover:bg-neutral-500'}"
            disabled={busy || !selectedExisting}
            on:click={overwriteExisting}
          >
            {confirmOverwrite ? `Confirm overwrite ${selectedExisting}` : "Update"}
          </button>

          {#if selectedExisting}
            <button
              class="px-3 py-1 rounded-md text-sm text-white disabled:opacity-50 {confirmDelete
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-neutral-600 hover:bg-neutral-500'}"
              disabled={busy}
              on:click={deleteSelected}
            >
              {confirmDelete ? `Confirm delete ${selectedExisting}` : "Delete"}
            </button>

            {#if status.allowGit && gitKnown}
              <button
                class="px-3 py-1 rounded-md text-sm bg-neutral-600 hover:bg-neutral-500 text-white disabled:opacity-50"
                disabled={busy}
                on:click={toggleGit}
                title={selectedEntry?.tracked
                  ? "git rm --cached — stop tracking, keep the file"
                  : "git add — start tracking this file"}
              >
                {selectedEntry?.tracked ? "Untrack (git)" : "Add to git"}
              </button>
            {/if}
          {/if}
        {/if}
      </div>

      {#if result}
        <span
          class={result.ok
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"}
        >
          {result.ok ? "✓ " : "✕ "}{result.text}
        </span>
      {/if}
    </div>
  {/if}
</div>
