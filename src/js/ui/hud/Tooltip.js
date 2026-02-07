/**
 * Tooltip System
 * Shows contextual help on hover
 */

import { hudState } from '../../core/hudState.js';

export class Tooltip {
  constructor() {
    this.element = document.getElementById('hudTooltip');
    if (!this.element) {
      console.error('Tooltip container not found');
      return;
    }

    this.hideTimeout = null;
    this.updateLoop();
  }

  updateLoop() {
    requestAnimationFrame(() => {
      this.update();
      this.updateLoop();
    });
  }

  update() {
    const { visible, content, x, y } = hudState.tooltip;

    if (visible && content) {
      this.element.innerHTML = content;
      this.element.classList.add('visible');

      // Position tooltip intelligently
      const rect = this.element.getBoundingClientRect();

      // Center horizontally on cursor
      let left = x - rect.width / 2;
      // Position above cursor
      let top = y - rect.height - 12;

      // Keep within viewport
      const margin = 10;
      left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
      top = Math.max(margin, top);

      this.element.style.left = `${left}px`;
      this.element.style.top = `${top}px`;
    } else {
      this.element.classList.remove('visible');
    }
  }

  destroy() {
    // Cleanup
  }
}

let tooltipInstance = null;

export function initTooltip() {
  if (tooltipInstance) {
    tooltipInstance.destroy();
  }
  tooltipInstance = new Tooltip();
}
