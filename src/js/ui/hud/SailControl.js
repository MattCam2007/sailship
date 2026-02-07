/**
 * Sail Control HUD Panel
 * Premium sail trimming interface - top-right position
 */

import { VerticalSlider } from './VerticalSlider.js';
import { RotaryControl } from './RotaryControl.js';
import { AnimatedValue, animationLoop } from '../../lib/animation.js';
import { getPlayerShip } from '../../data/ships.js';

export class SailControl {
  constructor() {
    this.container = document.getElementById('hudSailControl');
    if (!this.container) {
      console.error('Sail control container not found');
      return;
    }

    this.thrustArrowRotation = new AnimatedValue(0, 200);
    this.thrustArrowLength = new AnimatedValue(0, 200);

    this.createControls();
    this.setupAnimationLoop();
  }

  createControls() {
    // Clear container
    this.container.innerHTML = '';

    // Create controls container
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'sail-controls-grid';
    this.container.appendChild(controlsDiv);

    const ship = getPlayerShip();

    // Deployment slider (vertical, prominent)
    this.deploymentSlider = new VerticalSlider({
      container: controlsDiv,
      label: 'DEPLOY',
      min: 0,
      max: 100,
      value: ship.sailDeployment * 100,
      unit: '%',
      height: 120,
      onChange: (value) => {
        ship.sailDeployment = value / 100;
      },
    });

    // Yaw rotary control
    this.yawControl = new RotaryControl({
      container: controlsDiv,
      label: 'YAW',
      min: -90,
      max: 90,
      value: ship.sailAngle,
      size: 70,
      onChange: (value) => {
        ship.sailAngle = value;
      },
    });

    // Pitch rotary control
    this.pitchControl = new RotaryControl({
      container: controlsDiv,
      label: 'PITCH',
      min: -90,
      max: 90,
      value: ship.sailPitch,
      size: 70,
      onChange: (value) => {
        ship.sailPitch = value;
      },
    });

    // Thrust visualization
    const thrustViz = document.createElement('div');
    thrustViz.className = 'thrust-visualization';
    thrustViz.innerHTML = `
      <div class="thrust-label">THRUST VECTOR</div>
      <div class="thrust-display">
        <svg class="thrust-arrow" viewBox="0 0 100 100">
          <line x1="50" y1="50" x2="50" y2="20" class="thrust-line" />
          <polygon points="50,15 55,25 45,25" class="thrust-head" />
        </svg>
      </div>
      <div class="thrust-magnitude">
        <span class="data-label">ACCEL</span>
        <span class="data-value highlight" id="thrustValue">0.00 mm/s²</span>
      </div>
    `;
    this.container.appendChild(thrustViz);

    this.thrustArrow = thrustViz.querySelector('.thrust-arrow');
    this.thrustValue = thrustViz.querySelector('#thrustValue');
  }

  setupAnimationLoop() {
    this.unregister = animationLoop.register((deltaTime) => {
      // Update slider/rotary visuals
      this.deploymentSlider.animatedValue.update();
      this.deploymentSlider.updateVisuals();

      this.yawControl.animatedValue.update();
      this.yawControl.updateVisuals();

      this.pitchControl.animatedValue.update();
      this.pitchControl.updateVisuals();

      // Update thrust visualization
      this.updateThrustVisualization();
    });
  }

  updateThrustVisualization() {
    const ship = getPlayerShip();

    // Calculate thrust direction from yaw/pitch
    // Simplified: use yaw as rotation angle
    const targetRotation = ship.sailAngle;
    this.thrustArrowRotation.setTarget(targetRotation);
    this.thrustArrowRotation.update();

    // Calculate thrust magnitude
    const thrust = ship.sailDeployment * Math.cos(ship.sailAngle * Math.PI / 180);
    const targetLength = Math.abs(thrust) * 30; // Scale for visualization
    this.thrustArrowLength.setTarget(targetLength);
    this.thrustArrowLength.update();

    // Apply rotation to arrow
    const rotation = this.thrustArrowRotation.getValue();
    this.thrustArrow.style.transform = `rotate(${rotation}deg)`;

    // Update thrust value display
    // Get actual thrust from ship physics (if available)
    const thrustAccel = 0.5; // Placeholder - get from shipPhysics
    this.thrustValue.textContent = `${thrustAccel.toFixed(2)} mm/s²`;

    // Color based on efficiency
    const efficiency = Math.abs(Math.cos(ship.sailAngle * Math.PI / 180));
    if (efficiency > 0.8) {
      this.thrustValue.className = 'data-value highlight';
    } else if (efficiency > 0.5) {
      this.thrustValue.className = 'data-value warning';
    } else {
      this.thrustValue.className = 'data-value danger';
    }
  }

  destroy() {
    if (this.unregister) {
      this.unregister();
    }
    this.deploymentSlider.destroy();
    this.yawControl.destroy();
    this.pitchControl.destroy();
  }
}

let sailControlInstance = null;

export function initSailControl() {
  if (sailControlInstance) {
    sailControlInstance.destroy();
  }
  sailControlInstance = new SailControl();
}
