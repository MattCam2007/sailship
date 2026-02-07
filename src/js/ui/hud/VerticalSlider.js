/**
 * Vertical Slider Component
 * Premium vertical slider with smooth animations
 */

import { AnimatedValue } from '../../lib/animation.js';

export class VerticalSlider {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent element
   * @param {string} options.label - Slider label
   * @param {number} options.min - Minimum value
   * @param {number} options.max - Maximum value
   * @param {number} options.value - Initial value
   * @param {string} options.unit - Unit suffix (e.g., '%', '°')
   * @param {number} options.height - Slider height in pixels (default: 100)
   * @param {Function} options.onChange - Callback when value changes
   * @param {Function} options.formatValue - Optional value formatter
   */
  constructor(options) {
    this.options = {
      height: 100,
      formatValue: (val) => val.toFixed(1),
      ...options,
    };

    this.animatedValue = new AnimatedValue(options.value, 150);
    this.isDragging = false;

    this.createElement();
    this.attachEvents();
  }

  createElement() {
    const { label, height, unit, formatValue, value } = this.options;

    this.element = document.createElement('div');
    this.element.className = 'vertical-slider';
    this.element.innerHTML = `
      <div class="slider-label">${label}</div>
      <div class="slider-track-container" style="height: ${height}px">
        <div class="slider-track"></div>
        <div class="slider-fill"></div>
        <div class="slider-thumb"></div>
      </div>
      <div class="slider-value">${formatValue(value)}${unit}</div>
    `;

    this.track = this.element.querySelector('.slider-track-container');
    this.fill = this.element.querySelector('.slider-fill');
    this.thumb = this.element.querySelector('.slider-thumb');
    this.valueDisplay = this.element.querySelector('.slider-value');

    this.options.container.appendChild(this.element);
    this.updateVisuals();
  }

  attachEvents() {
    // Mouse/touch drag
    this.track.addEventListener('mousedown', this.handleStart.bind(this));
    this.track.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });

    // Global mouse/touch move and up
    document.addEventListener('mousemove', this.handleMove.bind(this));
    document.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
    document.addEventListener('mouseup', this.handleEnd.bind(this));
    document.addEventListener('touchend', this.handleEnd.bind(this));
  }

  handleStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.element.classList.add('dragging');
    this.updateFromEvent(e);
  }

  handleMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    this.updateFromEvent(e);
  }

  handleEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove('dragging');
  }

  updateFromEvent(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = this.track.getBoundingClientRect();

    // Calculate position from bottom (inverted Y)
    const relativeY = rect.bottom - clientY;
    const fraction = Math.max(0, Math.min(1, relativeY / rect.height));

    const { min, max } = this.options;
    const newValue = min + fraction * (max - min);

    this.setValue(newValue, false); // Don't animate during drag
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
    const { min, max, unit, formatValue } = this.options;
    const value = this.animatedValue.getValue();
    const fraction = (value - min) / (max - min);
    const percent = fraction * 100;

    this.fill.style.height = `${percent}%`;
    this.thumb.style.bottom = `calc(${percent}% - 8px)`;
    this.valueDisplay.textContent = `${formatValue(value)}${unit}`;
  }

  getValue() {
    return this.animatedValue.getValue();
  }

  destroy() {
    this.element.remove();
  }
}
