<script lang="ts">
  // Recursively renders a path group's items, including nested groups.
  export let items: any[] = [];
  export let depth: number = 0;
</script>

{#each items as it, i (i)}
  {#if it.kind === "group"}
    <li
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100"
      style="margin-left: {depth * 12}px"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-3 shrink-0">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
      <span class="truncate">{it.name || "Group"}</span>
      <span class="ml-auto opacity-60 shrink-0">{(it.items || []).length}</span>
    </li>
    <svelte:self items={it.items || []} depth={depth + 1} />
  {:else}
    <li
      class="flex items-center gap-2 rounded-md px-2 py-1 text-xs {it.kind === 'wait'
        ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100'
        : 'bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100'}"
      style="margin-left: {depth * 12}px"
    >
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
  {/if}
{/each}
