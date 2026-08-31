<script lang="ts">
  import type { Point, Line, SequenceItem, PathChain } from "../../types";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
  import plaintext from "svelte-highlight/languages/plaintext";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath } from "../../stores";
  import {
    generateJavaCode,
    generatePointsArray,
    generateSequentialCommandCode,
  } from "../../utils/codeExporter";
  import {
    generateIvyPathsClass,
    generateIvyOpMode,
  } from "../../utils/ivyExporter";
  import { ivyBanner } from "../../utils/exportBridge";
  import ProjectExportPanel from "./ProjectExportPanel.svelte";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];

  type ExportFormat =
    | "java"
    | "points"
    | "sequential"
    | "ivy-paths"
    | "ivy-opmode";

  let exportMode: "full" | "class" | "coordinates" = "class";
  let exportFormat: ExportFormat = "java";
  let sequentialClassName = "AutoPath";
  let exportedCode = "";
  let currentLanguage: typeof java | typeof plaintext = java;
  let copied = false;

  // --- IVY export options ---
  let ivyClassName = "Auto";
  let ivyPackage = "";
  let ivyAllianceMirror = false; // Style A: runtime isRed ? .mirror()
  let ivyMirrorPoses = false; // Style B: bake mirrored coordinates

  function fileBaseName(): string {
    const fn = $currentFilePath?.split(/[\\/]/).pop();
    if (!fn) return "Auto";
    const base = fn.replace(/\.pp$/, "").replace(/[^a-zA-Z0-9]/g, "");
    return base || "Auto";
  }

  // For the generated-file banner + manifest: the real .pp name, or "" when
  // the path hasn't been saved yet.
  function bannerSource(): string {
    return $currentFilePath ? fileBaseName() : "";
  }

  async function regenerateIvy() {
    if (exportFormat === "ivy-paths") {
      exportedCode = await generateIvyPathsClass(
        startPoint,
        lines,
        sequence,
        pathChains,
        {
          className: ivyClassName,
          packageName: ivyPackage || undefined,
          allianceMirror: ivyAllianceMirror,
        },
      );
    } else if (exportFormat === "ivy-opmode") {
      exportedCode = await generateIvyOpMode(
        startPoint,
        lines,
        sequence,
        pathChains,
        {
          className: ivyClassName,
          packageName: ivyPackage || undefined,
          mirrorPoses: ivyMirrorPoses,
        },
      );
    }
  }

  // Mirrors ivyExporter's `ident()` so the on-disk class name we compute here
  // matches the `public class …` the generator actually emits.
  function ivyIdent(base: string): string {
    const c = (base || "Auto").replace(/[^a-zA-Z0-9]/g, "");
    if (!c) return "Auto";
    return /^[0-9]/.test(c) ? "Auto" + c : c;
  }

  // Regenerate IVY code for a specific package + base name without disturbing
  // the on-screen preview. Returns the real on-disk class name + bannered file.
  async function buildIvyArtifact(
    base: string,
    packageName: string,
  ): Promise<{ className: string; code: string }> {
    const cleanBase = ivyIdent(base);
    if (exportFormat === "ivy-paths") {
      const code = await generateIvyPathsClass(
        startPoint,
        lines,
        sequence,
        pathChains,
        {
          className: cleanBase,
          packageName: packageName || undefined,
          allianceMirror: ivyAllianceMirror,
        },
      );
      return {
        className: cleanBase + "Paths",
        code: ivyBanner(bannerSource()) + code,
      };
    }
    const code = await generateIvyOpMode(
      startPoint,
      lines,
      sequence,
      pathChains,
      {
        className: cleanBase,
        packageName: packageName || undefined,
        mirrorPoses: ivyMirrorPoses,
      },
    );
    return { className: cleanBase, code: ivyBanner(bannerSource()) + code };
  }

  function downloadCode() {
    let name = "export.txt";
    if (exportFormat === "ivy-paths")
      name = `${ivyIdent(ivyClassName)}Paths.java`;
    else if (exportFormat === "ivy-opmode")
      name = `${ivyIdent(ivyClassName)}.java`;
    else if (exportFormat === "java") name = "PathExport.java";
    else if (exportFormat === "sequential")
      name = `${sequentialClassName || "AutoPath"}.java`;
    else if (exportFormat === "points") name = "points.txt";
    const isIvy =
      exportFormat === "ivy-paths" || exportFormat === "ivy-opmode";
    const payload = isIvy
      ? ivyBanner(bannerSource()) + (exportedCode || "")
      : exportedCode || "";
    const blob = new Blob([payload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Update sequential class name when file changes
  $: if ($currentFilePath) {
    const fileName = $currentFilePath.split(/[\\/]/).pop();
    if (fileName) {
      const baseName = fileName
        .replace(".pp", "")
        .replace(/[^a-zA-Z0-9]/g, "_");
      if (
        sequentialClassName === "AutoPath" ||
        sequentialClassName === baseName
      ) {
        sequentialClassName = baseName;
      }
    }
  }

  export async function openWithFormat(format: ExportFormat) {
    exportFormat = format;

    try {
      if (format === "ivy-paths" || format === "ivy-opmode") {
        ivyClassName = fileBaseName();
        ivyPackage =
          format === "ivy-paths"
            ? "org.firstinspires.ftc.teamcode.pedroPathing"
            : "org.firstinspires.ftc.teamcode.opmode.autos";
        currentLanguage = java;
        exportedCode = "// generating…";
        isOpen = true;
        await regenerateIvy();
        return;
      }
      if (format === "java") {
        exportedCode = await generateJavaCode(
          startPoint,
          lines,
          exportMode,
          pathChains,
        );
        currentLanguage = java;
      } else if (format === "points") {
        exportedCode = generatePointsArray(startPoint, lines);
        currentLanguage = plaintext;
      } else if (format === "sequential") {
        // Initialize the editable class name from the current file path
        // so the user sees the file-derived class name, but keep the
        // field editable for manual overrides.
        if ($currentFilePath) {
          const fileName = $currentFilePath.split(/[\\/]/).pop();
          if (fileName) {
            sequentialClassName = fileName
              .replace(".pp", "")
              .replace(/[^a-zA-Z0-9]/g, "_");
          }
        }
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
        );
        currentLanguage = java;
      }
      isOpen = true;
    } catch (error) {
      console.error("Export failed:", error);
      exportedCode =
        "// Error generating code. Please check the console for details.";
      currentLanguage = plaintext;
      isOpen = true;
    }
  }

  async function refreshSequentialCode() {
    if (exportFormat === "sequential" && isOpen) {
      try {
        // Use the user-editable `sequentialClassName` so manual edits are respected
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
        );
      } catch (error) {
        console.error("Refresh failed:", error);
        exportedCode =
          "// Error refreshing code. Please check the console for details.";
      }
    }
  }

  async function handleExportModeChange() {
    if (exportFormat === "java") {
      exportedCode = await generateJavaCode(startPoint, lines, exportMode, pathChains);
    }
  }
</script>

<svelte:head>
  {@html codeStyle}
</svelte:head>

{#if isOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005]"
    role="dialog"
    aria-modal="true"
    aria-label="Export code dialog"
    tabindex="-1"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-start p-4 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-4xl gap-2.5 max-h-[90vh]"
      tabindex="-1"
      role="document"
    >
      <div class="flex flex-row justify-between items-center w-full">
        <p class="text-sm font-light text-neutral-700 dark:text-neutral-400">
          {#if exportFormat === "java"}
            Here is the generated Java code for this path:
          {:else if exportFormat === "points"}
            Here is the points array for this path:
          {:else if exportFormat === "sequential"}
            Here is the Sequential Command code for this path:
          {:else if exportFormat === "ivy-paths"}
            IVY <span class="font-medium">Paths</span> command class — one
            <code>CommandBuilder</code> per path chain:
          {:else if exportFormat === "ivy-opmode"}
            Self-contained IVY OpMode — inlined poses + path commands +
            <code>Groups.sequential(...)</code>:
          {/if}
        </p>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          {#if exportFormat === "ivy-paths" || exportFormat === "ivy-opmode"}
            <label
              class="text-sm font-light text-neutral-700 dark:text-neutral-400"
              >Class:</label
            >
            <input
              type="text"
              bind:value={ivyClassName}
              on:input={regenerateIvy}
              class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-28"
              placeholder="Auto"
            />
            <input
              type="text"
              bind:value={ivyPackage}
              on:input={regenerateIvy}
              class="px-2 py-1 text-xs rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              placeholder="package name"
              title="Java package for the generated file"
            />
            {#if exportFormat === "ivy-paths"}
              <label
                class="text-xs font-light text-neutral-700 dark:text-neutral-400 flex items-center gap-1"
                title="Adds `activeX = isRed ? X.mirror() : X` so the class mirrors for the RED alliance at runtime"
              >
                <input
                  type="checkbox"
                  bind:checked={ivyAllianceMirror}
                  on:change={regenerateIvy}
                />
                Alliance-mirror code
              </label>
            {:else}
              <label
                class="text-xs font-light text-neutral-700 dark:text-neutral-400 flex items-center gap-1"
                title="Bakes mirrored coordinates (x → 141.5 − x, heading → 180° − heading) into the pose literals"
              >
                <input
                  type="checkbox"
                  bind:checked={ivyMirrorPoses}
                  on:change={regenerateIvy}
                />
                Mirror poses
              </label>
            {/if}
          {/if}
          {#if exportFormat === "java"}
            <label
              for="export-mode"
              class="text-sm font-light text-neutral-700 dark:text-neutral-400"
              >Export Mode:</label
            >
            <select
              id="export-mode"
              bind:value={exportMode}
              on:change={handleExportModeChange}
              class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="coordinates">Coordinates Only</option>
              <option value="class">Class Only</option>
              <option value="full">Full Code</option>
            </select>
          {:else if exportFormat === "sequential"}
            <div class="flex items-center gap-2">
              <label
                for="class-name"
                class="text-sm font-light text-neutral-700 dark:text-neutral-400"
                >Class Name:</label
              >
              <input
                id="class-name"
                type="text"
                bind:value={sequentialClassName}
                on:input={refreshSequentialCode}
                class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                placeholder="AutoPath"
              />
            </div>
          {/if}
          <button
            on:click={() => (isOpen = false)}
            aria-label="Close export dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-6 text-neutral-700 dark:text-neutral-400"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {#if exportFormat === "ivy-paths" || exportFormat === "ivy-opmode"}
        <ProjectExportPanel
          kind={exportFormat}
          baseName={ivyClassName}
          source={bannerSource()}
          build={buildIvyArtifact}
        />
      {/if}

      <div class="relative w-full flex-1 overflow-auto">
        <Highlight
          language={currentLanguage}
          code={exportedCode}
          class="w-full"
        />
        <button
          title="Download as a file"
          on:click={downloadCode}
          class="absolute bottom-2 right-14 opacity-45 hover:opacity-100 transition-all duration-200 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-800 p-2 rounded"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </button>
        <button
          title={copied ? "Copied" : "Copy code to clipboard"}
          on:click={async () => {
            try {
              await navigator.clipboard.writeText(exportedCode || "");
              copied = true;
              setTimeout(() => (copied = false), 1500);
            } catch (err) {
              console.error("Clipboard copy failed:", err);
            }
          }}
          class="absolute bottom-2 right-2 opacity-45 hover:opacity-100 transition-all duration-200 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-800 p-2 rounded"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}
