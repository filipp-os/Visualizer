<script lang="ts">
  import { onMount } from "svelte";
  import { portal } from "../actions/portal";
  import GroupItemList from "./GroupItemList.svelte";

  // A path group: { id, name, items: [ {kind:"path",line} | {kind:"wait",...} | {kind:"group",name,items} ] }
  export let group: any;
  export let anchor: HTMLElement;
  export let onClose: () => void;

  const POPUP_WIDTH = 260;
  const POPUP_MAX_HEIGHT = 320;
  const GAP = 6;
  const MARGIN = 8;

  let top = 0;
  let left = 0;
  let placed = false;
  let popupEl: HTMLElement;

  function computePlacement(): boolean {
    const rect = anchor?.getBoundingClientRect?.();
    if (!rect || (rect.width === 0 && rect.height === 0)) return false;
    const vw =
      window.innerWidth || document.documentElement.clientWidth || 1280;
    const vh =
      window.innerHeight || document.documentElement.clientHeight || 800;
    const popH = Math.min(
      popupEl?.offsetHeight || POPUP_MAX_HEIGHT,
      POPUP_MAX_HEIGHT,
    );

    let nextLeft = Math.min(rect.left, vw - POPUP_WIDTH - MARGIN);
    if (nextLeft < MARGIN) nextLeft = MARGIN;

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

  $: if (anchor) computePlacement();

  onMount(() => {
    if (!computePlacement()) {
      let tries = 0;
      const iv = setInterval(() => {
        if (computePlacement() || ++tries > 20) clearInterval(iv);
      }, 16);
    }
    setTimeout(computePlacement, 0);
    const dismiss = () => onClose();
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  });

  // Total leaf items (paths + waits) at any nesting depth.
  function countLeaves(items: any[]): number {
    return (items || []).reduce(
      (n, it) => n + (it.kind === "group" ? countLeaves(it.items) : 1),
      0,
    );
  }
  $: total = countLeaves(group?.items ?? []);
</script>

<div use:portal>
  <div
    class="fixed inset-0 z-40"
    role="presentation"
    on:click={onClose}
    on:contextmenu|preventDefault={onClose}
  />
  <div
    bind:this={popupEl}
    class="fixed z-50 overflow-y-auto rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/90 shadow-lg p-2"
    style="top: {top}px; left: {left}px; width: {POPUP_WIDTH}px; max-height: {POPUP_MAX_HEIGHT}px; visibility: {placed
      ? 'visible'
      : 'hidden'};"
  >
    <p class="text-xs font-semibold text-emerald-800 dark:text-emerald-200 px-1 pb-1 truncate">
      {group?.name || "Group"} · {total} item{total === 1 ? "" : "s"}
    </p>
    {#if total === 0}
      <p class="text-xs text-neutral-500 dark:text-neutral-400 p-1">This group is empty.</p>
    {/if}
    <ol class="flex flex-col gap-1">
      <GroupItemList items={group?.items ?? []} />
    </ol>
  </div>
</div>
