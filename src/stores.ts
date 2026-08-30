import { writable } from "svelte/store";

function createDarkModeStore() {
	const { set, subscribe, update } = writable<"light" | "dark">("dark");

	return {
		set,
		subscribe,
		toggle: () => {
			update((_) => (_ === "dark" ? "light" : "dark"));
		},
	};
}

export const darkMode = createDarkModeStore();

// Math tools stores
export const showRuler = writable(false);
export const showProtractor = writable(false);
export const showGrid = writable(false);
export const protractorLockToRobot = writable(true);
export const gridSize = writable(12);
export const currentFilePath = writable<string | null>(null);
export const isUnsaved = writable(false);
export const snapToGrid = writable(true);

// While a heading protractor popup is open, this holds the field point (in
// inches) and the live heading (degrees) it is previewing, so the main robot
// on the field jumps there. Cleared when the popup closes -> robot snaps back.
export const headingPreview = writable<
  { x: number; y: number; heading: number } | null
>(null);

// Timeline clipboard: a copied path bubble or a copied path group.
// Session-only (not persisted). Shape:
//   { kind: "path", line: Line }
//   { kind: "group", group: { name: string; items: any[] } }
export const pathClipboard = writable<any | null>(null);

// Multiple paths visualization stores
export const activePaths = writable<string[]>([]);
export const dualPathMode = writable(false); // Deprecated - kept for backwards compatibility
export const secondFilePath = writable<string | null>(null); // Deprecated - kept for backwards compatibility
