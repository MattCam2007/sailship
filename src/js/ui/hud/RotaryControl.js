/**
 * Rotary Control Component
 * Screen-native circular dial for angle input
 */

import { AnimatedValue } from '../../lib/animation.js';

export class RotaryControl {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent element
   * @param {string} options.label - Control label
   * @param {number} options.min - Minimum angle (degrees)
   * @param {number} options.max - Maximum angle (degrees)
   * @param {number} options.value - Initial value (degrees)
   * @param {number} options.size - Diameter in pixels (default: 70)
   * @param {Function} options.onChange - Callback when value changes
   */
  constructor(options) {
    this.options = {
      size: 70,
      ...options,
    };

    this.animatedValue = new AnimatedValue(options.value, 150);
    this.isDragging = false;
    this.dragStartAngle = 0;
    this.dragStartValue = 0;

    this.createElement();
    this.attachEvents();
  }

  createElement() {
    const { label, size, value } = this.options;

    this.element = document.createElement('div');
    this.element.className = 'rotary-control';
    this.element.innerHTML = `
      <div class="rotary-label">${label}</div>
      <div class="rotary-dial" style="width: ${size}px; height: ${size}px">
        <svg class="rotary-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" class="rotary-track" />
          <circle cx="50" cy="50" r="45" class="rotary-progress" />
        </svg>
        <div class="rotary-indicator"></div>
        <div class="rotary-value">${value.toFixed(1)}°</div>
      </div>
    `;

    this.dial = this.element.querySelector('.rotary-dial');
    this.indicator = this.element.querySelector('.rotary-indicator');
    this.valueDisplay = this.element.querySelector('.rotary-value');
    this.progress = this.element.querySelector('.rotary-progress');

    this.options.container.appendChild(this.element);
    this.updateVisuals();
  }

  attachEvents() {
    this.dial.addEventListener('mousedown', this.handleStart.bind(this));
    this.dial.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });

    document.addEventListener('mousemove', this.handleMove.bind(this));
    document.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
    document.addEventListener('mouseup', this.handleEnd.bind(this));
    document.addEventListener('touchend', this.handleEnd.bind(this));
  }

  handleStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.element.classList.add('dragging');

    const rect = this.dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    this.dragStartAngle = this.getAngleFromPoint(clientX, clientY, centerX, centerY);
    this.dragStartValue = this.animatedValue.getValue();
  }

  handleMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();

    const rect = this.dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const currentAngle = this.getAngleFromPoint(clientX, clientY, centerX, centerY);
    const angleDelta = currentAngle - this.dragStartAngle;

    const newValue = this.dragStartValue + angleDelta;
    this.setValue(newValue, false);
  }

  handleEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove('dragging');
  }

  getAngleFromPoint(x, y, centerX, centerY) {
    const dx = x - centerX;
    const dy = y - centerY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    // Convert to 0-360 range
    if (angle < 0) angle += 360;
    // Convert to -180 to 180 range
    if (angle > 180) angle -= 360;
    return angle;
  }

  setValue(value, animate = true) {
    const { min, max, onChange } = this.options;
    const clamped = Math.max(min, Math.min(max, value));

    if (animate) {
      this.animatedValue.setTarget(clamped);
    } else {
      this.animatedValue.setTarget(clamped);
      this.animatedValue.snap();
    }

    this.updateVisuals();

    if (onChange) {
      onChange(clamped);
    }
  }

  updateVisuals() {
    const { min, max } = this.options;
    const value = this.animatedValue.getValue();

    // Rotate indicator line (0° = right, positive = clockwise)
    this.indicator.style.transform = `rotate(${value}deg)`;

    // Update progress circle (arc length)
    const fraction = (value - min) / (max - min);
    const circumference = 2 * Math.PI * 45;
    const dashOffset = circumference * (1 - fraction);
    this.progress.style.strokeDasharray = `${circumference}`;
    this.progress.style.strokeDashoffset = `${dashOffset}`;

    // Update value display
    this.valueDisplay.textContent = `${value.toFixed(1)}°`;
  }

  getValue() {
    return this.animatedValue.getValue();
  }

  destroy() {
    this.element.remove();
  }
}
