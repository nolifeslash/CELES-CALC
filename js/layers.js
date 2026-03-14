/**
 * @module layers
 * @description Manages layer visibility toggles for the 4-view engineering
 * visualizer. Supports shared toggles with optional per-pane overrides.
 * No DOM access — pure state logic.
 */

/**
 * Default visibility for every recognised layer.
 * @readonly
 * @type {Object<string, boolean>}
 */
export const DEFAULT_LAYERS = Object.freeze({
  grid: true,
  labels: true,
  orbits: true,
  sightlines: true,
  illumination: true,
  zones: false,
  measurements: true,
  observers: true,
  targets: true,
  trackedObjects: true,
  groundStations: true,
  rfLinks: true,
  launchSites: true,
  earthBody: true,
  moonBody: true,
  transferArcs: true,
  vectorArrows: true,
  terminatorLine: true,
  horizonBoundary: true,
  annotations: true,
  infraLaunchSites: true,
  infraGroundStations: true,
  infraTTCStations: true,
});

/** @typedef {'top'|'sideA'|'sideB'|'3d'} PaneId */

/**
 * @typedef {Object} LayerState
 * @property {Object<string, boolean>} shared        Shared layer visibility.
 * @property {Object<PaneId, Object<string, boolean>>} paneOverrides
 *   Per-pane visibility overrides.
 * @property {Array<function>} listeners  Registered change callbacks.
 */

/**
 * Creates a new layer state by merging an optional initial object with
 * {@link DEFAULT_LAYERS}.
 *
 * @param {Object<string, boolean>} [initial={}] Optional initial overrides.
 * @returns {LayerState} A fresh layer state.
 */
export function createLayerState(initial = {}) {
  return {
    shared: { ...DEFAULT_LAYERS, ...initial },
    paneOverrides: { top: {}, sideA: {}, sideB: {}, '3d': {} },
    listeners: []
  };
}

/**
 * Notifies all registered listeners of a layer change.
 *
 * @param {LayerState} state   The layer state.
 * @param {string}     layerId The layer that changed.
 * @param {PaneId}     [paneId] If the change is pane-specific.
 * @private
 */
function _notify(state, layerId, paneId) {
  for (const cb of state.listeners) {
    cb({ layerId, paneId });
  }
}

/**
 * Toggles a shared layer and notifies listeners.
 *
 * @param {LayerState} state   The layer state to mutate.
 * @param {string}     layerId Layer identifier (key of {@link DEFAULT_LAYERS}).
 * @param {boolean}    visible Whether the layer should be visible.
 */
export function setLayer(state, layerId, visible) {
  state.shared[layerId] = visible;
  _notify(state, layerId);
}

/**
 * Sets a per-pane visibility override for a layer.
 *
 * @param {LayerState} state   The layer state to mutate.
 * @param {PaneId}     paneId  Target pane.
 * @param {string}     layerId Layer identifier.
 * @param {boolean}    visible Whether the layer should be visible in this pane.
 */
export function setPaneOverride(state, paneId, layerId, visible) {
  state.paneOverrides[paneId][layerId] = visible;
  _notify(state, layerId, paneId);
}

/**
 * Removes a per-pane override so the layer falls back to its shared value.
 *
 * @param {LayerState} state   The layer state to mutate.
 * @param {PaneId}     paneId  Target pane.
 * @param {string}     layerId Layer identifier.
 */
export function clearPaneOverride(state, paneId, layerId) {
  delete state.paneOverrides[paneId][layerId];
  _notify(state, layerId, paneId);
}

/**
 * Resolves the effective visibility of a layer. A pane override takes
 * precedence; otherwise the shared value is returned.
 *
 * @param {LayerState} state   The layer state.
 * @param {string}     layerId Layer identifier.
 * @param {PaneId}     [paneId] Optional pane — when omitted the shared value
 *   is returned.
 * @returns {boolean} Whether the layer is visible.
 */
export function isLayerVisible(state, layerId, paneId) {
  if (paneId !== undefined && state.paneOverrides[paneId] &&
      layerId in state.paneOverrides[paneId]) {
    return state.paneOverrides[paneId][layerId];
  }
  return !!state.shared[layerId];
}

/**
 * Registers a listener that is called whenever layer visibility changes.
 *
 * @param {LayerState} state    The layer state.
 * @param {function}   callback Invoked with `{ layerId, paneId? }`.
 * @returns {{ unsubscribe: function }} Handle to remove the listener.
 */
export function onLayerChange(state, callback) {
  state.listeners.push(callback);
  return {
    unsubscribe() {
      const idx = state.listeners.indexOf(callback);
      if (idx !== -1) {
        state.listeners.splice(idx, 1);
      }
    }
  };
}

/**
 * Serializes the layer state into a plain object suitable for JSON storage.
 *
 * @param {LayerState} state The layer state to serialize.
 * @returns {{ shared: Object<string, boolean>, paneOverrides: Object<PaneId, Object<string, boolean>> }}
 */
export function layerStateToObject(state) {
  return {
    shared: { ...state.shared },
    paneOverrides: {
      top: { ...state.paneOverrides.top },
      sideA: { ...state.paneOverrides.sideA },
      sideB: { ...state.paneOverrides.sideB },
      '3d': { ...state.paneOverrides['3d'] }
    }
  };
}

/**
 * Restores a {@link LayerState} from a previously serialized object
 * (produced by {@link layerStateToObject}).
 *
 * @param {{ shared?: Object<string, boolean>, paneOverrides?: Object<PaneId, Object<string, boolean>> }} obj
 *   The serialized layer data.
 * @returns {LayerState} A fully hydrated layer state.
 */
export function loadLayerState(obj) {
  const shared = { ...DEFAULT_LAYERS, ...(obj.shared || {}) };
  const paneOverrides = {
    top: { ...(obj.paneOverrides?.top || {}) },
    sideA: { ...(obj.paneOverrides?.sideA || {}) },
    sideB: { ...(obj.paneOverrides?.sideB || {}) },
    '3d': { ...(obj.paneOverrides?.['3d'] || {}) }
  };
  return { shared, paneOverrides, listeners: [] };
}
