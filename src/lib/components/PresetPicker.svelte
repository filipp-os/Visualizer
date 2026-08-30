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
  // portal-rendered popup right next to it, since it's no longer a DOM
  // descendant of the trigger once moved to document.body.
  export let anchor: HTMLElement;

  // `as any[]` here (inside <script>, so TS casts are fine) lets the
  // template below read x/y/degrees off either shape without needing an
  // "as" cast in markup, which Svelte doesn't support there.
  $: items = (mode === "position" ? positions : headings) as any[];

  const POPUP_WIDTH = 260;
  const POPUP_MAX_HEIGHT = 288;
  const GAP = 4;
  const MARGIN = 8;

  let top = 0;
  let left = 0;
  let placed = false;
  let popupEl: HTMLElement;

  // Position the popup right next to the anchor button, clamped to the
  // viewport. Returns true once it has a real anchor rect to work from.
  function computePlacement(): boolean {
    const rect = anchor?.getBoundingClientRect?.();
    if (!rect || (rect.width === 0 && rect.height === 0)) return false;

    // Robust viewport size — window.innerWidth/Height can be 0 in some
    // embedded contexts.
    const vw =
      window.innerWidth || document.documentElement.clientWidth || 1280;
    const vh =
      window.innerHeight || document.documentElement.clientHeight || 800;
    const popH = Math.min(
      popupEl?.offsetHeight || POPUP_MAX_HEIGHT,
      POPUP_MAX_HEIGHT,
    );

    // Horizontal: left-align to the anchor, clamp on screen.
    let nextLeft = Math.min(rect.left, vw - POPUP_WIDTH - MARGIN);
    if (nextLeft < MARGIN) nextLeft = MARGIN;

    // Vertical: prefer just below; only flip above if it truly won't fit
    // below AND there is more room above. Otherwise just clamp.
    const roomBelow = vh - rect.bottom - MARGIN;
    const roomAbove = rect.top - MARGIN;
    let nextTop = rect.bottom + GAP;
    if (roomBelow < popH && roomAbove > roomBelow) {
      nextTop = Math.max(MARGIN, rect.top - GAP - popH);
    } else if (nextTop + popH > vh - MARGIN) {
      nextTop = Math.max(MARGIN, vh - MARGIN - popH);
    }

    left = nextLeft;
    top = nextTop;
    placed = true;
    return true;
  }

  // Re-place whenever the anchor resolves, and once more after the popup has
  // rendered (so its real height is known for the flip/clamp maths).
  $: if (anchor) computePlacement();

  onMount(() => {
    if (!computePlacement()) {
      let tries = 0;
      const iv = setInterval(() => {
        if (computePlacement() || ++tries > 20) clearInterval(iv);
      }, 16);
    }
    setTimeout(computePlacement, 0);

    // A scroll or resize would leave the popup floating in the wrong place —
    // close it instead (matches the timeline context menu).
    const dismiss = () => onClose();
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
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
    bind:this={popupEl}
    class="fixed z-50 overflow-y-auto rounded-lg border shadow-lg p-2 grid grid-cols-2 gap-1.5 {mode ===
    'position'
      ? 'bg-sky-50 dark:bg-sky-950/90 border-sky-200 dark:border-sky-800'
      : 'bg-purple-50 dark:bg-purple-950/90 border-purple-200 dark:border-purple-800'}"
    style="top: {top}px; left: {left}px; width: {POPUP_WIDTH}px; max-height: {POPUP_MAX_HEIGHT}px; visibility: {placed
      ? 'visible'
      : 'hidden'};"
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
