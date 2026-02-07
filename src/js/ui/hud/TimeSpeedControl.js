/**
 * Time/Speed Control HUD Panel
 * Compact time display and speed presets - top-left position
 */

import { julianDate, speedPresets, setSpeed } from '../../core/gameState.js';
import { julianToDate } from '../../lib/orbital.js';

export class TimeSpeedControl {
  constructor() {
    this.container = document.getElementById('hudTimeSpeed');
    if (!this.container) {
      console.error('Time/speed container not found');
      return;
    }

    this.createPanel();
    this.attachEvents();
  }

  createPanel() {
    this.container.innerHTML = `
      <div class="time-display">
        <div class="time-label">DATE</div>
        <div class="time-value" id="hudDateValue">2020-01-01</div>
      </div>
      <div class="speed-presets">
        <div class="speed-label">SPEED</div>
        <div class="speed-grid" id="speedGrid">
          <button class="speed-btn" data-speed="pause">⏸</button>
          <button class="speed-btn active" data-speed="1x">1x</button>
          <button class="speed-btn" data-speed="100x">100x</button>
          <button class="speed-btn" data-speed="10000x">10K</button>
          <button class="speed-btn" data-speed="100000x">100K</button>
          <button class="speed-btn" data-speed="1000000x">1M</button>
        </div>
        <div class="speed-indicator" id="speedIndicator">1x</div>
      </div>
    `;

    this.dateValue = this.container.querySelector('#hudDateValue');
    this.speedIndicator = this.container.querySelector('#speedIndicator');
    this.speedButtons = this.container.querySelectorAll('.speed-btn');
  }

  attachEvents() {
    this.speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const speedKey = btn.dataset.speed;

        // Use setSpeed which accepts preset names like 'pause', '1x', '100x', etc.
        setSpeed(speedKey);

        this.updateSpeedIndicator(speedKey);
      });
    });
  }

  updateSpeedIndicator(activeSpeed) {
    this.speedButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === activeSpeed);
    });

    if (activeSpeed === 'pause') {
      this.speedIndicator.textContent = 'PAUSED';
    } else {
      this.speedIndicator.textContent = activeSpeed.toUpperCase();
    }
  }

  update() {
    // Update date display
    const date = julianToDate(julianDate);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.dateValue.textContent = dateStr;
  }

  destroy() {
    // Cleanup if needed
  }
}

let timeSpeedInstance = null;

export function initTimeSpeedControl() {
  if (timeSpeedInstance) {
    timeSpeedInstance.destroy();
  }
  timeSpeedInstance = new TimeSpeedControl();
  return timeSpeedInstance;
}

export function updateTimeSpeedControl() {
  if (timeSpeedInstance) {
    timeSpeedInstance.update();
  }
}
