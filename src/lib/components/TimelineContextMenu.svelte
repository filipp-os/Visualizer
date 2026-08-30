<script lang="ts">
  import { onMount } from "svelte";
  import { portal } from "../actions/portal";

  // { x, y } viewport coords, and a list of entries.
  export let x: number;
  export let y: number;
  // entries: Array<{ label, onClick, danger?, disabled?, divider? }>
  export let entries: any[] = [];
  export let onClose: () => void;

  const MENU_WIDTH = 180;
  let top = y;
  let left = x;

  onMount(() => {
    const h = Math.min(entries.length * 32 + 8, 400);
    left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
    top = Math.min(y, window.innerHeight - h - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
  });
</script>

<div use:portal>
  <div
    class="fixed inset-0 z-[60]"
    role="presentation"
    on:click={onClose}
    on:contextmenu|preventDefault={onClose}
    on:wheel={onClose}
  />
  <div
    class="fixed z-[61] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xl py-1 text-sm"
    style="top: {top}px; left: {left}px; width: {MENU_WIDTH}px;"
    role="menu"
  >
    {#each entries as e, i (i)}
      {#if e.divider}
        <div class="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
      {:else}
        <button
          type="button"
          role="menuitem"
          disabled={e.disabled}
          on:click={() => {
            if (e.disabled) return;
            onClose();
            e.onClick();
          }}
          class="w-full text-left px-3 py-1.5 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 dark:hover:bg-neutral-700 {e.danger
            ? 'text-red-600 dark:text-red-400'
            : 'text-neutral-800 dark:text-neutral-100'}"
        >
          {e.label}
          {#if e.hint}
            <span class="ml-auto text-[10px] opacity-50">{e.hint}</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
</div>
