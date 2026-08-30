<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { portal } from "../actions/portal";
  import { headingPreview } from "../../stores";

  export let value: number = 0;
  export let anchor: HTMLElement;
  // Field point (inches) this heading applies at, so the robot can preview it.
  export let previewPoint: { x: number; y: number } | null = null;
  export let onInput: (deg: number) => void = () => {};
  export let onCommit: () => void = () => {};
  export let onClose: () => void = () => {};

  const SIZE = 168;
  const R = SIZE / 2 - 16;
  const GAP = 8;

  let top = 0;
  let left = 0;
  let dialEl: HTMLDivElement;
  let dragging = false;

  // Normalize to (-180, 180] to match the heading number inputs.
  function norm(deg: number): number {
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  $: rad = (value * Math.PI) / 180;
  // Screen position of the pointer tip (y is down, so negate the sin term).
  $: tipX = SIZE / 2 + R * Math.cos(rad);
  $: tipY = SIZE / 2 - R * Math.sin(rad);

  function pushPreview() {
    if (previewPoint) {
      headingPreview.set({
        x: previewPoint.x,
        y: previewPoint.y,
        heading: value,
      });
    }
  }

  function angleFromEvent(e: MouseEvent) {
    const rect = dialEl.getBoundingClientRect();
    const px = e.clientX - rect.left - SIZE / 2;
    const py = e.clientY - rect.top - SIZE / 2;
    let deg = Math.atan2(-py, px) * (180 / Math.PI);
    if (e.shiftKey) deg = Math.round(deg / 15) * 15; // Shift = 15° snap
    else deg = Math.round(deg);
    return norm(deg);
  }

  function onDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    value = angleFromEvent(e);
    onInput(value);
    pushPreview();
  }
  function onMove(e: MouseEvent) {
    if (!dragging) return;
    value = angleFromEvent(e);
    onInput(value);
    pushPreview();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    onCommit();
  }

  function nudge(delta: number) {
    value = norm(value + delta);
    onInput(value);
    onCommit();
    pushPreview();
  }

  function handleTyped(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) {
      value = norm(v);
      onInput(value);
      pushPreview();
    }
  }

  function close() {
    headingPreview.set(null);
    onClose();
  }

  onMount(() => {
    const rect = anchor.getBoundingClientRect();
    left = rect.right + GAP;
    top = rect.top - SIZE / 2 + rect.height / 2;
    if (left + SIZE + 8 > window.innerWidth) left = rect.left - SIZE - GAP;
    if (left < 8) left = 8;
    top = Math.max(8, Math.min(top, window.innerHeight - SIZE - 60));

    pushPreview();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  });

  // Belt-and-braces: never leave a stale preview robot on the field.
  onDestroy(() => headingPreview.set(null));
</script>

<div use:portal>
  <!-- Invisible backdrop: click outside to close -->
  <div
    class="fixed inset-0 z-[70]"
    role="presentation"
    on:click={close}
    on:contextmenu|preventDefault={close}
  />

  <div
    class="fixed z-[71] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xl p-3 select-none"
    style="top: {top}px; left: {left}px;"
  >
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-xs font-semibold text-neutral-500 dark:text-neutral-300">Set heading</span>
      <button
        type="button"
        on:click={close}
        class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
        title="Close (Esc)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-4 stroke-current">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div
      bind:this={dialEl}
      class="relative cursor-crosshair"
      role="slider"
      tabindex="0"
      aria-valuenow={value}
      aria-valuemin={-180}
      aria-valuemax={180}
      aria-label="Heading dial"
      on:mousedown={onDown}
      style="width: {SIZE}px; height: {SIZE}px;"
    >
      <svg width={SIZE} height={SIZE} class="absolute inset-0 pointer-events-none">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          class="fill-sky-50 dark:fill-sky-950/40 stroke-neutral-300 dark:stroke-neutral-600"
          stroke-width="1.5"
        />
        <!-- cardinal ticks -->
        {#each [0, 45, 90, 135, 180, 225, 270, 315] as a}
          <line
            x1={SIZE / 2 + (R - (a % 90 === 0 ? 10 : 5)) * Math.cos((a * Math.PI) / 180)}
            y1={SIZE / 2 - (R - (a % 90 === 0 ? 10 : 5)) * Math.sin((a * Math.PI) / 180)}
            x2={SIZE / 2 + R * Math.cos((a * Math.PI) / 180)}
            y2={SIZE / 2 - R * Math.sin((a * Math.PI) / 180)}
            class="stroke-neutral-400 dark:stroke-neutral-500"
            stroke-width={a % 90 === 0 ? 2 : 1}
          />
        {/each}
        <text x={SIZE / 2 + R - 2} y={SIZE / 2 + 3} text-anchor="end" class="fill-neutral-400 text-[9px]">0°</text>
        <text x={SIZE / 2 + 2} y={SIZE / 2 - R + 9} class="fill-neutral-400 text-[9px]">90°</text>
        <!-- pointer -->
        <line
          x1={SIZE / 2}
          y1={SIZE / 2}
          x2={tipX}
          y2={tipY}
          class="stroke-sky-500"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <circle cx={tipX} cy={tipY} r="6" class="fill-sky-500" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r="3" class="fill-neutral-500" />
      </svg>
    </div>

    <div class="flex items-center gap-1.5 mt-2">
      <button type="button" on:click={() => nudge(-90)} class="px-1.5 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700" title="-90°">−90</button>
      <button type="button" on:click={() => nudge(-15)} class="px-1.5 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700">−15</button>
      <input
        type="number"
        min="-180"
        max="180"
        value={Math.round(value)}
        on:input={handleTyped}
        on:blur={onCommit}
        class="w-14 text-center text-xs pl-1 rounded bg-neutral-100 dark:bg-neutral-950 border-[0.5px] dark:border-neutral-700 focus:outline-none"
      />
      <button type="button" on:click={() => nudge(15)} class="px-1.5 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700">+15</button>
      <button type="button" on:click={() => nudge(90)} class="px-1.5 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700" title="+90°">+90</button>
    </div>
    {#if previewPoint}
      <p class="text-[10px] text-neutral-400 mt-1.5">Drag the dial — the robot previews it on the field.</p>
    {/if}
  </div>
</div>
