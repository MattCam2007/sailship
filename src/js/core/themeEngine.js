/**
 * Theme Engine - Core theming system for Sailship
 *
 * Manages theme loading, color abstraction, CSS variable injection, and persistence.
 * Single source of truth for all color and font definitions.
 */

// Theme format version for compatibility
const THEME_FORMAT_VERSION = '1.0.0';

// Module-level state
let activeTheme = null;
let defaultTheme = null;
let themeChangeCallbacks = [];

// Hardcoded fallback theme (embedded for offline/fetch failures)
const FALLBACK_THEME = {
  name: 'Fallback',
  version: '1.0.0',
  colors: {
    ui: {
      primary: '#e85d4c',
      primaryDim: '#a83d30',
      primaryBright: '#ff6f5e',
      secondary: '#4c9ee8',
      success: '#4ce88d',
      warning: '#e8944c',
      danger: '#e84c4c',
      bgDark: '#0a0a0a',
      bgDarker: '#050505',
      bgPanel: '#111111',
      bgPanelRaised: '#1a1a1a',
      textPrimary: '#e85d4c',
      textSecondary: '#ffffff',
      textDim: '#a83d30',
      textBright: '#ff6f5e',
      borderPrimary: '#e85d4c',
      borderSecondary: '#4c9ee8',
      cyan: '#00d9ff',
      cyanDim: '#0088aa',
      purple: '#b53dff',
      orange: '#e8944c',
      green: '#4ce88d',
      blue: '#4c9ee8'
    },
    canvas: {
      grid: '#e85d4c',
      gridAlpha: 0.1,
      orbitPrimary: '#e85d4c',
      orbitPrimaryAlpha: 0.3,
      orbitSecondary: '#e85d4c',
      orbitSecondaryAlpha: 0.15,
      orbitMoon: '#e85d4c',
      orbitMoonAlpha: 0.15,
      shipOrbitElliptic: '#4ce88d',
      shipOrbitEllipticAlpha: 0.5,
      shipOrbitHyperbolic: '#64c8ff',
      shipOrbitHyperbolicAlpha: 0.7,
      shipOrbitSOI: '#4c8de8',
      shipOrbitSOIAlpha: 0.6,
      trajectory: '#c864ff',
      trajectoryAlpha: 0.8,
      trajectoryPoint: '#c864ff',
      label: '#e85d4c',
      labelAlpha: 0.8,
      labelBg: '#0a0a0a',
      labelBgAlpha: 0.7,
      intersectionMarker: '#e85d4c',
      intersectionMarkerAlpha: 0.3,
      intersectionLabel: '#e85d4c',
      soiBoundary: '#4ce88d',
      soiBoundaryAlpha: 0.2,
      shipIcon: '#4ce88d'
    },
    bodies: {},
    ships: {
      player: '#4ce88d'
    }
  },
  fonts: {
    primary: "'Share Tech Mono', monospace",
    header: "'Orbitron', sans-serif",
    sizeBase: '11px',
    sizeSmall: '10px',
    sizeMedium: '12px',
    sizeHeader: '14px'
  },
  effects: {
    glowSm: '0 0 5px',
    glowMd: '0 0 10px',
    glowLg: '0 0 20px',
    glowXl: '0 0 40px'
  }
};

/**
 * Parse color string to RGBA object
 * Supports hex (#rgb, #rrggbb) and rgb/rgba formats
 * @param {string} colorString - Color in hex, rgb(), or rgba() format
 * @returns {{r: number, g: number, b: number, a: number}}
 */
function parseColor(colorString) {
  if (!colorString || typeof colorString !== 'string') {
    return { r: 232, g: 93, b: 76, a: 1 }; // Fallback to default coral
  }

  const str = colorString.trim();

  // Hex format: #rgb or #rrggbb
  if (str.startsWith('#')) {
    const hex = str.substring(1);

    if (hex.length === 3) {
      // #rgb → #rrggbb
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    } else if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b, a: 1 };
    }
  }

  // RGB/RGBA format: rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = str.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (rgbMatch) {
    const r = Math.round(parseFloat(rgbMatch[1]));
    const g = Math.round(parseFloat(rgbMatch[2]));
    const b = Math.round(parseFloat(rgbMatch[3]));
    const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;

    // Clamp values
    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
      a: Math.max(0, Math.min(1, a))
    };
  }

  console.warn(`Failed to parse color: ${colorString}`);
  return { r: 232, g: 93, b: 76, a: 1 }; // Fallback
}

/**
 * Convert RGBA object to CSS color string
 * @param {{r: number, g: number, b: number, a: number}} rgba
 * @returns {string} - rgb(...) or rgba(...) string
 */
function rgbaToString(rgba) {
  const { r, g, b, a } = rgba;
  if (a === 1 || a === undefined) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  // Round alpha to 3 decimal places
  const alpha = Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get nested property from object using dot notation
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-separated path (e.g., 'ui.primary')
 * @returns {*} - Property value or undefined
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Convert camelCase to kebab-case
 * @param {string} str - camelCase string
 * @returns {string} - kebab-case string
 */
function camelToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Validate theme definition against schema
 * @param {object} theme - Theme JSON to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTheme(theme) {
  const errors = [];

  // Check required top-level fields
  if (!theme.name || typeof theme.name !== 'string') {
    errors.push('Theme missing required field: name (string)');
  }
  if (!theme.version || typeof theme.version !== 'string') {
    errors.push('Theme missing required field: version (string)');
  }
  if (!theme.colors || typeof theme.colors !== 'object') {
    errors.push('Theme missing required field: colors (object)');
    return { valid: false, errors }; // Can't continue without colors
  }

  // Check required color sections
  if (!theme.colors.ui || typeof theme.colors.ui !== 'object') {
    errors.push('Theme colors missing required section: ui (object)');
  } else {
    // Check minimum required UI colors
    const requiredUi = ['primary', 'bgDark', 'textPrimary'];
    requiredUi.forEach(field => {
      if (!theme.colors.ui[field]) {
        errors.push(`Theme colors.ui missing required field: ${field}`);
      }
    });
  }

  if (!theme.colors.canvas || typeof theme.colors.canvas !== 'object') {
    errors.push('Theme colors missing required section: canvas (object)');
  } else {
    // Check minimum required canvas colors
    const requiredCanvas = ['grid', 'orbitPrimary', 'label'];
    requiredCanvas.forEach(field => {
      if (!theme.colors.canvas[field]) {
        errors.push(`Theme colors.canvas missing required field: ${field}`);
      }
    });
  }

  // Validate color formats (basic check)
  const validateColorField = (obj, path) => {
    for (const [key, value] of Object.entries(obj)) {
      if (key.endsWith('Alpha')) continue; // Skip alpha fields
      if (typeof value === 'string') {
        const parsed = parseColor(value);
        if (!parsed) {
          errors.push(`Invalid color format at ${path}.${key}: ${value}`);
        }
      } else if (typeof value === 'object' && value !== null) {
        validateColorField(value, `${path}.${key}`);
      }
    }
  };

  if (theme.colors.ui) validateColorField(theme.colors.ui, 'colors.ui');
  if (theme.colors.canvas) validateColorField(theme.colors.canvas, 'colors.canvas');

  return { valid: errors.length === 0, errors };
}

/**
 * Get a color from the active theme
 * Supports nested paths (e.g., 'canvas.grid', 'ui.primary')
 * Optionally override alpha channel
 *
 * Implements fallback chain: theme → default theme → hardcoded fallback
 *
 * @param {string} path - Dot-separated path to color
 * @param {number} [alpha] - Optional alpha override (0-1)
 * @returns {string} - Color in rgba(...) or rgb(...) format
 *
 * @example
 *   getColor('canvas.grid', 0.5) → 'rgba(232, 93, 76, 0.5)'
 *   getColor('ui.primary') → 'rgb(232, 93, 76)'
 */
export function getColor(path, alpha = null) {
  // Try active theme first
  let color = activeTheme ? getNestedProperty(activeTheme.colors, path) : null;

  // Fallback to default theme
  if (!color && defaultTheme) {
    color = getNestedProperty(defaultTheme.colors, path);
  }

  // Fallback to hardcoded default
  if (!color) {
    color = getNestedProperty(FALLBACK_THEME.colors, path);
    if (!color) {
      console.warn(`Color not found: ${path}, using fallback primary`);
      color = FALLBACK_THEME.colors.ui.primary;
    }
  }

  // Check for alpha property (e.g., canvas.gridAlpha)
  const alphaProp = path + 'Alpha';
  const defaultAlpha = activeTheme ? getNestedProperty(activeTheme.colors, alphaProp) : null;

  // Parse color and apply alpha
  const rgba = parseColor(color);
  rgba.a = alpha ?? defaultAlpha ?? 1;

  return rgbaToString(rgba);
}

/**
 * Load a theme definition into the engine
 * Validates theme before loading
 * @param {object} themeDefinition - Parsed theme JSON
 * @throws {Error} if theme is invalid
 */
export function loadTheme(themeDefinition) {
  const validation = validateTheme(themeDefinition);
  if (!validation.valid) {
    throw new Error(`Invalid theme: ${validation.errors.join(', ')}`);
  }

  activeTheme = themeDefinition;
}

/**
 * Get the currently active theme definition
 * @returns {object|null} - Active theme JSON or null
 */
export function getActiveTheme() {
  return activeTheme;
}

/**
 * Register a callback to be notified of theme changes
 * @param {function} callback - Function to call when theme changes
 */
export function onThemeChange(callback) {
  if (typeof callback === 'function') {
    themeChangeCallbacks.push(callback);
  }
}

/**
 * Inject CSS variables from theme into document root
 * Generates both hex and RGB variants for RGBA with custom opacity
 * @param {object} theme - Theme definition
 */
function injectCSSVariables(theme) {
  const root = document.documentElement;
  const { ui } = theme.colors;
  const { fonts, effects } = theme;

  // Inject UI colors (both hex and RGB variants)
  Object.entries(ui).forEach(([key, value]) => {
    const varName = camelToKebab(key);
    root.style.setProperty(`--${varName}`, value);

    // Generate RGB variant for rgba() with custom opacity
    const rgba = parseColor(value);
    root.style.setProperty(`--${varName}-rgb`, `${rgba.r}, ${rgba.g}, ${rgba.b}`);
  });

  // Inject fonts
  if (fonts) {
    Object.entries(fonts).forEach(([key, value]) => {
      const varName = camelToKebab(key);
      root.style.setProperty(`--font-${varName}`, value);
    });
  }

  // Inject effects
  if (effects) {
    Object.entries(effects).forEach(([key, value]) => {
      const varName = camelToKebab(key);
      root.style.setProperty(`--${varName}`, value);
    });
  }
}

/**
 * Apply a theme by name (built-in or custom)
 * Updates CSS variables and canvas color palette
 * Atomic operation with rollback on error
 *
 * @param {string} themeName - Name of theme to apply
 * @throws {Error} if theme not found
 */
export async function applyTheme(themeName) {
  const previousTheme = activeTheme;

  try {
    // Load theme from storage
    const theme = await loadThemeFromStorage(themeName);

    // Validate and load
    loadTheme(theme);

    // Inject CSS variables
    injectCSSVariables(theme);

    // Save active theme name to localStorage
    try {
      const themeState = JSON.parse(localStorage.getItem('themeState') || '{}');
      themeState.active = themeName;
      localStorage.setItem('themeState', JSON.stringify(themeState));
    } catch (err) {
      console.warn('Failed to save active theme to localStorage:', err);
    }

    // Notify listeners (gradient cache, etc.)
    themeChangeCallbacks.forEach(cb => {
      try {
        cb();
      } catch (err) {
        console.error('Theme change callback error:', err);
      }
    });

  } catch (error) {
    // Rollback on error
    console.error('Theme application failed:', error);
    if (previousTheme) {
      activeTheme = previousTheme;
      injectCSSVariables(previousTheme);
    }
    throw error;
  }
}

/**
 * Load theme from storage (built-in or custom)
 * @param {string} themeName - Name of theme to load
 * @returns {Promise<object>} - Theme definition
 * @throws {Error} if theme not found
 */
async function loadThemeFromStorage(themeName) {
  // Check custom themes first
  try {
    const themeState = JSON.parse(localStorage.getItem('themeState') || '{}');
    const customThemes = themeState.custom || [];
    const customTheme = customThemes.find(t => t.name === themeName);
    if (customTheme) {
      return customTheme;
    }
  } catch (err) {
    console.warn('Failed to load custom themes from localStorage:', err);
  }

  // Load built-in theme from /themes/
  // Fetch theme index to get filename
  try {
    const indexResponse = await fetch('/themes/index.json');
    if (!indexResponse.ok) {
      throw new Error(`Failed to fetch theme index: ${indexResponse.status}`);
    }
    const index = await indexResponse.json();
    const themeEntry = index.themes.find(t => t.name === themeName);

    if (!themeEntry) {
      throw new Error(`Theme not found: ${themeName}`);
    }

    const themeResponse = await fetch(`/themes/${themeEntry.file}`);
    if (!themeResponse.ok) {
      throw new Error(`Failed to fetch theme file: ${themeEntry.file}`);
    }
    const theme = await themeResponse.json();
    return theme;

  } catch (err) {
    console.error(`Failed to load theme ${themeName}:`, err);
    throw err;
  }
}

/**
 * Get list of all available themes (built-in + custom)
 * @returns {Promise<Array<{name, author, description, tags, builtin}>>}
 */
export async function getAvailableThemes() {
  const themes = [];

  // Load built-in themes from index
  try {
    const indexResponse = await fetch('/themes/index.json');
    if (indexResponse.ok) {
      const index = await indexResponse.json();
      index.themes.forEach(entry => {
        themes.push({
          name: entry.name,
          author: entry.author,
          description: entry.description,
          tags: entry.tags || [],
          featured: entry.featured || false,
          builtin: true
        });
      });
    }
  } catch (err) {
    console.warn('Failed to load built-in themes:', err);
  }

  // Load custom themes from localStorage
  try {
    const themeState = JSON.parse(localStorage.getItem('themeState') || '{}');
    const customThemes = themeState.custom || [];
    customThemes.forEach(theme => {
      themes.push({
        name: theme.name,
        author: theme.author || 'Custom',
        description: theme.description || 'Custom theme',
        tags: theme.tags || ['custom'],
        featured: false,
        builtin: false
      });
    });
  } catch (err) {
    console.warn('Failed to load custom themes:', err);
  }

  return themes;
}

/**
 * Save a custom theme to localStorage
 * Enforces limit of 20 custom themes
 * @param {object} themeDefinition - Theme JSON
 * @throws {Error} if validation fails or limit exceeded
 */
export function saveCustomTheme(themeDefinition) {
  // Validate theme
  const validation = validateTheme(themeDefinition);
  if (!validation.valid) {
    throw new Error(`Invalid theme: ${validation.errors.join(', ')}`);
  }

  try {
    const themeState = JSON.parse(localStorage.getItem('themeState') || '{}');
    const customThemes = themeState.custom || [];

    // Check limit (20 max)
    const existingIndex = customThemes.findIndex(t => t.name === themeDefinition.name);
    if (existingIndex === -1 && customThemes.length >= 20) {
      throw new Error('Maximum of 20 custom themes reached. Delete unused themes to add more.');
    }

    // Add or update theme
    if (existingIndex >= 0) {
      customThemes[existingIndex] = themeDefinition;
    } else {
      customThemes.push(themeDefinition);
    }

    themeState.custom = customThemes;
    localStorage.setItem('themeState', JSON.stringify(themeState));

  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      throw new Error('Storage full. Delete unused custom themes to free space.');
    }
    throw err;
  }
}

/**
 * Delete a custom theme from localStorage
 * @param {string} themeName - Name of custom theme to delete
 * @throws {Error} if theme is built-in or not found
 */
export function deleteCustomTheme(themeName) {
  try {
    const themeState = JSON.parse(localStorage.getItem('themeState') || '{}');
    const customThemes = themeState.custom || [];

    const index = customThemes.findIndex(t => t.name === themeName);
    if (index === -1) {
      throw new Error(`Custom theme not found: ${themeName}`);
    }

    // If deleting active theme, switch to default first
    if (activeTheme && activeTheme.name === themeName) {
      applyTheme('Default Coral').catch(err => {
        console.warn('Failed to switch to default theme:', err);
      });
    }

    customThemes.splice(index, 1);
    themeState.custom = customThemes;
    localStorage.setItem('themeState', JSON.stringify(themeState));

  } catch (err) {
    throw err;
  }
}

/**
 * Export a theme as JSON string
 * @param {string} themeName - Theme to export
 * @returns {Promise<string>} - JSON string
 */
export async function exportTheme(themeName) {
  const theme = await loadThemeFromStorage(themeName);
  return JSON.stringify(theme, null, 2);
}

/**
 * Import a theme from JSON string
 * Validates and adds to custom themes
 * Handles name conflicts by prompting user
 *
 * @param {string} jsonString - Theme JSON
 * @returns {Promise<string>} - Name of imported theme
 * @throws {Error} if invalid JSON or validation fails
 */
export async function importTheme(jsonString) {
  let theme;

  // Parse JSON
  try {
    theme = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  // Validate theme
  const validation = validateTheme(theme);
  if (!validation.valid) {
    throw new Error(`Invalid theme: ${validation.errors.join(', ')}`);
  }

  // Check if theme name conflicts with built-in
  const builtinThemes = await getAvailableThemes();
  const isBuiltin = builtinThemes.some(t => t.builtin && t.name === theme.name);
  if (isBuiltin) {
    throw new Error(`Cannot import theme with same name as built-in theme: ${theme.name}`);
  }

  // Save to custom themes (will overwrite if exists)
  saveCustomTheme(theme);

  return theme.name;
}

/**
 * Reset to default theme and clear all custom themes
 */
export function resetToDefault() {
  try {
    // Clear custom themes
    const themeState = { active: 'Default Coral', custom: [] };
    localStorage.setItem('themeState', JSON.stringify(themeState));

    // Apply default theme
    applyTheme('Default Coral').catch(err => {
      console.error('Failed to apply default theme:', err);
    });

  } catch (err) {
    console.error('Failed to reset themes:', err);
    throw err;
  }
}

/**
 * Initialize theme engine on startup
 * Loads saved theme from localStorage or uses default
 * Falls back gracefully on any errors
 */
export async function initThemeEngine() {
  try {
    // Load default theme as fallback
    try {
      const response = await fetch('/themes/default.json');
      if (response.ok) {
        defaultTheme = await response.json();
      }
    } catch (err) {
      console.warn('Failed to load default theme, using embedded fallback:', err);
      defaultTheme = FALLBACK_THEME;
    }

    // Get saved theme name from localStorage
    let savedThemeName = 'Default Coral'; // Default
    try {
      const themeState = JSON.parse(localStorage.getItem('themeState') || '{}');
      if (themeState.active) {
        savedThemeName = themeState.active;
      }
    } catch (err) {
      console.warn('Failed to read theme state from localStorage:', err);
    }

    // Apply saved theme
    try {
      await applyTheme(savedThemeName);
    } catch (err) {
      console.error(`Failed to apply saved theme ${savedThemeName}, falling back to default:`, err);
      // Fallback to default
      if (defaultTheme) {
        loadTheme(defaultTheme);
        injectCSSVariables(defaultTheme);
      }
    }

  } catch (err) {
    console.error('Theme engine initialization failed:', err);
    // Last resort: use embedded fallback
    loadTheme(FALLBACK_THEME);
    injectCSSVariables(FALLBACK_THEME);
  }
}
