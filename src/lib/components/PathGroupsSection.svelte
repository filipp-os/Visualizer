<script lang="ts">
  import { pathClipboard } from "../../stores";
  import GroupPreviewPopup from "./GroupPreviewPopup.svelte";

  // pathGroups library: [{ id, name, items: [...] }]
  export let groups: any[] = [];
  export let collapsed: boolean = false;
  export let onInsert: (groupId: string) => void = () => {};
  export let onGroupDragStart: (groupId: string) => void = () => {};
  export let onGroupDragEnd: () => void = () => {};
  export let recordChange: () => void = () => {};

  const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let previewId: string | null = null;
  let previewAnchor: HTMLElement | null = null;

  function openPreview(id: string, e: MouseEvent) {
    previewAnchor = e.currentTarget as HTMLElement;
    previewId = id;
  }

  function duplicateGroup(id: string) {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    const clone = JSON.parse(JSON.stringify(g));
    clone.id = makeId();
    clone.name = `${g.name} Copy`;
    const idx = groups.findIndex((x) => x.id === id);
    groups = [...groups.slice(0, idx + 1), clone, ...groups.slice(idx + 1)];
    recordChange();
  }

  function copyGroup(id: string) {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    pathClipboard.set({
      kind: "group",
      group: { name: g.name, items: JSON.parse(JSON.stringify(g.items || [])) },
    });
  }

  function pasteGroup() {
    const clip = $pathClipboard;
    if (!clip || clip.kind !== "group") return;
    groups = [
      ...groups,
      {
        id: makeId(),
        name: clip.group.name || `Group ${groups.length + 1}`,
        items: JSON.parse(JSON.stringify(clip.group.items || [])),
      },
    ];
    recordChange();
  }

  function removeGroup(id: string) {
    groups = groups.filter((g) => g.id !== id);
    recordChange();
  }

  function itemCount(g: any) {
    return (g.items || []).length;
  }

  $: previewGroup = previewId ? groups.find((g) => g.id === previewId) : null;
</script>

<div
  class="w-full rounded-md border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800"
>
  <div class="flex items-center gap-2 mb-2">
    <button
      type="button"
      on:click={() => (collapsed = !collapsed)}
      class="flex items-center gap-2 text-left"
      title="{collapsed ? 'Expand' : 'Collapse'} path groups"
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
        Path Groups
      </p>
    </button>
    {#if $pathClipboard?.kind === "group"}
      <button
        type="button"
        on:click={pasteGroup}
        class="ml-auto px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
        title="Paste the copied group into the library"
      >
        Paste group
      </button>
    {/if}
  </div>

  {#if !collapsed}
    {#if groups.length === 0}
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        Select path &amp; wait bubbles in the timeline, then use “Group” to save them here as a reusable group.
      </p>
    {/if}
    <div
      class="grid gap-2"
      style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));"
    >
      {#each groups as g (g.id)}
        <div
          class="flex flex-col gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-2"
          draggable="true"
          role="group"
          on:dragstart={(e) => {
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("application/x-pp-group", g.id);
              e.dataTransfer.setData("text/plain", g.name);
            }
            onGroupDragStart(g.id);
          }}
          on:dragend={onGroupDragEnd}
        >
          <div class="flex items-center gap-1">
            <span
              class="cursor-grab active:cursor-grabbing text-emerald-400 shrink-0 select-none"
              title="Drag onto a timeline gap to insert this group"
              aria-hidden="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
                <circle cx="6" cy="5" r="1.4" /><circle cx="14" cy="5" r="1.4" />
                <circle cx="6" cy="10" r="1.4" /><circle cx="14" cy="10" r="1.4" />
                <circle cx="6" cy="15" r="1.4" /><circle cx="14" cy="15" r="1.4" />
              </svg>
            </span>
            <input
              bind:value={g.name}
              on:change={recordChange}
              placeholder="Group name"
              class="min-w-0 flex-1 pl-1.5 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-xs font-semibold text-emerald-900 dark:text-emerald-100"
            />
            <button
              type="button"
              title="Delete group"
              on:click={() => removeGroup(g.id)}
              class="text-red-400 hover:text-red-500 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} class="size-4 stroke-current">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="text-[11px] text-emerald-700/70 dark:text-emerald-300/70">
            {itemCount(g)} item{itemCount(g) === 1 ? "" : "s"}
          </div>

          <div class="flex flex-wrap items-center gap-1">
            <button
              type="button"
              on:click={(e) => openPreview(g.id, e)}
              class="px-1.5 py-0.5 text-[11px] rounded bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
            >
              Preview
            </button>
            <button
              type="button"
              on:click={() => onInsert(g.id)}
              class="px-1.5 py-0.5 text-[11px] rounded bg-emerald-600 text-white hover:bg-emerald-700"
              title="Add this group to the end of the timeline (minimized)"
            >
              Insert
            </button>
            <button
              type="button"
              on:click={() => duplicateGroup(g.id)}
              class="px-1.5 py-0.5 text-[11px] rounded bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
            >
              Duplicate
            </button>
            <button
              type="button"
              on:click={() => copyGroup(g.id)}
              class="px-1.5 py-0.5 text-[11px] rounded bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
            >
              Copy
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if previewGroup && previewAnchor}
  <GroupPreviewPopup
    group={previewGroup}
    anchor={previewAnchor}
    onClose={() => {
      previewId = null;
      previewAnchor = null;
    }}
  />
{/if}
