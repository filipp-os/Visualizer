<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { SavedHeading } from "../../types";
  import PresetPicker from "./PresetPicker.svelte";

  export let endPoint: any;
  export let locked: boolean = false;
  // The heading the robot is already facing right before this path starts
  // (end heading of the previous path, or the startPoint's own heading for
  // the very first path). Linear paths auto-follow this for their start
  // heading unless the user opts into a custom one.
  export let previousEndHeading: number = 0;
  export let savedHeadings: SavedHeading[] = [];
  const dispatch = createEventDispatcher();

  let startPickerOpen = false;
  let endPickerOpen = false;
  let constPickerOpen = false;
  let startPickerBtn: HTMLButtonElement;
  let endPickerBtn: HTMLButtonElement;
  let constPickerBtn: HTMLButtonElement;

  // Keep a linear path's start heading locked to whatever heading the robot
  // is already facing, unless the user has explicitly opted into a custom
  // start heading via the checkbox below.
  $: if (
    endPoint.heading === "linear" &&
    !endPoint.customStartHeading &&
    endPoint.startDeg !== previousEndHeading
  ) {
    endPoint.startDeg = previousEndHeading;
    dispatch("change");
  }
</script>

<select
  bind:value={endPoint.heading}
  on:change={() => {
    // Initialize missing properties based on the selected heading type
    if (endPoint.heading === "constant" && endPoint.degrees === undefined) {
      endPoint.degrees = 0;
    } else if (endPoint.heading === "linear") {
      if (endPoint.endDeg === undefined) endPoint.endDeg = 0;
      if (endPoint.customStartHeading === undefined)
        endPoint.customStartHeading = false;
      // startDeg is populated by the reactive auto-follow block above
    } else if (endPoint.heading === "tangential") {
      if (endPoint.reverse === undefined) endPoint.reverse = false;
    }
    dispatch("change");
  }}
  class=" rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28 text-sm"
  title="The heading style of the robot. 
With constant heading, the robot maintains the same heading throughout the line. 
With linear heading, heading changes linearly between given start and end angles. 
With tangential heading, the heading follows the direction of the line."
  disabled={locked}
>
  <option value="constant">Constant</option>
  <option value="linear">Linear</option>
  <option value="tangential">Tangential</option>
</select>

{#if endPoint.heading === "linear"}
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1">
      <span class="text-xs text-neutral-600 dark:text-neutral-400">Start:</span>
      {#if endPoint.customStartHeading && endPoint.startHeadingLink}
        <div class="flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5">
          <span class="text-xs font-semibold text-purple-800 dark:text-purple-200">{endPoint.startHeadingLink.sourceName}</span>
          <span class="text-xs text-purple-700/70 dark:text-purple-300/70">({endPoint.startDeg}°)</span>
          <button
            type="button"
            title="Remove saved heading (unlock manual entry)"
            disabled={locked}
            on:click={() => {
              endPoint.startHeadingLink = undefined;
              dispatch("change");
              dispatch("commit");
            }}
            class="text-purple-400 hover:text-red-500 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-3 stroke-current">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {:else}
        <input
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14 disabled:opacity-50"
          step="1"
          type="number"
          min="-180"
          max="180"
          bind:value={endPoint.startDeg}
          on:input={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title={endPoint.customStartHeading
            ? "The heading the robot starts this line at (in degrees)"
            : "Auto-following the previous path's end heading. Check \"Custom\" to set this manually."}
          disabled={locked || !endPoint.customStartHeading}
        />
        {#if endPoint.customStartHeading}
          <button
            type="button"
            bind:this={startPickerBtn}
            title="Choose a saved heading"
            on:click={() => (startPickerOpen = !startPickerOpen)}
            class="p-0.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400"
            disabled={locked}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {#if startPickerOpen}
            <PresetPicker
              mode="heading"
              headings={savedHeadings}
              anchor={startPickerBtn}
              onSelect={(item) => {
                endPoint.startDeg = item.degrees;
                endPoint.startHeadingLink = {
                  sourceType: "heading",
                  sourceId: item.id,
                  sourceName: item.name,
                };
                dispatch("change");
                dispatch("commit");
                startPickerOpen = false;
              }}
              onClose={() => (startPickerOpen = false)}
            />
          {/if}
        {/if}
      {/if}
      <label class="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 ml-1">
        <input
          type="checkbox"
          checked={endPoint.customStartHeading ?? false}
          on:change={(e) => {
            endPoint.customStartHeading = e.currentTarget.checked;
            if (!endPoint.customStartHeading) {
              endPoint.startDeg = previousEndHeading;
              endPoint.startHeadingLink = undefined;
            }
            dispatch("change");
            dispatch("commit");
          }}
          disabled={locked}
        />
        Custom
      </label>
    </div>
    <div class="flex items-center gap-1">
      <span class="text-xs text-neutral-600 dark:text-neutral-400">End:</span>
      {#if endPoint.endHeadingLink}
        <div class="flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5">
          <span class="text-xs font-semibold text-purple-800 dark:text-purple-200">{endPoint.endHeadingLink.sourceName}</span>
          <span class="text-xs text-purple-700/70 dark:text-purple-300/70">({endPoint.endDeg}°)</span>
          <button
            type="button"
            title="Remove saved heading (unlock manual entry)"
            disabled={locked}
            on:click={() => {
              endPoint.endHeadingLink = undefined;
              dispatch("change");
              dispatch("commit");
            }}
            class="text-purple-400 hover:text-red-500 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-3 stroke-current">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {:else}
        <input
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
          step="1"
          type="number"
          min="-180"
          max="180"
          bind:value={endPoint.endDeg}
          on:input={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title="The heading the robot ends this line at (in degrees)"
          disabled={locked}
        />
        <button
          type="button"
          bind:this={endPickerBtn}
          title="Choose a saved heading"
          on:click={() => (endPickerOpen = !endPickerOpen)}
          class="p-0.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400"
          disabled={locked}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {#if endPickerOpen}
          <PresetPicker
            mode="heading"
            headings={savedHeadings}
            anchor={endPickerBtn}
            onSelect={(item) => {
              endPoint.endDeg = item.degrees;
              endPoint.endHeadingLink = {
                sourceType: "heading",
                sourceId: item.id,
                sourceName: item.name,
              };
              dispatch("change");
              dispatch("commit");
              endPickerOpen = false;
            }}
            onClose={() => (endPickerOpen = false)}
          />
        {/if}
      {/if}
    </div>
  </div>
{:else if endPoint.heading === "constant"}
  <div class="flex items-center gap-1">
    <span class="text-xs text-neutral-600 dark:text-neutral-400">Deg:</span>
    {#if endPoint.headingLink}
      <div class="flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5">
        <span class="text-xs font-semibold text-purple-800 dark:text-purple-200">{endPoint.headingLink.sourceName}</span>
        <span class="text-xs text-purple-700/70 dark:text-purple-300/70">({endPoint.degrees}°)</span>
        <button
          type="button"
          title="Remove saved heading (unlock manual entry)"
          disabled={locked}
          on:click={() => {
            endPoint.headingLink = undefined;
            dispatch("change");
            dispatch("commit");
          }}
          class="text-purple-400 hover:text-red-500 disabled:opacity-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-3 stroke-current">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {:else}
      <input
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
        step="1"
        type="number"
        min="-180"
        max="180"
        value={endPoint.degrees || 0}
        on:input={(e) => {
          const value = parseFloat(e.target.value);
          if (!isNaN(value)) {
            endPoint.degrees = value;
          } else {
            // If empty or invalid, set to 0
            endPoint.degrees = 0;
            e.target.value = "0";
          }
          dispatch("change");
        }}
        on:blur={(e) => {
          if (e.target.value === "" || isNaN(parseFloat(e.target.value))) {
            endPoint.degrees = 0;
            e.target.value = "0";
          }
          dispatch("commit");
        }}
        title="The constant heading the robot maintains throughout this line (in degrees)"
        disabled={locked}
      />
      <button
        type="button"
        bind:this={constPickerBtn}
        title="Choose a saved heading"
        on:click={() => (constPickerOpen = !constPickerOpen)}
        class="p-0.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400"
        disabled={locked}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {#if constPickerOpen}
        <PresetPicker
          mode="heading"
          headings={savedHeadings}
          anchor={constPickerBtn}
          onSelect={(item) => {
            endPoint.degrees = item.degrees;
            endPoint.headingLink = {
              sourceType: "heading",
              sourceId: item.id,
              sourceName: item.name,
            };
            dispatch("change");
            dispatch("commit");
            constPickerOpen = false;
          }}
          onClose={() => (constPickerOpen = false)}
        />
      {/if}
    {/if}
  </div>
{:else if endPoint.heading === "tangential"}
  <p class="text-sm font-extralight">Reverse:</p>
  <input
    type="checkbox"
    bind:checked={endPoint.reverse}
    on:change={() => dispatch("change")}
    on:blur={() => dispatch("commit")}
    title="Reverse the direction the robot faces along the tangential path"
    disabled={locked}
  />
{/if}
