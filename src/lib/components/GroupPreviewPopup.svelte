<script lang="ts">
  import { onMount } from "svelte";
  import { portal } from "../actions/portal";

  // A path group: { id, name, items: [{kind:"path", line}, {kind:"wait", name, durationMs}] }
  export let group: any;
  export let anchor: HTMLElement;
  export let onClose: () => void;

  const POPUP_WIDTH = 260;
  const POPUP_MAX_HEIGHT = 320;
  const GAP = 6;

  let top = 0;
  let left = 0;

  onMount(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    left = rect.left;
    top = rect.bottom + GAP;

    const maxLeft = window.innerWidth - POPUP_WIDTH - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);

    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < POPUP_MAX_HEIGHT && rect.top > spaceBelow) {
      top = Math.max(8, rect.top - POPUP_MAX_HEIGHT - GAP);
    }
  });

  $: items = (group?.items ?? []) as any[];
</script>

<div use:portal>
  <div
    class="fixed inset-0 z-40"
    role="presentation"
    on:click={onClose}
    on:contextmenu|preventDefault={onClose}
  />
  <div
    class="fixed z-50 overflow-y-auto rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/90 shadow-lg p-2"
    style="top: {top}px; left: {left}px; width: {POPUP_WIDTH}px; max-height: {POPUP_MAX_HEIGHT}px;"
  >
    <p class="text-xs font-semibold text-emerald-800 dark:text-emerald-200 px-1 pb-1 truncate">
      {group?.name || "Group"} · {items.length} item{items.length === 1 ? "" : "s"}
    </p>
    {#if items.length === 0}
      <p class="text-xs text-neutral-500 dark:text-neutral-400 p-1">This group is empty.</p>
    {/if}
    <ol class="flex flex-col gap-1">
      {#each items as it, i (i)}
        <li
          class="flex items-center gap-2 rounded-md px-2 py-1 text-xs {it.kind === 'wait'
            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100'
            : 'bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100'}"
        >
          <span class="opacity-50 tabular-nums w-4 shrink-0 text-right">{i + 1}</span>
          {#if it.kind === "wait"}
            <span class="truncate">{it.name || "Wait"}</span>
            <span class="ml-auto opacity-60 shrink-0">{it.durationMs ?? 0} ms</span>
          {:else}
            <span class="truncate">{it.line?.name || "Path"}</span>
            <span class="ml-auto opacity-60 shrink-0 capitalize">
              {it.line?.endPoint?.heading ?? ""}
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
</div>
