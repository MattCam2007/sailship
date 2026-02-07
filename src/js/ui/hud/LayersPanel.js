/**
 * Display Layers Panel
 * Icon grid for visibility toggles - bottom-left position
 */

import { displayOptions } from '../../core/gameState.js';
import { setLayerOverride, getLayerVisibility, hudState } from '../../core/hudState.js';
import { showTooltip, hideTooltip } from '../../core/hudState.js';

const LAYERS = [
  { id: 'starfield', icon: '✦', label: 'Star Map', key: 'showStarfield' },
  { id: 'orbits', icon: '○', label: 'Orbital Paths', key: 'showOrbits' },
  { id: 'labels', icon: 'T', label: 'Labels', key: 'showLabels' },
  { id: 'trajectory', icon: '⟶', label: 'Flight Path', key: 'showTrajectory' },
  { id: 'predictedPath', icon: '◈', label: 'Predicted Path', key: 'showPredictedTrajectory' },
  { id: 'encounterMarkers', icon: '⊕', label: 'Encounter Markers', key: 'showIntersectionMarkers' },
  { id: 'grid', icon: '▦', label: 'Grid', key: 'showGrid' },
];

export class LayersPanel {
  constructor() {
    this.container = document.getElementById('hudLayers');
    if (!this.container) {
      console.error('Layers panel container not found');
      return;
    }

    this.createPanel();
    this.attachEvents();
  }

  createPanel() {
    const isCollapsed = localStorage.getItem('hud-layers-collapsed') === 'true';

    this.container.innerHTML = `
      <div class="hud-panel-header">
        <span class="hud-panel-title">LAYERS</span>
        <button class="hud-panel-collapse-btn" title="Collapse/Expand">▼</button>
      </div>
      <div class="hud-panel-content">
        <div class="layers-grid" id="layersGrid"></div>
      </div>
    `;

    if (isCollapsed) {
      this.container.classList.add('collapsed');
    }

    // Add collapse handler
    const header = this.container.querySelector('.hud-panel-header');
    header.addEventListener('click', () => {
      this.container.classList.toggle('collapsed');
      localStorage.setItem('hud-layers-collapsed', this.container.classList.contains('collapsed'));
    });

    this.grid = this.container.querySelector('#layersGrid');

    LAYERS.forEach(layer => {
      const btn = document.createElement('button');
      btn.className = 'layer-toggle';
      btn.dataset.layer = layer.id;
      btn.innerHTML = `<span class="layer-icon">${layer.icon}</span>`;
      btn.title = `${layer.label} (${this.getHotkey(layer.id)})`;

      // Set initial state
      const isActive = displayOptions[layer.key];
      if (isActive) {
        btn.classList.add('active');
      }

      this.grid.appendChild(btn);
    });

    this.buttons = this.grid.querySelectorAll('.layer-toggle');
  }

  attachEvents() {
    this.buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const layerId = btn.dataset.layer;
        this.toggleLayer(layerId, btn);
      });

      // Tooltip on hover
      btn.addEventListener('mouseenter', (e) => {
        const layerId = btn.dataset.layer;
        const layer = LAYERS.find(l => l.id === layerId);
        if (layer) {
          const rect = btn.getBoundingClientRect();
          showTooltip(
            `${layer.label} <span class="shortcut">${this.getHotkey(layerId)}</span>`,
            rect.left + rect.width / 2,
            rect.top - 8
          );
        }
      });

      btn.addEventListener('mouseleave', () => {
        hideTooltip();
      });
    });
  }

  toggleLayer(layerId, btn) {
    const layer = LAYERS.find(l => l.id === layerId);
    if (!layer) return;

    // Toggle in displayOptions
    displayOptions[layer.key] = !displayOptions[layer.key];

    // Update button state
    btn.classList.toggle('active', displayOptions[layer.key]);

    // Set override in hudState (force current state)
    setLayerOverride(layerId, displayOptions[layer.key]);
  }

  getHotkey(layerId) {
    // Placeholder - actual hotkeys would be defined elsewhere
    const hotkeys = {
      starfield: 'S',
      orbits: 'O',
      labels: 'L',
      trajectory: 'F',
      predictedPath: 'P',
      encounterMarkers: 'E',
      grid: 'G',
    };
    return hotkeys[layerId] || '?';
  }

  destroy() {
    // Cleanup
  }
}

let layersPanelInstance = null;

export function initLayersPanel() {
  if (layersPanelInstance) {
    layersPanelInstance.destroy();
  }
  layersPanelInstance = new LayersPanel();
}
