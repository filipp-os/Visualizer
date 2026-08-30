<script lang="ts">
  import type {
    Point,
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
    PathChain,
    SavedPosition,
    SavedHeading,
  } from "../types";
  import _ from "lodash";
  import { onMount } from "svelte";
  import hotkeys from "hotkeys-js";
  import { getRandomColor } from "../utils";
  import { pathClipboard } from "../stores";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PathLineSection from "./components/PathLineSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import WaitRow from "./components/WaitRow.svelte";
  import PresetsSection from "./components/PresetsSection.svelte";
  import PathGroupsSection from "./components/PathGroupsSection.svelte";
  import TimelineContextMenu from "./components/TimelineContextMenu.svelte";
  import { calculatePathTime } from "../utils";

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let pathChains: PathChain[] = [];
  export let savedPositions: SavedPosition[] = [];
  export let savedHeadings: SavedHeading[] = [];
  // Path Groups library + the group instances currently in the timeline.
  export let pathGroups: any[] = [];
  export let groupInstances: any[] = [];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: Settings;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  export let optimizeLine: (lineId: string, targetControlPointIndex?: number) => void;
  export let optimizingLineIds: Record<string, boolean> = {};

  export let shapes: Shape[];
  export let recordChange: () => void;

  const makeChainId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const defaultChainName = "Main Chain";

  let selectedChainId = "";
  let chainNameDraft = "";
  let chainColorDraft = "#22c55e";
  let selectedChain: PathChain | null = null;
  let previousSelectedChainId = "";
  let chainOptions: Array<{ id: string; name: string; color: string }> = [];

  const getChainById = (chainId: string): PathChain | null =>
    pathChains.find((chain) => chain.id === chainId) || null;

  function getLinePrimaryChainId(lineId: string): string {
    for (const chain of pathChains) {
      if ((chain.lineIds || []).includes(lineId)) return chain.id;
    }
    return pathChains[0]?.id || "";
  }

  function syncLineColorsToChains() {
    const chainColorById = new Map(pathChains.map((chain) => [chain.id, chain.color || "#22c55e"]));
    let changed = false;
    const nextLines = lines.map((line) => {
      const ownerId = getLinePrimaryChainId(line.id || "");
      const targetColor = chainColorById.get(ownerId) || line.color;
      if (line.color !== targetColor) {
        changed = true;
        return { ...line, color: targetColor };
      }
      return line;
    });
    if (changed) {
      lines = nextLines;
    }
  }

  function ensureDefaultChain() {
    if (pathChains.length === 0) {
      pathChains = [
        {
          id: makeChainId(),
          name: defaultChainName,
          color: getRandomColor(),
          lineIds: lines.map((ln) => ln.id!).filter(Boolean),
        },
      ];
      selectedChainId = pathChains[0]?.id || "";
      return;
    }

    if (!selectedChainId || !pathChains.some((c) => c.id === selectedChainId)) {
      selectedChainId = pathChains[0]?.id || "";
    }
  }

  $: {
    const normalized = pathChains.map((chain) => ({
      ...chain,
      color: chain.color || getRandomColor(),
      lineIds: chain.lineIds || [],
    }));
    if (JSON.stringify(normalized) !== JSON.stringify(pathChains)) {
      pathChains = normalized;
    }
  }

  $: ensureDefaultChain();

  $: selectedChain =
    pathChains.find((chain) => chain.id === selectedChainId) || pathChains[0] || null;

  $: if (selectedChainId !== previousSelectedChainId) {
    chainNameDraft = selectedChain?.name || "";
    chainColorDraft = selectedChain?.color || "#22c55e";
    previousSelectedChainId = selectedChainId;
  }

  function ensureLineInDefaultChain(lineId: string) {
    if (!lineId || !pathChains.length) return;
    assignLineToChain(lineId, pathChains[0].id);
  }

  function removeLineFromChains(lineId: string) {
    if (!lineId) return;
    const updated = pathChains.map((chain) => ({
        ...chain,
        lineIds: chain.lineIds.filter((id) => id !== lineId),
      }));
    pathChains = updated;
    ensureDefaultChain();
    syncLineColorsToChains();
  }

  function assignLineToChain(lineId: string, chainId: string) {
    if (!lineId || !chainId) return;
    pathChains = pathChains.map((chain) => ({
      ...chain,
      lineIds: chain.lineIds.filter((id) => id !== lineId),
    }));

    const target = getChainById(chainId);
    if (!target) return;

    pathChains = pathChains.map((chain) => {
      if (chain.id !== chainId) return chain;
      return {
        ...chain,
        lineIds: Array.from(new Set([...(chain.lineIds || []), lineId])),
      };
    });

    syncLineColorsToChains();
    recordChange?.();
  }

  function addPathChain() {
    const newChain: PathChain = {
      id: makeChainId(),
      name: `Chain ${pathChains.length + 1}`,
      color: getRandomColor(),
      lineIds: [],
    };
    pathChains = [...pathChains, newChain];
    selectedChainId = newChain.id;
    recordChange?.();
  }

  function duplicateSelectedPathChain() {
    if (!selectedChain) return;

    const sourceLineIds = selectedChain.lineIds || [];
    const selectedLineSet = new Set(sourceLineIds);
    const lineLookup = new Map(lines.map((line) => [line.id, line]));
    const idMap = new Map<string, string>();
    const clonedLines: Line[] = [];

    // Keep duplication order aligned with timeline, then append any non-sequenced lines.
    const orderedSourceIds: string[] = [];
    sequence.forEach((item) => {
      if (item.kind === "path" && selectedLineSet.has(item.lineId)) {
        orderedSourceIds.push(item.lineId);
      }
    });
    sourceLineIds.forEach((lineId) => {
      if (!orderedSourceIds.includes(lineId)) {
        orderedSourceIds.push(lineId);
      }
    });

    orderedSourceIds.forEach((sourceId, index) => {
      const sourceLine = lineLookup.get(sourceId);
      if (!sourceLine) return;
      const clone = JSON.parse(JSON.stringify(sourceLine)) as Line;
      const newLineId = makeId();
      clone.id = newLineId;
      clone.name = `${sourceLine.name || `Path ${lines.length + index + 1}`} Copy`;
      idMap.set(sourceId, newLineId);
      clonedLines.push(clone);
    });

    const newSequence: SequenceItem[] = [];
    sequence.forEach((item) => {
      newSequence.push(item);
      if (item.kind === "path") {
        const clonedId = idMap.get(item.lineId);
        if (clonedId) {
          newSequence.push({ kind: "path", lineId: clonedId });
        }
      }
    });

    // If chain contains lines currently not present in the timeline, append their clones.
    orderedSourceIds.forEach((sourceId) => {
      const inSequence = sequence.some((item) => item.kind === "path" && item.lineId === sourceId);
      const clonedId = idMap.get(sourceId);
      if (!inSequence && clonedId) {
        newSequence.push({ kind: "path", lineId: clonedId });
      }
    });

    lines = [...lines, ...clonedLines];
    sequence = newSequence;
    syncLinesToSequence(newSequence);

    const duplicateChain: PathChain = {
      id: makeChainId(),
      name: `${selectedChain.name} Copy`,
      color: getRandomColor(),
      lineIds: orderedSourceIds.map((sourceId) => idMap.get(sourceId)).filter(Boolean) as string[],
    };

    const selectedIndex = pathChains.findIndex((chain) => chain.id === selectedChain.id);
    if (selectedIndex >= 0) {
      pathChains = [
        ...pathChains.slice(0, selectedIndex + 1),
        duplicateChain,
        ...pathChains.slice(selectedIndex + 1),
      ];
    } else {
      pathChains = [...pathChains, duplicateChain];
    }

    selectedChainId = duplicateChain.id;
    syncLineColorsToChains();
    recordChange?.();
  }

  function removeSelectedPathChain() {
    if (!selectedChain || pathChains.length <= 1) return;
    const fallbackChainId = pathChains.find((chain) => chain.id !== selectedChain.id)?.id;
    const orphanedLines = [...(selectedChain.lineIds || [])];
    pathChains = pathChains.filter((chain) => chain.id !== selectedChain.id);

    if (fallbackChainId) {
      orphanedLines.forEach((lineId) => assignLineToChain(lineId, fallbackChainId));
    }

    selectedChainId = pathChains[0]?.id || "";
    syncLineColorsToChains();
    recordChange?.();
  }

  function updateSelectedChainName() {
    if (!selectedChain) return;
    const nextName = chainNameDraft.trim();
    if (!nextName) return;
    pathChains = pathChains.map((chain) =>
      chain.id === selectedChain.id ? { ...chain, name: nextName } : chain,
    );
    recordChange?.();
  }

  function updateSelectedChainColor() {
    if (!selectedChain) return;
    pathChains = pathChains.map((chain) =>
      chain.id === selectedChain.id ? { ...chain, color: chainColorDraft } : chain,
    );
    syncLineColorsToChains();
    recordChange?.();
  }

  $: chainOptions = pathChains.map((chain) => ({
    id: chain.id,
    name: chain.name,
    color: chain.color || "#22c55e",
  }));

  $: syncLineColorsToChains();

  // Reference exported but unused props to silence Svelte unused-export warnings

  $: robotWidth;
  $: robotHeight;

  // Compute timeline markers for the UI (start of each travel segment)
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: markers = (() => {
    const _markers: { percent: number; color: string; name: string }[] = [];
    if (
      !timePrediction ||
      !timePrediction.timeline ||
      timePrediction.totalTime <= 0
    )
      return _markers;

    timePrediction.timeline.forEach((ev) => {
      if ((ev as any).type === "travel") {
        const end = (ev as any).endTime as number;
        const pct = (end / timePrediction.totalTime) * 100;
        const lineIndex = (ev as any).lineIndex as number;
        const line = lines[lineIndex];
        const color = line?.color || "#ffffff";
        const name = line?.name || `Path ${lineIndex + 1}`;
        _markers.push({ percent: pct, color, name });
      }
    });

    return _markers;
  })();


  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  // Collapsed state for obstacles (default collapsed)
  let collapsedObstacles = shapes.map(() => true);

  // Reactive statements to update UI state when lines or shapes change from file load
  $: if (lines.length !== collapsedSections.lines.length) {
    collapsedSections = {
      obstacles: collapsedSections.obstacles ?? shapes.map(() => true),
      lines: lines.map(() => false),
      controlPoints: lines.map(() => true),
    };
  }

  // Keep obstacle collapse state aligned with shapes list
  $: if (shapes.length !== collapsedObstacles.length) {
    collapsedObstacles = shapes.map(() => true);
  }

  $: if (!collapsedSections.obstacles || shapes.length !== collapsedSections.obstacles.length) {
    collapsedSections = {
      ...collapsedSections,
      obstacles: shapes.map(() => true),
    };
  }

  const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  function getWait(i: any) {
    return i as any;
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Find the next path item in the sequence after seqIndex
    let nextPathSeqIndex = -1;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextPathSeqIndex = i;
        break;
      }
    }

    // If there is no next path in sequence, fall back to addLine behavior (append new randomized point)
    let newPoint: Point | null = null;
    if (nextPathSeqIndex !== -1) {
      const nextLineId = (sequence[nextPathSeqIndex] as any).lineId;
      const nextLine = lines.find((l) => l.id === nextLineId);
      if (
        nextLine &&
        nextLine.endPoint &&
        currentLine &&
        currentLine.endPoint
      ) {
        const a = currentLine.endPoint;
        const b = nextLine.endPoint;
        const midX = (Number(a.x) + Number(b.x)) / 2;
        const midY = (Number(a.y) + Number(b.y)) / 2;
        newPoint = {
          x: midX,
          y: midY,
          heading: "tangential",
          reverse: false,
        };
      }
    }

    if (!newPoint) {
      // fallback: random nearby point from current end
      if (currentLine && currentLine.endPoint) {
        newPoint = {
          x: (currentLine.endPoint.x ?? 72) + _.random(-12, 12),
          y: (currentLine.endPoint.y ?? 72) + _.random(-12, 12),
          heading: "tangential",
          reverse: false,
        };
      } else {
        newPoint = {
          x: _.random(0, 141.5),
          y: _.random(0, 141.5),
          heading: "tangential",
          reverse: false,
        };
      }
    }

    const newLine = {
      id: makeId(),
      endPoint: newPoint,
      controlPoints: [],
      color: getRandomColor(),
      name: `Path ${lines.length + 1}`,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert the new line after the current one and a sequence item after current seq index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    collapsedSections.lines.splice(lineIndex + 1, 0, false);
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
  }

  // Insert a midpoint between this path and the next path in sequence
  function insertMidpointAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Find the next path in sequence
    let nextPathSeqIndex = -1;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextPathSeqIndex = i;
        break;
      }
    }

    if (nextPathSeqIndex === -1) {
      // no next path -> do nothing or fallback
      return;
    }

    const nextLineId = (sequence[nextPathSeqIndex] as any).lineId;
    const nextLine = lines.find((l) => l.id === nextLineId);
    if (!currentLine || !nextLine) return;

    const a = currentLine.endPoint;
    const b = nextLine.endPoint;
    const midX = (Number(a.x) + Number(b.x)) / 2;
    const midY = (Number(a.y) + Number(b.y)) / 2;

    const newLine: Line = {
      id: makeId(),
      endPoint: {
        x: midX,
        y: midY,
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      name: `Path ${lines.length + 1}`,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert into lines right after current line index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    // Insert into sequence right after seqIndex
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    collapsedSections.lines.splice(lineIndex + 1, 0, false);
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);

    collapsedSections = { ...collapsedSections };
    recordChange();
  }

  function removeLine(idx: number) {
    const removedId = lines[idx]?.id;
    let _lns = lines;
    lines.splice(idx, 1);
    lines = _lns;
    if (removedId) {
      sequence = sequence.filter(
        (s) => s.kind === "wait" || s.lineId !== removedId,
      );
      removeLineFromChains(removedId);
    }
    collapsedSections.lines.splice(idx, 1);
    collapsedSections.controlPoints.splice(idx, 1);
    recordChange();
  }

  function addLine() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 141.5),
        y: _.random(0, 141.5),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);
    recordChange();
  }

  function addCurve() {
    const newLine: Line = {
      id: makeId(),
      name: `Curve ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 141.5),
        y: _.random(0, 141.5),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    addControlPointToLine(lines.length - 1);
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);
    recordChange();
  }

  // Add a control point to the line represented by `seqIndex` in the sequence
  function addControlPointToLine(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    if (lineIndex === -1) return;
    const line = lines[lineIndex];
    line.controlPoints = line.controlPoints || [];
    const prevPt = lineIndex === 0 ? startPoint : lines[lineIndex - 1].endPoint;
    const endPt = line.endPoint || { x: 72, y: 72 };
    const mx = ((prevPt?.x ?? 72) + (endPt?.x ?? 72)) / 2;
    const my = ((prevPt?.y ?? 72) + (endPt?.y ?? 72)) / 2;
    line.controlPoints.push({
      x: mx + _.random(-4, 4),
      y: my + _.random(-4, 4),
    });
    collapsedSections.controlPoints[lineIndex] = false;
    lines = [...lines];
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  // Add a control point to the last path in `lines` (fallback: create a new line)
  function addControlPointToLastLine() {
    if (!lines || lines.length === 0) {
      // No lines exist: create a new line instead
      addLine();
      return;
    }

    // Prefer adding to the first line whose control points are expanded (user is focusing it)
    let targetIdx = collapsedSections.controlPoints.findIndex(
      (v) => v === false,
    );
    if (targetIdx === -1) targetIdx = lines.length - 1;

    const line = lines[targetIdx];
    line.controlPoints = line.controlPoints || [];
    // Insert a control point near the line midpoint for convenience
    const prevPt = targetIdx === 0 ? startPoint : lines[targetIdx - 1].endPoint;
    const endPt = line.endPoint || { x: 72, y: 72 };
    const mx = ((prevPt?.x ?? 72) + (endPt?.x ?? 72)) / 2;
    const my = ((prevPt?.y ?? 72) + (endPt?.y ?? 72)) / 2;
    line.controlPoints.push({
      x: mx + _.random(-4, 4),
      y: my + _.random(-4, 4),
    });
    // Ensure control points UI is expanded for this line
    collapsedSections.controlPoints[targetIdx] = false;
    lines = [...lines];
    collapsedSections = { ...collapsedSections };
    recordChange?.();
  }

  function addWait() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, wait];
  }

  function addWaitAtStart() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    } as SequenceItem;
    sequence = [wait, ...sequence];
  }

  function addPathAtStart() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 141.5),
        y: _.random(0, 141.5),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [newLine, ...lines];
    sequence = [{ kind: "path", lineId: newLine.id! }, ...sequence];
    ensureLineInDefaultChain(newLine.id!);
    collapsedSections.lines = [false, ...collapsedSections.lines];
    collapsedSections.controlPoints = [
      true,
      ...collapsedSections.controlPoints,
    ];
    recordChange();
  }

  function insertWaitAfter(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    });
    sequence = newSeq;
  }

  function insertPathAfter(seqIndex: number) {
    // Create a new line with default settings
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Add the new line to the lines array
    lines = [...lines, newLine];

    // Insert the new path in the sequence after the wait
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;
    ensureLineInDefaultChain(newLine.id!);

    // Add UI state for the new line
    collapsedSections.lines.push(false);
    collapsedSections.controlPoints.push(true);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
    recordChange();
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const indexedLines = lines.map((line, idx) => ({
      line,
      collapsed: collapsedSections.lines[idx],
      control: collapsedSections.controlPoints[idx],
    }));

    const byId = new Map(indexedLines.map((entry) => [entry.line.id, entry]));
    const reordered: typeof indexedLines = [];

    pathOrder.forEach((id) => {
      const entry = byId.get(id);
      if (entry) {
        reordered.push(entry);
        byId.delete(id);
      }
    });

    // Append any lines that are not currently in the sequence to preserve data
    reordered.push(...byId.values());

    lines = reordered.map((entry) => entry.line);
    collapsedSections = {
      ...collapsedSections,
      lines: reordered.map((entry) => entry.collapsed ?? false),
      controlPoints: reordered.map((entry) => entry.control ?? true),
    };
    // No collapsedEventMarkers to update
  }

  // --- Bubble drag-and-drop reordering ---
  // (Replaces the old adjacent-swap up/down buttons.) Bubbles themselves are
  // NOT drop targets — only the thin gap slots between them are, so the
  // layout never resizes while dragging (which was causing the jitter: a
  // growing/shrinking indicator shifted whatever was under the cursor,
  // re-triggering the hover event in a feedback loop). Each gap has a
  // constant-size hit area; only an inner line's color toggles on hover.
  let draggedSeqIndex: number | null = null;
  let dragOverGap: number | null = null;
  // Set while a saved position/heading grip is being dragged (see the
  // "Saved position / heading drag-and-drop" section below).
  let draggedPreset: { kind: "position" | "heading"; id: string } | null = null;
  // Set while a whole collapsed group bubble is being dragged in the timeline.
  let draggedGroupId: string | null = null;
  // Set while a group card from the library is being dragged.
  let draggedLibGroupId: string | null = null;

  $: gapArmed =
    draggedSeqIndex !== null ||
    draggedGroupId !== null ||
    draggedLibGroupId !== null ||
    draggedPreset?.kind === "position";

  function isLockedSequenceItem(index: number): boolean {
    const it = sequence[index];
    if (!it) return false;
    if (it.kind === "path") {
      const ln = lines.find((l) => l.id === it.lineId);
      return ln?.locked ?? false;
    }
    return (it as any).locked ?? false;
  }

  // Move the item at `fromIndex` to sit at `toIndex` (arbitrary distance,
  // unlike moveSequenceItem which only swaps adjacent items). `groupId`:
  // undefined = keep the item's group membership, null = clear it, string =
  // set it (used when dropping into / out of a group's territory).
  function reorderSequence(
    fromIndex: number,
    toIndex: number,
    groupId: string | null | undefined = undefined,
  ) {
    if (fromIndex === toIndex && groupId === undefined) return;
    if (fromIndex < 0 || fromIndex >= sequence.length) return;
    if (toIndex < 0 || toIndex >= sequence.length) return;
    if (isLockedSequenceItem(fromIndex)) return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(fromIndex, 1) as any[];
    if (groupId === null) delete item.groupInstanceId;
    else if (typeof groupId === "string") item.groupInstanceId = groupId;
    newSeq.splice(toIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange?.();
  }

  // Move every member of a group as one contiguous block to `gapIndex`.
  function moveGroupBlock(gid: string, gapIndex: number) {
    const memberIdxs = groupMemberIdxs(gid);
    if (!memberIdxs.length) return;
    const block = memberIdxs.map((i) => sequence[i]);
    const rest = sequence.filter((it: any) => it.groupInstanceId !== gid);
    const removedBefore = memberIdxs.filter((i) => i < gapIndex).length;
    const insertAt = Math.max(0, Math.min(gapIndex - removedBefore, rest.length));
    sequence = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
    syncLinesToSequence(sequence);
    recordChange?.();
  }

  function handleBubbleDragStart(sIdx: number, e: DragEvent) {
    if (isLockedSequenceItem(sIdx)) {
      e.preventDefault();
      return;
    }
    draggedSeqIndex = sIdx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires setData to actually start a drag
      e.dataTransfer.setData("text/plain", String(sIdx));
    }
  }

  function handleBubbleDragEnd() {
    draggedSeqIndex = null;
    dragOverGap = null;
  }

  function handleGroupDragStart(gid: string, e: DragEvent) {
    draggedGroupId = gid;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "group:" + gid);
    }
  }
  function handleGroupDragEnd() {
    draggedGroupId = null;
    dragOverGap = null;
  }

  // `gapIndex` ranges 0..sequence.length: gap 0 sits before the first
  // bubble, gap sequence.length sits after the last one. `groupId` (when the
  // gap sits inside an expanded group) tags anything dropped there.
  function handleGapDragOver(gapIndex: number, e: DragEvent) {
    e.preventDefault();
    if (draggedSeqIndex !== null || draggedGroupId !== null) {
      dragOverGap = gapIndex;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      return;
    }
    const types = e.dataTransfer?.types ?? [];
    if (
      draggedPreset?.kind === "position" ||
      draggedLibGroupId !== null ||
      types.includes("application/x-pp-position") ||
      types.includes("application/x-pp-group")
    ) {
      dragOverGap = gapIndex;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleGapDragLeave(gapIndex: number) {
    if (dragOverGap === gapIndex) dragOverGap = null;
  }

  function handleGapDrop(
    gapIndex: number,
    e: DragEvent,
    groupId: string | null = null,
  ) {
    e.preventDefault();
    if (draggedGroupId !== null) {
      moveGroupBlock(draggedGroupId, gapIndex);
    } else if (draggedSeqIndex !== null) {
      // Dropping into the gap "before item[gapIndex]" means the final
      // resting index is gapIndex, UNLESS the dragged item currently sits
      // earlier in the list — removing it first shifts everything after it
      // back by one, so the target slides down to gapIndex - 1.
      const targetIndex =
        draggedSeqIndex < gapIndex ? gapIndex - 1 : gapIndex;
      reorderSequence(draggedSeqIndex, targetIndex, groupId);
    } else if (draggedPreset?.kind === "position") {
      insertPositionAsPath(draggedPreset.id, gapIndex, groupId);
    } else {
      const posId = e.dataTransfer?.getData("application/x-pp-position");
      const grpId = e.dataTransfer?.getData("application/x-pp-group");
      if (posId) insertPositionAsPath(posId, gapIndex, groupId);
      else if (grpId) insertGroupFromLibrary(grpId, gapIndex);
    }
    draggedSeqIndex = null;
    dragOverGap = null;
    draggedPreset = null;
    draggedGroupId = null;
    draggedLibGroupId = null;
  }

  // --- Saved position / heading drag-and-drop ---
  // A saved *position* dropped into a timeline gap becomes a new linear path
  // ending at that position (end heading = the position's heading, else 0),
  // linked to the position. A saved *heading* dropped onto a path bubble
  // fills that path's constant/end heading and links it.
  function handlePresetDragStart(kind: "position" | "heading", id: string) {
    draggedPreset = { kind, id };
  }
  function handlePresetDragEnd() {
    draggedPreset = null;
  }

  function makePresetLink(
    kind: "position" | "heading",
    item: { id: string; name: string },
  ) {
    return { sourceType: kind, sourceId: item.id, sourceName: item.name };
  }

  function buildPositionLine(pos: any): Line {
    const link = makePresetLink("position", pos);
    const endPoint: any = {
      x: pos.x,
      y: pos.y,
      heading: "linear",
      startDeg: 0, // auto-follows the previous path's end heading in HeadingControls
      endDeg: pos.heading ?? 0,
      customStartHeading: false,
      positionLink: link,
    };
    // Only claim a heading link when the position actually carries a heading.
    if (pos.heading !== undefined && pos.heading !== null) {
      endPoint.endHeadingLink = { ...link };
    }
    return {
      id: makeId(),
      name: pos.name || `Path ${lines.length + 1}`,
      endPoint,
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    } as Line;
  }

  function insertPositionAsPath(
    posId: string,
    seqIndex: number,
    groupId: string | null = null,
  ) {
    const pos = (savedPositions as any[]).find((p) => p.id === posId);
    if (!pos) return;
    const newLine = buildPositionLine(pos);
    const clamped = Math.max(0, Math.min(seqIndex, sequence.length));

    lines = [...lines, newLine];
    const newSeq = [...sequence];
    const item: any = { kind: "path", lineId: newLine.id! };
    if (groupId) item.groupInstanceId = groupId;
    newSeq.splice(clamped, 0, item);
    sequence = newSeq;
    syncLinesToSequence(newSeq);
    ensureLineInDefaultChain(newLine.id!);
    recordChange?.();
  }

  function applyHeadingToLine(lineId: string, headingId: string) {
    const h = (savedHeadings as any[]).find((hh) => hh.id === headingId);
    if (!h || !lineId) return;
    const line = lines.find((l) => l.id === lineId);
    if (!line || line.locked) return;
    const ep = line.endPoint as any;
    const link = makePresetLink("heading", h);
    if (ep.heading === "linear") {
      ep.endDeg = h.degrees;
      ep.endHeadingLink = link;
    } else {
      // constant — and tangential becomes constant, since dropping a heading
      // is an explicit request for that heading.
      ep.heading = "constant";
      ep.degrees = h.degrees;
      ep.headingLink = link;
    }
    lines = [...lines];
    recordChange?.();
  }

  // Double-click a saved position: append it as a path at the end.
  function appendPositionAsPath(posId: string) {
    insertPositionAsPath(posId, sequence.length);
  }

  // Double-click a saved heading: apply it to the last path in the sequence.
  function applyHeadingToLastPath(headingId: string) {
    for (let i = sequence.length - 1; i >= 0; i--) {
      const it = sequence[i];
      if (it.kind === "path") {
        applyHeadingToLine(it.lineId, headingId);
        return;
      }
    }
  }

  // =========================================================================
  // Path groups, selection, clipboard, and the bubble context menu
  // =========================================================================

  $: groupInstById = new Map(
    (groupInstances || []).map((g: any) => [g.id, g]),
  );

  const seqKey = (it: any) =>
    it.kind === "path" ? "p:" + it.lineId : "w:" + it.id;

  const gidOf = (it: any): string | undefined => it?.groupInstanceId;

  function groupMemberIdxs(gid: string): number[] {
    const out: number[] = [];
    sequence.forEach((it: any, i) => {
      if (it.groupInstanceId === gid) out.push(i);
    });
    return out;
  }

  // Drop stray group instances whose members were all removed / ungrouped.
  $: {
    const live = new Set(
      sequence.map((it: any) => it.groupInstanceId).filter(Boolean),
    );
    if ((groupInstances || []).some((g: any) => !live.has(g.id))) {
      groupInstances = groupInstances.filter((g: any) => live.has(g.id));
    }
  }

  function toggleGroupCollapsed(gid: string) {
    groupInstances = groupInstances.map((g: any) =>
      g.id === gid ? { ...g, collapsed: !g.collapsed } : g,
    );
  }
  function renameGroupInstanceLive(gid: string, name: string) {
    groupInstances = groupInstances.map((g: any) =>
      g.id === gid ? { ...g, name } : g,
    );
  }

  // Build reusable library-group items from a run of sequence entries.
  function snapshotItems(idxs: number[]) {
    const items: any[] = [];
    idxs.forEach((i) => {
      const it: any = sequence[i];
      if (it.kind === "path") {
        const ln = lines.find((l) => l.id === it.lineId);
        if (ln) items.push({ kind: "path", line: JSON.parse(JSON.stringify(ln)) });
      } else {
        items.push({
          kind: "wait",
          name: it.name,
          durationMs: it.durationMs,
        });
      }
    });
    return items;
  }

  // Turn a { name, items } group definition into real lines + sequence items,
  // spliced in at `seqIndex`, wrapped in a fresh (collapsed) group instance.
  function materializeGroup(src: any, seqIndex: number, groupId: string) {
    const instId = makeId();
    const newLines: Line[] = [];
    const newItems: any[] = [];
    (src.items || []).forEach((it: any) => {
      if (it.kind === "path") {
        const clone = JSON.parse(JSON.stringify(it.line)) as Line;
        clone.id = makeId();
        newLines.push(clone);
        newItems.push({
          kind: "path",
          lineId: clone.id,
          groupInstanceId: instId,
        });
      } else {
        newItems.push({
          kind: "wait",
          id: makeId(),
          name: it.name,
          durationMs: it.durationMs,
          groupInstanceId: instId,
        });
      }
    });

    lines = [...lines, ...newLines];
    const clamped = Math.max(0, Math.min(seqIndex, sequence.length));
    const newSeq = [...sequence];
    newSeq.splice(clamped, 0, ...newItems);
    sequence = newSeq;
    groupInstances = [
      ...groupInstances,
      { id: instId, groupId: groupId || "", name: src.name, collapsed: true },
    ];
    syncLinesToSequence(newSeq);
    newLines.forEach((l) => l.id && ensureLineInDefaultChain(l.id));
    recordChange?.();
  }

  function insertGroupFromLibrary(groupId: string, seqIndex: number) {
    const g = (pathGroups || []).find((x: any) => x.id === groupId);
    if (!g) return;
    materializeGroup(g, seqIndex, groupId);
  }

  function ungroup(gid: string) {
    sequence = sequence.map((it: any) => {
      if (it.groupInstanceId !== gid) return it;
      const { groupInstanceId, ...rest } = it;
      return rest;
    });
    groupInstances = groupInstances.filter((g: any) => g.id !== gid);
    recordChange?.();
  }

  function deleteGroupInstance(gid: string) {
    const memberIdxs = groupMemberIdxs(gid);
    const lineIds = new Set(
      memberIdxs
        .map((i) => sequence[i])
        .filter((it: any) => it.kind === "path")
        .map((it: any) => it.lineId),
    );
    sequence = sequence.filter((it: any) => it.groupInstanceId !== gid);
    lines = lines.filter((l) => !lineIds.has(l.id));
    lineIds.forEach((id) => removeLineFromChains(id as string));
    groupInstances = groupInstances.filter((g: any) => g.id !== gid);
    syncLinesToSequence(sequence);
    recordChange?.();
  }

  function copyGroupInstance(gid: string) {
    const inst: any = groupInstById.get(gid);
    pathClipboard.set({
      kind: "group",
      group: {
        name: inst?.name || "Group",
        items: snapshotItems(groupMemberIdxs(gid)),
      },
    });
  }

  function duplicateGroupInstance(gid: string) {
    const inst: any = groupInstById.get(gid);
    const memberIdxs = groupMemberIdxs(gid);
    const after = (memberIdxs[memberIdxs.length - 1] ?? -1) + 1;
    materializeGroup(
      { name: (inst?.name || "Group") + " Copy", items: snapshotItems(memberIdxs) },
      after,
      inst?.groupId || "",
    );
  }

  // ---- Selection (click / shift / cmd) --------------------------------------
  let selectedKeys: string[] = [];
  let lastClickedIdx: number | null = null;

  // Reactive so the selection bar / ring re-render (Svelte doesn't track
  // deps through a plain function call in markup).
  $: selectedKeySet = new Set(selectedKeys);
  $: selectedIdxList = selectedKeys.length
    ? sequence.reduce<number[]>((acc, it: any, i) => {
        if (selectedKeySet.has(seqKey(it))) acc.push(i);
        return acc;
      }, [])
    : [];
  $: selCount = selectedIdxList.length;
  $: selHasGrouped = selectedIdxList.some((i) => gidOf(sequence[i]));

  const selectedIndices = () =>
    sequence
      .map((it: any, i) => (selectedKeys.includes(seqKey(it)) ? i : -1))
      .filter((i) => i >= 0);
  const selectionHasGrouped = () =>
    selectedIndices().some((i) => (sequence[i] as any).groupInstanceId);

  function clearSelection() {
    selectedKeys = [];
    lastClickedIdx = null;
  }

  function onBubbleClick(i: number, e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      t.closest(
        'button,input,select,textarea,a,[role="button"],[draggable="true"]',
      )
    )
      return;
    const key = seqKey(sequence[i]);
    if (e.shiftKey && lastClickedIdx !== null) {
      const lo = Math.min(lastClickedIdx, i);
      const hi = Math.max(lastClickedIdx, i);
      const range = sequence.slice(lo, hi + 1).map(seqKey);
      selectedKeys = Array.from(new Set([...selectedKeys, ...range]));
    } else if (e.metaKey || e.ctrlKey) {
      selectedKeys = selectedKeys.includes(key)
        ? selectedKeys.filter((k) => k !== key)
        : [...selectedKeys, key];
      lastClickedIdx = i;
    } else {
      selectedKeys = [key];
      lastClickedIdx = i;
    }
  }

  // ---- Group the current selection into a new named group -----------------
  function groupSelected() {
    const idxs = selectedIndices();
    if (idxs.length < 1) return;
    const lo = Math.min(...idxs);
    const hi = Math.max(...idxs);
    for (let i = lo; i <= hi; i++) {
      if ((sequence[i] as any).groupInstanceId) {
        alert("Some of the selected bubbles are already in a group.");
        return;
      }
    }
    const suggested = `Group ${(pathGroups?.length ?? 0) + 1}`;
    const name = prompt("Name this path group:", suggested);
    if (name === null) return;
    const finalName = name.trim() || suggested;

    const span: number[] = [];
    for (let i = lo; i <= hi; i++) span.push(i);

    const groupId = makeId();
    const instId = makeId();
    pathGroups = [
      ...pathGroups,
      { id: groupId, name: finalName, items: snapshotItems(span) },
    ];
    groupInstances = [
      ...groupInstances,
      { id: instId, groupId, name: finalName, collapsed: true },
    ];
    sequence = sequence.map((it: any, i) =>
      i >= lo && i <= hi ? { ...it, groupInstanceId: instId } : it,
    );
    clearSelection();
    recordChange?.();
  }

  // ---- Copy / duplicate / paste (context menu + Cmd+C/D/V) ---------------
  function copyIdx(i: number) {
    const it: any = sequence[i];
    if (it.kind === "path") {
      const ln = lines.find((l) => l.id === it.lineId);
      if (!ln) return;
      const clone: any = JSON.parse(JSON.stringify(ln));
      delete clone.id;
      pathClipboard.set({ kind: "path", line: clone });
    } else {
      pathClipboard.set({
        kind: "wait",
        name: it.name,
        durationMs: it.durationMs,
      });
    }
  }

  function duplicateIdx(i: number) {
    const it: any = sequence[i];
    const gid = it.groupInstanceId ?? null;
    if (it.kind === "path") {
      const ln = lines.find((l) => l.id === it.lineId);
      if (!ln) return;
      const clone: any = JSON.parse(JSON.stringify(ln));
      clone.id = makeId();
      clone.name = (ln.name || "Path") + " Copy";
      lines = [...lines, clone];
      const newItem: any = { kind: "path", lineId: clone.id };
      if (gid) newItem.groupInstanceId = gid;
      const ns = [...sequence];
      ns.splice(i + 1, 0, newItem);
      sequence = ns;
      syncLinesToSequence(ns);
      ensureLineInDefaultChain(clone.id);
      recordChange?.();
    } else {
      const newItem: any = {
        kind: "wait",
        id: makeId(),
        name: it.name || "Wait",
        durationMs: it.durationMs,
      };
      if (gid) newItem.groupInstanceId = gid;
      const ns = [...sequence];
      ns.splice(i + 1, 0, newItem);
      sequence = ns;
      recordChange?.();
    }
  }

  function pasteAfter(i: number) {
    const clip: any = $pathClipboard;
    if (!clip) return;
    const gid = (sequence[i] as any)?.groupInstanceId ?? null;
    if (clip.kind === "group") {
      materializeGroup(clip.group, i + 1, "");
      return;
    }
    if (clip.kind === "path") {
      const clone: any = JSON.parse(JSON.stringify(clip.line));
      clone.id = makeId();
      if (!clone.name) clone.name = `Path ${lines.length + 1}`;
      lines = [...lines, clone];
      const newItem: any = { kind: "path", lineId: clone.id };
      if (gid) newItem.groupInstanceId = gid;
      const ns = [...sequence];
      ns.splice(i + 1, 0, newItem);
      sequence = ns;
      syncLinesToSequence(ns);
      ensureLineInDefaultChain(clone.id);
      recordChange?.();
    } else if (clip.kind === "wait") {
      const newItem: any = {
        kind: "wait",
        id: makeId(),
        name: clip.name || "Wait",
        durationMs: clip.durationMs ?? 0,
      };
      if (gid) newItem.groupInstanceId = gid;
      const ns = [...sequence];
      ns.splice(i + 1, 0, newItem);
      sequence = ns;
      recordChange?.();
    }
  }

  function deleteIdx(i: number) {
    const it: any = sequence[i];
    if (it.kind === "path") {
      const li = lines.findIndex((l) => l.id === it.lineId);
      if (li >= 0) removeLine(li);
    } else {
      const ns = [...sequence];
      ns.splice(i, 1);
      sequence = ns;
      recordChange?.();
    }
  }

  // ---- Context menu ------------------------------------------------------
  let ctxMenu: { x: number; y: number; entries: any[] } | null = null;

  function onBubbleContextMenu(i: number, e: MouseEvent) {
    e.preventDefault();
    const key = seqKey(sequence[i]);
    if (!selectedKeys.includes(key)) {
      selectedKeys = [key];
      lastClickedIdx = i;
    }
    const clip = $pathClipboard;
    const entries: any[] = [
      { label: "Copy", hint: "⌘C", onClick: () => copyIdx(i) },
      { label: "Duplicate", hint: "⌘D", onClick: () => duplicateIdx(i) },
      { label: "Paste after", hint: "⌘V", disabled: !clip, onClick: () => pasteAfter(i) },
    ];
    const n = selectedIndices().length;
    if (n >= 1 && !selectionHasGrouped()) {
      entries.push({ divider: true });
      entries.push({
        label: `Group ${n} selected…`,
        onClick: groupSelected,
      });
    }
    entries.push({ divider: true });
    entries.push({ label: "Delete", danger: true, onClick: () => deleteIdx(i) });
    ctxMenu = { x: e.clientX, y: e.clientY, entries };
  }

  function onGroupContextMenu(gid: string, e: MouseEvent) {
    e.preventDefault();
    const clip = $pathClipboard;
    const memberIdxs = groupMemberIdxs(gid);
    const lastIdx = memberIdxs[memberIdxs.length - 1] ?? sequence.length - 1;
    ctxMenu = {
      x: e.clientX,
      y: e.clientY,
      entries: [
        { label: "Copy group", onClick: () => copyGroupInstance(gid) },
        { label: "Duplicate group", onClick: () => duplicateGroupInstance(gid) },
        {
          label: "Paste after",
          disabled: !clip,
          onClick: () => pasteAfter(lastIdx),
        },
        { divider: true },
        { label: "Ungroup", onClick: () => ungroup(gid) },
        {
          label: "Delete group",
          danger: true,
          onClick: () => deleteGroupInstance(gid),
        },
      ],
    };
  }

  onMount(() => {
    const act = (fn: () => void) => (e: KeyboardEvent) => {
      if (selectedIndices().length !== 1) return;
      e.preventDefault();
      fn();
    };
    hotkeys("ctrl+c,command+c", act(() => copyIdx(selectedIndices()[0])));
    hotkeys("ctrl+d,command+d", act(() => duplicateIdx(selectedIndices()[0])));
    hotkeys("ctrl+v,command+v", act(() => pasteAfter(selectedIndices()[0])));
    hotkeys("escape", () => clearSelection());
    return () => {
      hotkeys.unbind("ctrl+c,command+c");
      hotkeys.unbind("ctrl+d,command+d");
      hotkeys.unbind("ctrl+v,command+v");
      hotkeys.unbind("escape");
    };
  });
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <ObstaclesSection bind:shapes bind:collapsedObstacles />

    <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />

    <StartingPointSection bind:startPoint {addPathAtStart} {addWaitAtStart} />

    <div class="w-full rounded-md border border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800">
      <div class="flex items-center gap-2 mb-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-300">Path Chains</p>
        <select
          bind:value={selectedChainId}
          class="flex-1 px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
        >
          {#each pathChains as chain (chain.id)}
            <option value={chain.id}>{chain.name} ({(chain.lineIds || []).length})</option>
          {/each}
        </select>
        <button on:click={addPathChain} class="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">New</button>
        <button on:click={duplicateSelectedPathChain} class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">Duplicate</button>
        <button
          on:click={removeSelectedPathChain}
          disabled={pathChains.length <= 1}
          class="px-2 py-1 text-xs rounded bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200 disabled:opacity-40"
        >
          Remove
        </button>
      </div>

      {#if selectedChain}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={chainNameDraft}
              on:input={updateSelectedChainName}
              class="flex-1 px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
              placeholder="Chain name"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              type="color"
              bind:value={chainColorDraft}
              on:input={updateSelectedChainColor}
              class="w-10 h-8 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
              title="Path chain color"
            />
            <span class="text-xs text-neutral-500 dark:text-neutral-400">Path color</span>
          </div>
        </div>
      {/if}
    </div>

    <PathGroupsSection
      bind:groups={pathGroups}
      onInsert={(gid) => insertGroupFromLibrary(gid, sequence.length)}
      onGroupDragStart={(id) => (draggedLibGroupId = id)}
      onGroupDragEnd={() => (draggedLibGroupId = null)}
      {recordChange}
    />

    <PresetsSection
      bind:positions={savedPositions}
      bind:headings={savedHeadings}
      onPresetDragStart={handlePresetDragStart}
      onPresetDragEnd={handlePresetDragEnd}
      onActivatePosition={appendPositionAsPath}
      onActivateHeading={applyHeadingToLastPath}
    />

    {#if selectedKeys.length > 0}
      <div
        class="w-full flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-xs shrink-0"
      >
        <span class="font-semibold text-blue-800 dark:text-blue-200"
          >{selCount} selected</span
        >
        <button
          type="button"
          on:click={groupSelected}
          disabled={selCount < 1 || selHasGrouped}
          class="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-40"
          title="Save the selected bubbles as a reusable group"
        >
          Group
        </button>
        <span class="text-blue-700/70 dark:text-blue-300/70 hidden sm:inline"
          >right-click for more · ⌘C/⌘D/⌘V</span
        >
        <button
          type="button"
          on:click={clearSelection}
          class="ml-auto px-2 py-1 rounded bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-700"
        >
          Clear
        </button>
      </div>
    {/if}

    <!-- Unified sequence render: draggable bubbles for paths and waits.
         Gap slots (fixed height, always present) sit between bubbles and
         are the only valid drop targets. Runs of items sharing a
         groupInstanceId render under a collapsible group header. -->
    {#each sequence as item, sIdx (seqKey(item))}
      {@const gid = gidOf(item)}
      {@const inst = gid ? groupInstById.get(gid) : null}
      {@const firstOfGroup = !!gid && gidOf(sequence[sIdx - 1]) !== gid}
      {@const hiddenMember = !!inst && inst.collapsed}

      {#if firstOfGroup && inst}
        {@const mCount = groupMemberIdxs(gid).length}
        <div
          class="w-full h-4 relative z-10 shrink-0"
          role="presentation"
          on:dragover={(e) => handleGapDragOver(sIdx, e)}
          on:dragleave={() => handleGapDragLeave(sIdx)}
          on:drop={(e) => handleGapDrop(sIdx, e, null)}
        >
          <div
            class="absolute inset-x-1 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none transition-colors duration-100 {dragOverGap ===
              sIdx && gapArmed
              ? 'bg-blue-400 dark:bg-blue-500'
              : 'bg-transparent'}"
          />
        </div>

        <div
          class="w-full transition-opacity duration-150"
          class:opacity-40={draggedGroupId === gid}
        >
          <div
            class="flex w-full items-center gap-2 px-2 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm"
            role="presentation"
            on:contextmenu={(e) => onGroupContextMenu(gid, e)}
          >
            <span
              draggable="true"
              on:dragstart={(e) => handleGroupDragStart(gid, e)}
              on:dragend={handleGroupDragEnd}
              title="Drag to move the whole group"
              role="button"
              tabindex="0"
              aria-label="Drag group"
              class="cursor-grab active:cursor-grabbing text-emerald-500 shrink-0 select-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
                <circle cx="6" cy="5" r="1.4" /><circle cx="14" cy="5" r="1.4" />
                <circle cx="6" cy="10" r="1.4" /><circle cx="14" cy="10" r="1.4" />
                <circle cx="6" cy="15" r="1.4" /><circle cx="14" cy="15" r="1.4" />
              </svg>
            </span>
            <button
              type="button"
              on:click={() => toggleGroupCollapsed(gid)}
              title="{inst.collapsed ? 'Expand' : 'Collapse'} group"
              class="shrink-0 text-emerald-700 dark:text-emerald-300"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                stroke="currentColor"
                class="size-4 transition-transform {inst.collapsed ? 'rotate-0' : 'rotate-90'}"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <span
              class="px-1.5 py-0.5 text-[11px] rounded bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 shrink-0"
              >Group</span
            >
            <input
              class="pl-1.5 min-w-0 flex-1 rounded-md bg-white dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold text-emerald-900 dark:text-emerald-100"
              value={inst.name}
              on:input={(e) => renameGroupInstanceLive(gid, e.currentTarget.value)}
              on:change={recordChange}
              placeholder="Group name"
            />
            <span class="text-[11px] text-emerald-700/70 dark:text-emerald-300/70 shrink-0"
              >{mCount} item{mCount === 1 ? "" : "s"}</span
            >
            <button
              type="button"
              title="Group actions"
              on:click={(e) => onGroupContextMenu(gid, e)}
              class="shrink-0 text-emerald-600 dark:text-emerald-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
                <circle cx="10" cy="4" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="10" cy="16" r="1.6" />
              </svg>
            </button>
          </div>
        </div>

        {#if !inst.collapsed}
          <div
            class="w-full h-4 relative z-10 shrink-0 pl-4"
            role="presentation"
            on:dragover={(e) => handleGapDragOver(sIdx, e)}
            on:dragleave={() => handleGapDragLeave(sIdx)}
            on:drop={(e) => handleGapDrop(sIdx, e, gid)}
          >
            <div
              class="absolute inset-x-1 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none transition-colors duration-100 {dragOverGap ===
                sIdx && gapArmed
                ? 'bg-emerald-400 dark:bg-emerald-500'
                : 'bg-transparent'}"
            />
          </div>
        {/if}
      {/if}

      {#if !hiddenMember}
        {#if !gid}
          <div
            class="w-full h-4 relative z-10 shrink-0"
            role="presentation"
            on:dragover={(e) => handleGapDragOver(sIdx, e)}
            on:dragleave={() => handleGapDragLeave(sIdx)}
            on:drop={(e) => handleGapDrop(sIdx, e, null)}
          >
            <div
              class="absolute inset-x-1 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none transition-colors duration-100 {dragOverGap ===
                sIdx && gapArmed
                ? 'bg-blue-400 dark:bg-blue-500'
                : 'bg-transparent'}"
            />
          </div>
        {:else if !firstOfGroup}
          <div
            class="w-full h-4 relative z-10 shrink-0 pl-4"
            role="presentation"
            on:dragover={(e) => handleGapDragOver(sIdx, e)}
            on:dragleave={() => handleGapDragLeave(sIdx)}
            on:drop={(e) => handleGapDrop(sIdx, e, gid)}
          >
            <div
              class="absolute inset-x-1 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none transition-colors duration-100 {dragOverGap ===
                sIdx && gapArmed
                ? 'bg-emerald-400 dark:bg-emerald-500'
                : 'bg-transparent'}"
            />
          </div>
        {/if}

        <div
          class="w-full transition-opacity duration-150 {gid
            ? 'pl-4 border-l-2 border-emerald-300 dark:border-emerald-700 ml-1'
            : ''}"
          class:opacity-40={draggedSeqIndex === sIdx}
          role="presentation"
          on:click={(e) => onBubbleClick(sIdx, e)}
          on:contextmenu={(e) => onBubbleContextMenu(sIdx, e)}
        >
          <div
            class={selectedKeySet.has(seqKey(item))
              ? "rounded-2xl ring-2 ring-blue-400 dark:ring-blue-500"
              : ""}
          >
            {#if item.kind === "path"}
              {#each lines.filter((l) => l.id === item.lineId) as ln (ln.id)}
                <PathLineSection
              bind:line={ln}
              idx={lines.findIndex((l) => l.id === ln.id)}
              bind:lines
              {startPoint}
              {savedPositions}
              {savedHeadings}
              bind:collapsed={
                collapsedSections.lines[lines.findIndex((l) => l.id === ln.id)]
              }
              bind:collapsedControlPoints={
                collapsedSections.controlPoints[
                  lines.findIndex((l) => l.id === ln.id)
                ]
              }
              onRemove={() =>
                removeLine(lines.findIndex((l) => l.id === ln.id))}
              onInsertAfter={() => addControlPointToLine(sIdx)}
              onInsertMidpoint={() => insertMidpointAfter(sIdx)}
              onAddWaitAfter={() => insertWaitAfter(sIdx)}
              onDragStart={(e) => handleBubbleDragStart(sIdx, e)}
              onDragEnd={handleBubbleDragEnd}
              draggingHeading={draggedPreset?.kind === "heading"}
              onHeadingDrop={() => {
                if (draggedPreset?.kind === "heading")
                  applyHeadingToLine(ln.id ?? "", draggedPreset.id);
              }}
              optimizeLine={optimizeLine}
              optimizing={optimizingLineIds?.[ln.id ?? ""] ?? false}
              chainOptions={chainOptions}
              selectedChainId={getLinePrimaryChainId(ln.id || "")}
              onChainChange={(chainId) => assignLineToChain(ln.id || "", chainId)}
              {recordChange}
            />
          {/each}
        {:else}
          <WaitRow
            name={getWait(item).name}
            durationMs={getWait(item).durationMs}
            locked={getWait(item).locked ?? false}
            onToggleLock={() => {
              const newSeq = [...sequence];
              newSeq[sIdx] = {
                ...getWait(item),
                locked: !(getWait(item).locked ?? false),
              };
              sequence = newSeq;
              recordChange?.();
            }}
            onChange={(newName, newDuration) => {
              const newSeq = [...sequence];
              newSeq[sIdx] = {
                ...getWait(item),
                name: newName,
                durationMs: Math.max(0, Number(newDuration) || 0),
              };
              sequence = newSeq;
            }}
            onRemove={() => {
              const newSeq = [...sequence];
              newSeq.splice(sIdx, 1);
              sequence = newSeq;
            }}
            onInsertAfter={() => {
              const newSeq = [...sequence];
              newSeq.splice(sIdx + 1, 0, {
                kind: "wait",
                id: makeId(),
                name: "Wait",
                durationMs: 0,
                locked: false,
              });
              sequence = newSeq;
            }}
            onAddPathAfter={() => insertPathAfter(sIdx)}
            onDragStart={(e) => handleBubbleDragStart(sIdx, e)}
            onDragEnd={handleBubbleDragEnd}
          />
            {/if}
          </div>
        </div>
      {/if}
    {/each}

    <!-- Trailing gap slot: dropping here places the bubble at the very end -->
    <div
      class="w-full h-4 relative z-10 shrink-0"
      role="presentation"
      on:dragover={(e) => handleGapDragOver(sequence.length, e)}
      on:dragleave={() => handleGapDragLeave(sequence.length)}
      on:drop={(e) => handleGapDrop(sequence.length, e, null)}
    >
      <div
        class="absolute inset-x-1 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none transition-colors duration-100 {dragOverGap ===
          sequence.length && gapArmed
          ? 'bg-blue-400 dark:bg-blue-500'
          : 'bg-transparent'}"
      />
    </div>

    {#if ctxMenu}
      <TimelineContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        entries={ctxMenu.entries}
        onClose={() => (ctxMenu = null)}
      />
    {/if}

    <!-- Add Line Button -->
    <div class="flex flex-row items-center gap-4">
      <button
        on:click={addLine}
        class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
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
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p>Add Path</p>
      </button>

      <button
        on:click={addCurve}
        class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
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
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p>Add Curve</p>
      </button>
      

      <button
        on:click={addWait}
        class="font-semibold text-[#E1461B] text-sm flex flex-row justify-start items-center gap-1"
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
        <p>Add Wait</p>
      </button>
    </div>
  </div>

  <PlaybackControls
    bind:playing
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
    {markers}
    totalTime={timePrediction?.totalTime ?? 0}
  />
</div>
