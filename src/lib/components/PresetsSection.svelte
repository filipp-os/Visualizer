<script lang="ts">
  import type { SavedPosition, SavedHeading } from "../../types";
  import HeadingProtractor from "./HeadingProtractor.svelte";

  export let positions: SavedPosition[] = [];
  export let headings: SavedHeading[] = [];
  export let collapsed: boolean = false;

  // Which heading box has its protractor open, plus its anchor / preview point.
  let prot: {
    key: string;
    anchor: HTMLElement;
    previewPoint: { x: number; y: number } | null;
  } | null = null;
  function toggleProt(
    key: string,
    e: MouseEvent,
    previewPoint: { x: number; y: number } | null,
  ) {
    if (prot?.key === key) prot = null;
    else prot = { key, anchor: e.currentTarget as HTMLElement, previewPoint };
  }

  // Drag a position/heading grip onto the timeline; double-click to apply it
  // to the end of the sequence / the last path. Wired up by ControlTab.
  export let onPresetDragStart: (
    kind: "position" | "heading",
    id: string,
  ) => void = () => {};
  export let onPresetDragEnd: () => void = () => {};
  export let onActivatePosition: (id: string) => void = () => {};
  export let onActivateHeading: (id: string) => void = () => {};

  function startPresetDrag(
    kind: "position" | "heading",
    id: string,
    name: string,
    e: DragEvent,
  ) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(`application/x-pp-${kind}`, id);
      e.dataTransfer.setData("text/plain", name);
    }
    onPresetDragStart(kind, id);
  }

  const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function addPosition() {
    positions = [
      ...positions,
      { id: makeId(), name: `Position ${positions.length + 1}`, x: 72, y: 72 },
    ];
  }

  function addHeading() {
    headings = [
      ...headings,
      { id: makeId(), name: `Heading ${headings.length + 1}`, degrees: 0 },
    ];
  }

  function removePosition(id: string) {
    positions = positions.filter((p) => p.id !== id);
  }

  function removeHeading(id: string) {
    headings = headings.filter((h) => h.id !== id);
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<div
  class="w-full rounded-md border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800"
>
  <button
    type="button"
    on:click={toggleCollapsed}
    class="flex items-center gap-2 mb-2 w-full text-left"
    title="{collapsed ? 'Expand' : 'Collapse'} saved positions & headings"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width={2}
      stroke="currentColor"
      class="size-4 transition-transform {collapsed ? 'rotate-0' : 'rotate-90'}"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
    <p class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-300">
      Saved Positions &amp; Headings
    </p>
  </button>

  {#if !collapsed}
    <!-- Positions grid -->
    <div class="flex items-center gap-2 mb-1.5">
      <p class="text-xs font-semibold text-sky-700 dark:text-sky-300">Positions</p>
    </div>
    <div
      class="grid gap-2 mb-3"
      style="grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));"
    >
      {#each positions as pos (pos.id)}
        <div
          class="flex flex-col gap-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 px-2 pb-2 pt-1"
          role="button"
          tabindex="0"
          on:dblclick={(e) => {
            if (!(e.target instanceof HTMLElement) || !e.target.closest("input,button,textarea"))
              onActivatePosition(pos.id);
          }}
          on:keydown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
              e.preventDefault();
              onActivatePosition(pos.id);
            }
          }}
        >
          <!-- Drag / double-click strip: no inputs here, so there's always a
               safe spot to double-click. -->
          <div
            draggable="true"
            on:dragstart={(e) => startPresetDrag("position", pos.id, pos.name, e)}
            on:dragend={onPresetDragEnd}
            title="Drag onto the timeline or a path • double-click to add as a path"
            role="button"
            tabindex="0"
            aria-label="Drag {pos.name} into the timeline"
            class="flex items-center gap-1 h-4 cursor-grab active:cursor-grabbing select-none text-sky-500/70 hover:text-sky-600 dark:text-sky-400/70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 shrink-0">
              <circle cx="6" cy="5" r="1.4" /><circle cx="14" cy="5" r="1.4" />
              <circle cx="6" cy="10" r="1.4" /><circle cx="14" cy="10" r="1.4" />
              <circle cx="6" cy="15" r="1.4" /><circle cx="14" cy="15" r="1.4" />
            </svg>
            <span class="text-[9px] font-semibold uppercase tracking-wider">drag · 2×-click → path</span>
          </div>
          <div class="flex items-center gap-1">
            <input
              bind:value={pos.name}
              placeholder="Name"
              class="min-w-0 flex-1 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-xs font-semibold text-sky-900 dark:text-sky-100"
            />
            <button
              type="button"
              title="Remove position"
              on:click={() => removePosition(pos.id)}
              class="text-red-400 hover:text-red-500 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-4 stroke-current">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="text-sky-700/70 dark:text-sky-300/70">X</span>
            <input
              type="number"
              step="0.1"
              bind:value={pos.x}
              class="w-full min-w-0 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none"
            />
            <span class="text-sky-700/70 dark:text-sky-300/70">Y</span>
            <input
              type="number"
              step="0.1"
              bind:value={pos.y}
              class="w-full min-w-0 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none"
            />
          </div>
          <label class="flex items-center gap-1 text-xs text-sky-700/70 dark:text-sky-300/70">
            <input
              type="checkbox"
              checked={pos.heading !== undefined}
              on:change={(e) => {
                pos.heading = e.currentTarget.checked ? 0 : undefined;
                positions = [...positions];
              }}
            />
            Heading
            {#if pos.heading !== undefined}
              <input
                type="number"
                step="1"
                min="-180"
                max="180"
                bind:value={pos.heading}
                class="w-16 min-w-0 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-xs"
              />
              <span>°</span>
              <button
                type="button"
                title="Set with the protractor dial"
                on:click|preventDefault={(e) =>
                  toggleProt("pos:" + pos.id, e, { x: pos.x, y: pos.y })}
                class="p-0.5 rounded text-sky-400 hover:text-sky-600"
                class:text-sky-600={prot?.key === "pos:" + pos.id}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={1.8} stroke="currentColor" class="size-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 1 0 0-18M12 21a9 9 0 0 1 0-18m0 18V3m0 9 6.5-4" />
                </svg>
              </button>
              {#if prot?.key === "pos:" + pos.id}
                <HeadingProtractor
                  value={pos.heading ?? 0}
                  anchor={prot.anchor}
                  previewPoint={prot.previewPoint}
                  onInput={(d) => {
                    pos.heading = d;
                    positions = [...positions];
                  }}
                  onClose={() => (prot = null)}
                />
              {/if}
            {/if}
          </label>
        </div>
      {/each}

      <button
        type="button"
        on:click={addPosition}
        class="flex items-center justify-center gap-1 rounded-lg border border-dashed border-sky-300 dark:border-sky-700 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-xs font-semibold min-h-[3.5rem]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Position
      </button>
    </div>

    <!-- Divider between positions and headings -->
    <div class="h-px w-full bg-neutral-200 dark:bg-neutral-700 mb-3" />

    <!-- Headings grid -->
    <div class="flex items-center gap-2 mb-1.5">
      <p class="text-xs font-semibold text-purple-700 dark:text-purple-300">Headings</p>
    </div>
    <div
      class="grid gap-2"
      style="grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));"
    >
      {#each headings as h (h.id)}
        <div
          class="flex flex-col gap-1.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50 px-2 pb-2 pt-1"
          role="button"
          tabindex="0"
          on:dblclick={(e) => {
            if (!(e.target instanceof HTMLElement) || !e.target.closest("input,button,textarea"))
              onActivateHeading(h.id);
          }}
          on:keydown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
              e.preventDefault();
              onActivateHeading(h.id);
            }
          }}
        >
          <div
            draggable="true"
            on:dragstart={(e) => startPresetDrag("heading", h.id, h.name, e)}
            on:dragend={onPresetDragEnd}
            title="Drag onto a path to set its heading • double-click to apply to the last path"
            role="button"
            tabindex="0"
            aria-label="Drag {h.name} onto a path"
            class="flex items-center gap-1 h-4 cursor-grab active:cursor-grabbing select-none text-purple-500/70 hover:text-purple-600 dark:text-purple-400/70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 shrink-0">
              <circle cx="6" cy="5" r="1.4" /><circle cx="14" cy="5" r="1.4" />
              <circle cx="6" cy="10" r="1.4" /><circle cx="14" cy="10" r="1.4" />
              <circle cx="6" cy="15" r="1.4" /><circle cx="14" cy="15" r="1.4" />
            </svg>
            <span class="text-[9px] font-semibold uppercase tracking-wider">drag → path · 2×-click → last</span>
          </div>
          <div class="flex items-center gap-1">
            <input
              bind:value={h.name}
              placeholder="Name"
              class="min-w-0 flex-1 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-xs font-semibold text-purple-900 dark:text-purple-100"
            />
            <button
              type="button"
              title="Remove heading"
              on:click={() => removeHeading(h.id)}
              class="text-red-400 hover:text-red-500 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-4 stroke-current">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="text-purple-700/70 dark:text-purple-300/70">Deg</span>
            <input
              type="number"
              step="1"
              min="-180"
              max="180"
              bind:value={h.degrees}
              class="w-full min-w-0 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none"
            />
            <button
              type="button"
              title="Set with the protractor dial"
              on:click|preventDefault={(e) => toggleProt("head:" + h.id, e, null)}
              class="p-0.5 rounded text-purple-400 hover:text-purple-600 shrink-0"
              class:text-purple-600={prot?.key === "head:" + h.id}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={1.8} stroke="currentColor" class="size-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 1 0 0-18M12 21a9 9 0 0 1 0-18m0 18V3m0 9 6.5-4" />
              </svg>
            </button>
            {#if prot?.key === "head:" + h.id}
              <HeadingProtractor
                value={h.degrees ?? 0}
                anchor={prot.anchor}
                previewPoint={null}
                onInput={(d) => {
                  h.degrees = d;
                  headings = [...headings];
                }}
                onClose={() => (prot = null)}
              />
            {/if}
          </div>
        </div>
      {/each}

      <button
        type="button"
        on:click={addHeading}
        class="flex items-center justify-center gap-1 rounded-lg border border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-xs font-semibold min-h-[3.5rem]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Heading
      </button>
    </div>
  {/if}
</div>
