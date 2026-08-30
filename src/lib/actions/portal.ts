/**
 * Moves the node this action is attached to onto document.body, so it
 * escapes clipping from any ancestor with overflow:hidden/auto (e.g. the
 * scrollable control panel, or a rounded-corner card that clips its
 * content). Used for popovers/dropdowns that must render above everything
 * regardless of where they're triggered from in the DOM.
 *
 * Position it yourself (position: fixed + inline top/left computed from the
 * trigger element's getBoundingClientRect()) since it no longer has a
 * positioned ancestor to anchor to via `absolute`.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);

  return {
    destroy() {
      if (node.parentNode === document.body) {
        document.body.removeChild(node);
      }
    },
  };
}
