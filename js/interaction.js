/**
 * @file interaction.js
 * @module interaction
 * @description Shared selection and hover state for the 4-view engineering
 * visualizer in CELES-CALC.
 *
 * This module is the "model" for interaction — the renderers read from it,
 * the UI writes to it.  It manages which celestial object is currently
 * selected or hovered and notifies registered listeners when that changes.
 *
 * This is a pure state module — no DOM access.
 */

// ─── createInteractionState ───────────────────────────────────────────────────

/**
 * Create a fresh interaction state object.
 *
 * @returns {InteractionState} New interaction state.
 * @property {string|null}   selectedId - ID of the currently selected object.
 * @property {string|null}   hoveredId  - ID of the currently hovered object.
 * @property {Function[]}    listeners  - Registered change callbacks.
 */
export function createInteractionState() {
  return {
    selectedId: null,
    hoveredId:  null,
    listeners:  [],
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Notify every registered listener of the current state.
 *
 * @param {InteractionState} state - The interaction state to broadcast.
 */
function _notifyListeners(state) {
  for (const cb of state.listeners) {
    cb(state);
  }
}

// ─── selectObject ─────────────────────────────────────────────────────────────

/**
 * Set the selected object and notify listeners.
 *
 * @param {InteractionState} state    - Interaction state to mutate.
 * @param {string|null}      objectId - ID of the object to select, or null.
 */
export function selectObject(state, objectId) {
  state.selectedId = objectId;
  _notifyListeners(state);
}

// ─── hoverObject ──────────────────────────────────────────────────────────────

/**
 * Set the hovered object and notify listeners.
 *
 * @param {InteractionState} state    - Interaction state to mutate.
 * @param {string|null}      objectId - ID of the object to hover, or null.
 */
export function hoverObject(state, objectId) {
  state.hoveredId = objectId;
  _notifyListeners(state);
}

// ─── clearSelection ───────────────────────────────────────────────────────────

/**
 * Clear both the selected and hovered object, then notify listeners.
 *
 * @param {InteractionState} state - Interaction state to mutate.
 */
export function clearSelection(state) {
  state.selectedId = null;
  state.hoveredId  = null;
  _notifyListeners(state);
}

// ─── onInteractionChange ──────────────────────────────────────────────────────

/**
 * Register a callback that fires whenever the selection or hover state changes.
 *
 * @param {InteractionState} state    - Interaction state to observe.
 * @param {Function}         callback - Called with the interaction state on change.
 * @returns {{ unsubscribe: Function }} Handle to remove the listener.
 */
export function onInteractionChange(state, callback) {
  state.listeners.push(callback);

  return {
    unsubscribe() {
      const idx = state.listeners.indexOf(callback);
      if (idx !== -1) {
        state.listeners.splice(idx, 1);
      }
    },
  };
}

// ─── hitTest ──────────────────────────────────────────────────────────────────

/**
 * Find the closest object within a pixel-distance threshold.
 *
 * Each entry in `objects` must expose at least `{ id, px, py }` where
 * `px` and `py` are the object's position in canvas/pixel coordinates.
 *
 * @param {Array<{id: string, px: number, py: number}>} objects   - Candidate objects.
 * @param {number} px        - Test point x in pixels.
 * @param {number} py        - Test point y in pixels.
 * @param {number} threshold - Maximum distance in pixels to count as a hit.
 * @returns {string|null} ID of the closest object within threshold, or null.
 */
export function hitTest(objects, px, py, threshold) {
  let closestId   = null;
  let closestDist = threshold;

  for (const obj of objects) {
    const dx   = obj.px - px;
    const dy   = obj.py - py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < closestDist) {
      closestDist = dist;
      closestId   = obj.id;
    }
  }

  return closestId;
}
