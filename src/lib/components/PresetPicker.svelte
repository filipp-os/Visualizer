<script lang="ts">
  import { onMount } from "svelte";
  import type { SavedPosition, SavedHeading } from "../../types";
  import { portal } from "../actions/portal";

  export let mode: "position" | "heading";
  export let positions: SavedPosition[] = [];
  export let headings: SavedHeading[] = [];
  export let onSelect: (item: any) => void;
  export let onClose: () => void;
  // The trigger button this popup was opened from — used to position the
  // portal-rendered popup right below it, since it's no longer a DOM
  // descendant of the trigger once moved to document.body.
  export let anchor: HTMLElement;

  // `as any[]` here (inside <script>, so TS casts are fine) lets the
  // template below read x/y/degrees off either shape without needing an
  // "as" cast in markup, which Svelte doesn't support there.
  $: items = (mode === "position" ? positions : headings) as any[];

  const POPUP_WIDTH = 260;
  const POPUP_MAX_HEIGHT = 288;
  const GAP = 4;

  let top = 0;
  let left = 0;

  onMount(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();

    // Default: below and left-aligned to the anchor.
    left = rect.left;
    top = rect.bottom + GAP;

    // Clamp horizontally so it never runs off the right edge of the screen.
    const maxLeft = window.innerWidth - POPUP_WIDTH - 8;
    if (left > maxLeft) left = Math.max(8, maxLeft);

    // If there's not enough room below, flip to open above the anchor instead.
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < POPUP_MAX_HEIGHT && rect.top > spaceBelow) {
      top = Math.max(8, rect.top - POPUP_MAX_HEIGHT - GAP);
    }
  });
</script>

<!-- Rendered on document.body via the portal action, so ancestor
     overflow:hidden/auto (the bubble card, the scrollable panel) can never
     clip it — position is computed above from the anchor button. -->
<div use:portal>
  <!-- Invisible backdrop: click anywhere outside the popup to close it -->
  <div
    class="fixed inset-0 z-40"
    role="presentation"
    on:click={onClose}
    on:contextmenu|preventDefault={onClose}
  />

  <div
    class="fixed z-50 overflow-y-auto rounded-lg border shadow-lg p-2 grid grid-cols-2 gap-1.5 {mode ===
    'position'
      ? 'bg-sky-50 dark:bg-sky-950/90 border-sky-200 dark:border-sky-800'
      : 'bg-purple-50 dark:bg-purple-950/90 border-purple-200 dark:border-purple-800'}"
    style="top: {top}px; left: {left}px; width: {POPUP_WIDTH}px; max-height: {POPUP_MAX_HEIGHT}px;"
  >
    {#if items.length === 0}
      <p class="col-span-2 text-xs text-neutral-500 dark:text-neutral-400 p-1">
        No saved {mode === "position" ? "positions" : "headings"} yet. Add
        some in the panel above the path list.
      </p>
    {/if}
    {#each items as item (item.id)}
      <button
        type="button"
        class="text-left px-2 py-1 rounded-md text-xs font-medium truncate transition-colors {mode ===
        'position'
          ? 'bg-sky-100 dark:bg-sky-900/60 hover:bg-sky-200 dark:hover:bg-sky-800 text-sky-900 dark:text-sky-100'
          : 'bg-purple-100 dark:bg-purple-900/60 hover:bg-purple-200 dark:hover:bg-purple-800 text-purple-900 dark:text-purple-100'}"
        on:click={() => onSelect(item)}
        title={mode === "position"
          ? `${item.name}: ${item.x}, ${item.y}${item.heading !== undefined ? `, ${item.heading}°` : ""}`
          : `${item.name}: ${item.degrees}°`}
      >
        <div class="truncate">{item.name}</div>
        <div class="opacity-70 truncate">
          {mode === "position"
            ? `${item.x}, ${item.y}${item.heading !== undefined ? ` @ ${item.heading}°` : ""}`
            : `${item.degrees}°`}
        </div>
      </button>
    {/each}
  </div>
</div>
