/**
 * Animation Utilities
 * Smooth value transitions and easing functions
 */

/**
 * Linear interpolation
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Progress (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
  return start + (end - start) * t;
}

/**
 * Ease out cubic
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value (0-1)
 */
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease in out cubic
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value (0-1)
 */
export function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Animated Value - smoothly transitions between values
 */
export class AnimatedValue {
  constructor(initialValue, duration = 300) {
    this.current = initialValue;
    this.target = initialValue;
    this.start = initialValue;
    this.duration = duration; // ms
    this.startTime = null;
    this.easingFn = easeOutCubic;
  }

  /**
   * Set new target value
   */
  setTarget(value) {
    if (this.target === value) return;

    this.start = this.current;
    this.target = value;
    this.startTime = performance.now();
  }

  /**
   * Update current value (call every frame)
   * @returns {boolean} True if animating, false if complete
   */
  update() {
    if (this.current === this.target) return false;
    if (this.startTime === null) {
      this.current = this.target;
      return false;
    }

    const elapsed = performance.now() - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);
    const eased = this.easingFn(progress);

    this.current = lerp(this.start, this.target, eased);

    if (progress >= 1) {
      this.current = this.target;
      this.startTime = null;
      return false;
    }

    return true;
  }

  /**
   * Get current value
   */
  getValue() {
    return this.current;
  }

  /**
   * Snap to target immediately
   */
  snap() {
    this.current = this.target;
    this.startTime = null;
  }
}

/**
 * Animation Loop Manager
 * Manages requestAnimationFrame loop separate from game loop
 */
class AnimationLoopManager {
  constructor() {
    this.callbacks = [];
    this.isRunning = false;
    this.rafId = null;
  }

  /**
   * Register animation callback
   * @param {Function} callback - Called every frame with deltaTime
   * @returns {Function} Unregister function
   */
  register(callback) {
    this.callbacks.push(callback);

    if (!this.isRunning) {
      this.start();
    }

    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index !== -1) {
        this.callbacks.splice(index, 1);
      }

      if (this.callbacks.length === 0) {
        this.stop();
      }
    };
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  loop = () => {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;

    for (const callback of this.callbacks) {
      callback(deltaTime);
    }

    if (this.isRunning) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };
}

export const animationLoop = new AnimationLoopManager();
