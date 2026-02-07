/**
 * HUD State Management
 * UI-specific state separate from game logic
 */

// HUD visibility and panel states
export const hudState = {
  // Feature flag for new HUD
  enabled: true,

  // Display layer overrides (null = auto, true = force show, false = force hide)
  layerOverrides: {
    orbits: null,
    labels: null,
    grid: null,
    starfield: null,
    trajectory: null,
    predictedPath: null,
    encounterMarkers: null,
  },

  // Panel collapse states
  panelStates: {
    timeSpeed: true,
    sailControl: true,
    layers: true,
    navData: true,
  },

  // Tooltip state
  tooltip: {
    visible: false,
    content: '',
    x: 0,
    y: 0,
  },
};

/**
 * Set layer override (null = auto, true = force, false = hide)
 */
export function setLayerOverride(layer, state) {
  if (!(layer in hudState.layerOverrides)) {
    console.warn(`Unknown layer: ${layer}`);
    return;
  }
  hudState.layerOverrides[layer] = state;
}

/**
 * Get effective layer visibility (considering overrides and auto rules)
 */
export function getLayerVisibility(layer, autoValue) {
  const override = hudState.layerOverrides[layer];
  return override === null ? autoValue : override;
}

/**
 * Toggle panel collapsed state
 */
export function togglePanel(panelName) {
  if (!(panelName in hudState.panelStates)) {
    console.warn(`Unknown panel: ${panelName}`);
    return;
  }
  hudState.panelStates[panelName] = !hudState.panelStates[panelName];
}

/**
 * Show tooltip at position
 */
export function showTooltip(content, x, y) {
  hudState.tooltip.visible = true;
  hudState.tooltip.content = content;
  hudState.tooltip.x = x;
  hudState.tooltip.y = y;
}

/**
 * Hide tooltip
 */
export function hideTooltip() {
  hudState.tooltip.visible = false;
}
