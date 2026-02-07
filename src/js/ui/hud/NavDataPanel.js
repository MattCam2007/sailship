/**
 * Navigation Data Panel
 * Target info, distance, intercept time, delta-v - bottom-right position
 */

import { AnimatedValue, animationLoop } from '../../lib/animation.js';
import { navState } from '../../core/navigation.js';
import { getPlayerShip } from '../../data/ships.js';

export class NavDataPanel {
  constructor() {
    this.container = document.getElementById('hudNavData');
    if (!this.container) {
      console.error('Nav data container not found');
      return;
    }

    this.animatedDistance = new AnimatedValue(0, 300);
    this.animatedDeltaV = new AnimatedValue(0, 300);

    this.createPanel();
    this.setupAnimationLoop();
  }

  createPanel() {
    this.container.innerHTML = `
      <div class="nav-target">
        <div class="target-label">TARGET</div>
        <div class="target-name" id="targetName">NONE</div>
      </div>
      <div class="nav-data-grid">
        <div class="nav-data-row">
          <span class="data-label">DISTANCE</span>
          <span class="data-value" id="distanceValue">-- AU</span>
        </div>
        <div class="nav-data-row">
          <span class="data-label">INTERCEPT</span>
          <span class="data-value" id="interceptValue">--</span>
        </div>
        <div class="nav-data-row">
          <span class="data-label">DELTA-V</span>
          <span class="data-value" id="deltaVValue">
            <span class="dv-bar-container">
              <span class="dv-bar-fill" id="dvBarFill" style="width: 100%"></span>
            </span>
            5.0 km/s
          </span>
        </div>
      </div>
    `;

    this.targetName = this.container.querySelector('#targetName');
    this.distanceValue = this.container.querySelector('#distanceValue');
    this.interceptValue = this.container.querySelector('#interceptValue');
    this.deltaVValue = this.container.querySelector('#deltaVValue');
    this.dvBarFill = this.container.querySelector('#dvBarFill');
  }

  setupAnimationLoop() {
    this.unregister = animationLoop.register((deltaTime) => {
      this.update();
    });
  }

  update() {
    // Update target name
    const target = navState.destination;
    if (target) {
      this.targetName.textContent = target.name.toUpperCase();
    } else {
      this.targetName.textContent = 'NONE';
    }

    // Update distance (with animation)
    const distance = navState.distanceToDestination || 0;
    this.animatedDistance.setTarget(distance);
    this.animatedDistance.update();
    const displayDistance = this.animatedDistance.getValue();
    this.distanceValue.textContent = `${displayDistance.toFixed(3)} AU`;

    // Update intercept time
    const interceptDays = navState.timeToIntercept;
    if (interceptDays !== null && interceptDays !== Infinity) {
      const days = Math.floor(interceptDays);
      const hours = Math.floor((interceptDays - days) * 24);
      this.interceptValue.textContent = `${days}d ${hours}h`;
    } else {
      this.interceptValue.textContent = '--';
    }

    // Update delta-v with fuel bar
    const ship = getPlayerShip();
    const deltaV = ship.thrusterDeltaV || 5.0;
    const maxDeltaV = 10.0; // Max possible

    this.animatedDeltaV.setTarget(deltaV);
    this.animatedDeltaV.update();
    const displayDeltaV = this.animatedDeltaV.getValue();

    const percent = (displayDeltaV / maxDeltaV) * 100;
    this.dvBarFill.style.width = `${percent}%`;

    // Color based on remaining fuel
    if (percent > 60) {
      this.dvBarFill.style.background = 'var(--success)';
    } else if (percent > 30) {
      this.dvBarFill.style.background = 'var(--warning)';
    } else {
      this.dvBarFill.style.background = 'var(--danger)';
    }

    // Update text
    const dvText = this.deltaVValue.querySelector('span:last-child') || this.deltaVValue;
    if (dvText.tagName !== 'SPAN') {
      this.deltaVValue.innerHTML = `
        <span class="dv-bar-container">
          <span class="dv-bar-fill" id="dvBarFill" style="width: ${percent}%"></span>
        </span>
        ${displayDeltaV.toFixed(1)} km/s
      `;
      this.dvBarFill = this.container.querySelector('#dvBarFill');
    } else {
      dvText.textContent = `${displayDeltaV.toFixed(1)} km/s`;
    }
  }

  destroy() {
    if (this.unregister) {
      this.unregister();
    }
  }
}

let navDataInstance = null;

export function initNavDataPanel() {
  if (navDataInstance) {
    navDataInstance.destroy();
  }
  navDataInstance = new NavDataPanel();
}
