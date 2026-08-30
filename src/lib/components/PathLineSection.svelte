<script lang="ts">
  import type { Line, Point, SavedPosition, SavedHeading, PresetLink } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import ControlPointsSection from "./ControlPointsSection.svelte";
  import HeadingControls from "./HeadingControls.svelte";
  import PresetPicker from "./PresetPicker.svelte";
  import { computePreviousEndHeading } from "../../utils/math";

  export let line: Line;
  export let idx: number;
  export let lines: Line[];
  export let startPoint: Point;
  export let savedPositions: SavedPosition[] = [];
  export let savedHeadings: SavedHeading[] = [];
  export let collapsed: boolean;
  export let collapsedControlPoints: boolean;
  export let onRemove: () => void;
  export let onInsertAfter: () => void;
  export let onInsertMidpoint: () => void;
  export let onAddWaitAfter: () => void;
  export let recordChange: () => void;
  export let onDragStart: (e: DragEvent) => void;
  export let onDragEnd: () => void;
  export let optimizeLine: (lineId: string, targetControlPointIndex?: number) => void;
  export let optimizing: boolean = false;
  export let chainOptions: Array<{ id: string; name: string; color: string }> = [];
  export let selectedChainId: string = "";
  export let onChainChange: (chainId: string) => void;

  let positionPickerOpen = false;
  let positionPickerBtn: HTMLButtonElement;

  // Built here (inside <script>, so TS can narrow the literal sourceType)
  // rather than as an inline object literal in markup — Svelte markup
  // expressions can't use "as const"/type assertions.
  function makePositionLink(item: SavedPosition): PresetLink {
    return { sourceType: "position", sourceId: item.id, sourceName: item.name };
  }

  // The heading the robot is already facing right before this path starts —
  // feeds HeadingControls so a "linear" path can auto-follow it.
  $: previousEndHeading = computePreviousEndHeading(lines, idx, startPoint);


  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function handleChainSelect(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    if (onChainChange) {
      onChainChange(target.value);
    }
  }
</script>

<div
  class="flex flex-col w-full justify-start items-start gap-0 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm overflow-hidden"
  style="--bubble-color: {line.color}"
>
  <div
    class="flex flex-row w-full items-center gap-3 flex-wrap px-2 py-1.5 rounded-full"
    style="background: color-mix(in srgb, {line.color} 12%, transparent);"
  >
    <!-- Drag handle: grab anywhere on this to reorder the bubble -->
    <span
      draggable="true"
      on:dragstart={onDragStart}
      on:dragend={onDragEnd}
      title="Drag to reorder"
      role="button"
      tabindex="0"
      aria-label="Drag to reorder this path bubble"
      class="cursor-grab active:cursor-grabbing text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0 select-none"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
        <circle cx="6" cy="5" r="1.4" /><circle cx="14" cy="5" r="1.4" />
        <circle cx="6" cy="10" r="1.4" /><circle cx="14" cy="10" r="1.4" />
        <circle cx="6" cy="15" r="1.4" /><circle cx="14" cy="15" r="1.4" />
      </svg>
    </span>

    <div class="flex flex-row items-center gap-2">
      <button
        on:click={toggleCollapsed}
        class="flex items-center gap-2 font-semibold px-2 py-1 rounded transition-colors duration-250"
        title="{collapsed ? 'Expand' : 'Collapse'} path"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-4 transition-transform {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
        Path {idx + 1}
      </button>

      <input
        bind:value={line.name}
        placeholder="Path {idx + 1}"
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold"
        disabled={line.locked}
        on:input={() => {
          // Force parent reactivity so other components (like exporters)
          // pick up the updated name immediately.
          lines = [...lines];
        }}
        on:blur={() => {
          // Commit the change for history/undo
          lines = [...lines];
          if (recordChange) recordChange();
        }}
      />

      <select
        value={selectedChainId}
        on:change={handleChainSelect}
        class="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-900"
        title="Assign path chain"
      >
        {#each chainOptions as chain}
          <option value={chain.id}>{chain.name}</option>
        {/each}
      </select>

      <div
        class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
        style="background-color: {line.color}"
      >
        <div class="absolute inset-0" title="Color comes from assigned path chain" />
      </div>

      <!-- Lock/Unlock Button -->
      <button
        title={line.locked ? "Unlock Path" : "Lock Path"}
        on:click|stopPropagation={() => {
          line.locked = !line.locked;
          lines = [...lines]; // Force reactivity
        }}
        class="p-1 rounded transition-colors duration-250"
      >
        {#if line.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-yellow-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-gray-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>
    </div>

    <div class="flex flex-row items-center gap-1">
      <button
        class="px-2 py-1 text-xs font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-200/80 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        title={line.locked ? "Path locked" : "Optimize this path"}
        on:click={() => line.id && optimizeLine && optimizeLine(line.id)}
        disabled={!line.id || line.locked || optimizing}
      >
        {optimizing ? "Optimizing…" : "Optimize"}
      </button>
    </div>

    <div class="flex flex-row items-center gap-1 ml-auto">
      <button
        title="Add control point after this line"
        on:click={onInsertAfter}
        class="text-blue-500 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={line.locked}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          class="size-5 stroke-green-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </button>

      <!-- Insert Midpoint Between This and Next Path (dark-blue plus icon) -->
      <button
        title="Insert point between this path and the next"
        on:click={() => onInsertMidpoint && onInsertMidpoint()}
        class="text-blue-700 hover:text-blue-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 8h4m6 0h4m-9 0 1.75-2.5M12 6l1.25 2.5"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 16h4m6 0h4m-9 0 1.75 2.5M12 18l1.25-2.5"
          />
          <circle cx="12" cy="12" r="2.1" />
        </svg>
      </button>

      <!-- Add Wait After Button -->
      <button
        title="Add Wait After"
        on:click={onAddWaitAfter}
        class="text-[#E1461B] hover:text-orange-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
      </button>

      {#if lines.length > 1}
        <button title="Remove Line" on:click={onRemove}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            class="size-5 stroke-red-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if !collapsed}
    <div class={`h-[0.75px] w-full`} style={`background: ${line.color}`} />

    <div class="flex flex-col justify-start items-start w-full px-3 pb-2 pt-1 gap-1">
      <div class="font-light">Point Position:</div>
      <div class="flex flex-row justify-start items-center gap-2 flex-wrap">
        {#if line.endPoint.positionLink}
          <!-- Linked to a saved position: show its name + coords instead of raw inputs -->
          <div
            class="flex items-center gap-1.5 rounded-md bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 px-2 py-1"
          >
            <span class="text-xs font-semibold text-sky-800 dark:text-sky-200"
              >{line.endPoint.positionLink.sourceName}</span
            >
            <span class="text-xs text-sky-700/70 dark:text-sky-300/70"
              >({line.endPoint.x}, {line.endPoint.y})</span
            >
            <button
              type="button"
              title="Remove saved position (unlock manual X/Y)"
              disabled={line.locked}
              on:click={() => {
                const removedId = line.endPoint.positionLink?.sourceId;
                line.endPoint.positionLink = undefined;
                // If the heading currently shown was auto-set BY this same
                // saved position, unlink that too — otherwise it'd claim to
                // be linked to a position that's no longer associated here.
                if (
                  line.endPoint.heading === "linear" &&
                  line.endPoint.endHeadingLink?.sourceType === "position" &&
                  line.endPoint.endHeadingLink?.sourceId === removedId
                ) {
                  line.endPoint.endHeadingLink = undefined;
                } else if (
                  line.endPoint.heading === "constant" &&
                  line.endPoint.headingLink?.sourceType === "position" &&
                  line.endPoint.headingLink?.sourceId === removedId
                ) {
                  line.endPoint.headingLink = undefined;
                }
                lines = [...lines];
                recordChange();
              }}
              class="text-sky-400 hover:text-red-500 disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-3.5 stroke-current">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {:else}
          <div class="font-extralight">X:</div>
          <input
            class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
            step={$snapToGrid && $showGrid ? $gridSize : 0.1}
            type="number"
            min="0"
            max="141.5"
            bind:value={line.endPoint.x}
            disabled={line.locked}
            title={snapToGridTitle}
          />
          <div class="font-extralight">Y:</div>
          <input
            class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
            step={$snapToGrid && $showGrid ? $gridSize : 0.1}
            min="0"
            max="141.5"
            type="number"
            bind:value={line.endPoint.y}
            disabled={line.locked}
            title={snapToGridTitle}
          />

          <button
            type="button"
            bind:this={positionPickerBtn}
            title="Choose a saved position"
            on:click={() => (positionPickerOpen = !positionPickerOpen)}
            class="p-1 rounded text-neutral-500 dark:text-neutral-400 hover:text-sky-600 dark:hover:text-sky-400"
            disabled={line.locked}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {#if positionPickerOpen}
            <PresetPicker
              mode="position"
              positions={savedPositions}
              anchor={positionPickerBtn}
              onSelect={(item) => {
                line.endPoint.x = item.x;
                line.endPoint.y = item.y;
                line.endPoint.positionLink = makePositionLink(item);
                // A saved position can optionally carry its own heading —
                // when it does, auto-fill the path's heading field too.
                if (item.heading !== undefined) {
                  if (line.endPoint.heading === "linear") {
                    line.endPoint.endDeg = item.heading;
                    line.endPoint.endHeadingLink = makePositionLink(item);
                  } else if (line.endPoint.heading === "constant") {
                    line.endPoint.degrees = item.heading;
                    line.endPoint.headingLink = makePositionLink(item);
                  }
                }
                lines = [...lines];
                recordChange();
                positionPickerOpen = false;
              }}
              onClose={() => (positionPickerOpen = false)}
            />
          {/if}
        {/if}

        <HeadingControls
          endPoint={line.endPoint}
          locked={line.locked}
          {previousEndHeading}
          {savedHeadings}
          on:change={() => {
            // Force reactivity so timeline recalculates immediately
            lines = [...lines];
          }}
          on:commit={() => {
            // Commit change to history
            lines = [...lines];
            recordChange();
          }}
        />
      </div>
    </div>

    <ControlPointsSection
      bind:line
      lineIdx={idx}
      bind:collapsed={collapsedControlPoints}
      onAddControlPoint={onInsertAfter}
      {recordChange}
    />
  {/if}
</div>

<style>
  @keyframes rainbow-glow {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

</style>
