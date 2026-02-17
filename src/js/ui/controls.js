/**
 * User input and control handlers
 */

import { camera, setCameraFollow, stopFollowing } from '../core/camera.js';
import { setZoom, setDisplayOption, setFocusTarget, getScale, setSpeed, setCustomSpeed, setAutoPilotEnabled, isAutoPilotEnabled, AUTOPILOT_PHASES, AUTOPILOT_MODES, setAutoPilotPhase, getAutoPilotPhase, setAutoPilotMode, getAutoPilotMode, setTrajectoryDuration, bodyFilters, saveBodyFilters } from '../core/gameState.js';
import { exportGameState, importGameState, fetchSaveIndex, loadSaveFile } from '../core/saveState.js';
import { resizeCanvas } from './renderer.js';
import { clearPlanetTextureCache } from '../lib/planetTextures.js';
import {
    setDestination,
    destination,
    generateFlightPath,
    computeCapturePlan,
    computeSlingshotPlan,
    getDestinationInfo
} from '../core/navigation.js';
import { celestialBodies, getVisibleBodies } from '../data/celestialBodies.js';
import { ships, getPlayerShip, setSailAngle, setSailPitch, setSailDeployment, setSailCount, setThrusterBurnSize } from '../data/ships.js';
import { fireThruster, nudgeShipAlongOrbit } from '../core/shipPhysics.js';
import { setDestinationName, updateSailDisplay } from './uiUpdater.js';
import { initExpandablePanel, loadPanelState, initTabGroup, isMobileView } from './ui-components.js';

// ============================================================================
// WORKER COUNT CONTROLS
// ============================================================================

const DEFAULT_WORKERS = Math.min(navigator.hardwareConcurrency || 4, 16);
const MIN_WORKERS = 1;
const MAX_WORKERS = Math.max(navigator.hardwareConcurrency || 4, 16);

/**
 * Initialize a worker count control (+/- buttons with display).
 * Persists to localStorage for each control.
 */
function initWorkerControl(downBtnId, upBtnId, countId, storageKey) {
    const downBtn = document.getElementById(downBtnId);
    const upBtn = document.getElementById(upBtnId);
    const countEl = document.getElementById(countId);
    if (!downBtn || !upBtn || !countEl) return;

    // Load saved value or default
    const saved = localStorage.getItem(storageKey);
    let count = saved ? parseInt(saved, 10) : DEFAULT_WORKERS;
    count = Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, count));
    countEl.textContent = count;

    downBtn.addEventListener('click', () => {
        let val = parseInt(countEl.textContent, 10) || DEFAULT_WORKERS;
        val = Math.max(MIN_WORKERS, val - 1);
        countEl.textContent = val;
        localStorage.setItem(storageKey, val);
    });

    upBtn.addEventListener('click', () => {
        let val = parseInt(countEl.textContent, 10) || DEFAULT_WORKERS;
        val = Math.min(MAX_WORKERS, val + 1);
        countEl.textContent = val;
        localStorage.setItem(storageKey, val);
    });
}

/**
 * Read the current worker count from a UI element.
 */
function getWorkerCount(countId) {
    const el = document.getElementById(countId);
    if (!el) return 1;
    return parseInt(el.textContent, 10) || 1;
}

// Drag state for camera panning
const dragState = {
    isDragging: false,
    lastX: 0,
    lastY: 0
};

// Mouse button constants for readability
const MOUSE_BUTTON = {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2
};

// Rotation state for camera view manipulation
const rotateState = {
    isRotating: false,
    lastX: 0,
    lastY: 0
};

// Touch state for mobile gestures
const touchState = {
    touches: [],           // Active touch points
    gestureMode: null,     // 'pan' | 'rotate' | null
    initialPinchDist: 0,   // Distance between fingers at pinch start
    initialZoom: 1,        // Zoom level at pinch start
    lastCenter: { x: 0, y: 0 }  // Center point for delta calculations
};

// ============================================================================
// Fine-Tune Keyboard Control State
// ============================================================================

/**
 * Resolution modes for keyboard sail adjustments
 * Each mode defines step sizes for angles and deployment
 */
export const RESOLUTION_MODES = {
    COARSE: { name: 'COARSE', angleStep: 10, deployStep: 25, sailCountStep: 10 },
    NORMAL: { name: 'NORMAL', angleStep: 5, deployStep: 10, sailCountStep: 1 },
    FINE:   { name: 'FINE',   angleStep: 1, deployStep: 1, sailCountStep: 1 },
    ULTRA:  { name: 'ULTRA',  angleStep: 0.1, deployStep: 0.1, sailCountStep: 1 },
    UBER:   { name: 'UBER',   angleStep: 0.01, deployStep: 0.01, sailCountStep: 1 }  // v3.6: "last mile" precision
};

/**
 * Available sail controls that can be selected for keyboard adjustment
 */
export const SAIL_CONTROLS = {
    SAIL_COUNT: 'sailCount',
    DEPLOYMENT: 'deployment',
    YAW: 'yaw',
    PITCH: 'pitch'
};

/**
 * State for the fine-tune keyboard control system
 * Tracks which control is selected and the current resolution mode
 */
export const fineTuneState = {
    selectedControl: SAIL_CONTROLS.YAW,  // Default to yaw (most commonly adjusted)
    resolutionMode: RESOLUTION_MODES.NORMAL,
    resolutionOrder: ['COARSE', 'NORMAL', 'FINE', 'ULTRA', 'UBER']  // Cycle order (v3.6: added UBER)
};

/**
 * Cycle to the next resolution mode
 */
export function cycleResolutionMode() {
    const currentIndex = fineTuneState.resolutionOrder.indexOf(fineTuneState.resolutionMode.name);
    const nextIndex = (currentIndex + 1) % fineTuneState.resolutionOrder.length;
    const nextModeName = fineTuneState.resolutionOrder[nextIndex];
    fineTuneState.resolutionMode = RESOLUTION_MODES[nextModeName];
    updateFineTuneUI();
}

/**
 * Select a sail control for keyboard adjustment
 * @param {string} control - One of SAIL_CONTROLS values
 */
export function selectSailControl(control) {
    if (Object.values(SAIL_CONTROLS).includes(control)) {
        fineTuneState.selectedControl = control;
        updateFineTuneUI();
    }
}

/**
 * Update the fine-tune UI indicator to reflect current state
 */
export function updateFineTuneUI() {
    // Update resolution display
    const resolutionDisplay = document.getElementById('fineTuneResolution');
    if (resolutionDisplay) {
        resolutionDisplay.textContent = fineTuneState.resolutionMode.name;
    }

    // Update selected control highlight
    const controls = ['sailCount', 'deployment', 'yaw', 'pitch'];
    controls.forEach(control => {
        const capitalised = control.charAt(0).toUpperCase() + control.slice(1);
        const row = document.getElementById(`sailControl${capitalised}`);
        if (row) {
            row.classList.toggle('selected', fineTuneState.selectedControl === control);
        }
    });

    // Update the keyboard hint display
    const hintDisplay = document.getElementById('fineTuneHint');
    if (hintDisplay) {
        const mode = fineTuneState.resolutionMode;
        const controlName = fineTuneState.selectedControl === SAIL_CONTROLS.SAIL_COUNT
            ? 'SAIL COUNT'
            : fineTuneState.selectedControl.toUpperCase();
        let step;
        if (fineTuneState.selectedControl === SAIL_CONTROLS.SAIL_COUNT) {
            step = `${mode.sailCountStep}`;
        } else if (fineTuneState.selectedControl === SAIL_CONTROLS.DEPLOYMENT) {
            step = `${mode.deployStep}%`;
        } else {
            step = `${mode.angleStep}°`;
        }
        hintDisplay.textContent = `↑/↓: ${controlName} ±${step}`;
    }
}

/**
 * Initialize the fine-tune keyboard control UI
 * Sets up initial state display and click handlers for control selection
 */
function initFineTuneControls() {
    // Set initial UI state
    updateFineTuneUI();

    // Add click handlers to sail control rows for mouse/touch selection
    const controlRows = [
        { id: 'sailControlSailCount', control: SAIL_CONTROLS.SAIL_COUNT },
        { id: 'sailControlDeployment', control: SAIL_CONTROLS.DEPLOYMENT },
        { id: 'sailControlYaw', control: SAIL_CONTROLS.YAW },
        { id: 'sailControlPitch', control: SAIL_CONTROLS.PITCH }
    ];

    controlRows.forEach(({ id, control }) => {
        const row = document.getElementById(id);
        if (row) {
            row.addEventListener('click', () => {
                selectSailControl(control);
            });
            row.style.cursor = 'pointer';
        }
    });

    // Add click handler to resolution display to cycle modes
    const resolutionDisplay = document.getElementById('fineTuneResolution');
    if (resolutionDisplay) {
        resolutionDisplay.addEventListener('click', () => {
            cycleResolutionMode();
        });
        resolutionDisplay.style.cursor = 'pointer';
    }
}

/**
 * Initialize all control event listeners
 * @param {HTMLCanvasElement} canvas
 */
export function initControls(canvas) {
    initZoomControls();
    initSpeedControls();
    initDisplayOptions();
    initTrajectoryConfig();
    initExpandablePanels();
    initRightPanelTabs();
    initSailControls();
    initFineTuneControls();
    initAutoPilotControls();
    initEncounterModeControls();
    initThrusterControls();
    initSaveLoadControls();
    initCheatCodes();
    initKeyboardShortcuts();
    initMouseControls(canvas);
    initTouchControls(canvas);
    initMobileSailWidget();
    populateObjectList();
}

/**
 * Set up zoom button handlers
 */
function initZoomControls() {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setZoom(btn.dataset.zoom);
        });
    });
}

/**
 * Set up speed button handlers
 */
function initSpeedControls() {
    const customInput = document.getElementById('customSpeed');
    
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setSpeed(btn.dataset.speed);
            // Clear custom input when using preset
            if (customInput) customInput.value = '';
        });
    });
    
    // Custom speed input
    if (customInput) {
        customInput.addEventListener('input', () => {
            const value = parseFloat(customInput.value);
            if (!isNaN(value) && value >= 0) {
                // Remove active state from preset buttons
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                setCustomSpeed(value);
            }
        });
        
        // Also handle Enter key
        customInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                customInput.blur();
            }
        });
    }
}

/**
 * Set up display option checkboxes
 */
function initDisplayOptions() {
    const options = {
        'showStarfield': 'showStarfield',
        'showOrbits': 'showOrbits',
        'showTargetOrbitOnly': 'showTargetOrbitOnly',
        'showLabels': 'showLabels',
        'showTrajectory': 'showTrajectory',
        'showPredictedTrajectory': 'showPredictedTrajectory',
        'showIntersectionMarkers': 'showIntersectionMarkers',
        'showGrid': 'showGrid'
    };

    Object.entries(options).forEach(([elementId, optionName]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('change', e => setDisplayOption(optionName, e.target.checked));
        }
    });

    // High-res texture toggle requires special handling (clear texture cache and reload)
    const highResTexturesToggle = document.getElementById('useHighResTextures');
    if (highResTexturesToggle) {
        // Load saved preference
        const savedPref = localStorage.getItem('useHighResTextures');
        if (savedPref !== null) {
            const enabled = savedPref === 'true';
            highResTexturesToggle.checked = enabled;
            setDisplayOption('useHighResTextures', enabled);
        }

        highResTexturesToggle.addEventListener('change', e => {
            const enabled = e.target.checked;
            setDisplayOption('useHighResTextures', enabled);
            localStorage.setItem('useHighResTextures', enabled.toString());
            // Clear texture cache to force reload with new resolution
            clearPlanetTextureCache();
            console.log(`[CONTROLS] High-res textures ${enabled ? 'enabled' : 'disabled'}, cache cleared`);
        });
    }

    // Premium visual feature toggles (simple, no cache clearing needed)
    const premiumToggles = ['useNormalMaps', 'useSpecular', 'useAtmosphereGlow'];
    premiumToggles.forEach(toggleName => {
        const toggle = document.getElementById(toggleName);
        if (toggle) {
            // Load saved preference
            const savedPref = localStorage.getItem(toggleName);
            if (savedPref !== null) {
                const enabled = savedPref === 'true';
                toggle.checked = enabled;
                setDisplayOption(toggleName, enabled);
            }

            toggle.addEventListener('change', e => {
                const enabled = e.target.checked;
                setDisplayOption(toggleName, enabled);
                localStorage.setItem(toggleName, enabled.toString());
            });
        }
    });

    // Initialize body filter controls
    initBodyFilters();
}

/**
 * Set up body filter checkboxes
 */
function initBodyFilters() {
    // Wire up event handlers
    const filterPlanet = document.getElementById('filterPlanet');
    if (filterPlanet) {
        filterPlanet.addEventListener('change', (e) => {
            bodyFilters.planet = e.target.checked;
            saveBodyFilters();
            populateObjectList(); // Refresh object list
        });
    }

    const filterDwarfPlanet = document.getElementById('filterDwarfPlanet');
    if (filterDwarfPlanet) {
        filterDwarfPlanet.addEventListener('change', (e) => {
            bodyFilters['dwarf-planet'] = e.target.checked;
            saveBodyFilters();
            populateObjectList();
        });
    }

    const filterMajorMoon = document.getElementById('filterMajorMoon');
    if (filterMajorMoon) {
        filterMajorMoon.addEventListener('change', (e) => {
            bodyFilters['major-moon'] = e.target.checked;
            saveBodyFilters();
            populateObjectList();
        });
    }

    const filterMinorMoon = document.getElementById('filterMinorMoon');
    if (filterMinorMoon) {
        filterMinorMoon.addEventListener('change', (e) => {
            bodyFilters['minor-moon'] = e.target.checked;
            saveBodyFilters();
            populateObjectList();
        });
    }

    const filterAsteroid = document.getElementById('filterAsteroid');
    if (filterAsteroid) {
        filterAsteroid.addEventListener('change', (e) => {
            bodyFilters.asteroid = e.target.checked;
            saveBodyFilters();
            populateObjectList();
        });
    }

    // Initialize checkbox states from loaded filters
    if (filterPlanet) filterPlanet.checked = bodyFilters.planet;
    if (filterDwarfPlanet) filterDwarfPlanet.checked = bodyFilters['dwarf-planet'];
    if (filterMajorMoon) filterMajorMoon.checked = bodyFilters['major-moon'];
    if (filterMinorMoon) filterMinorMoon.checked = bodyFilters['minor-moon'];
    if (filterAsteroid) filterAsteroid.checked = bodyFilters.asteroid;
}

/**
 * Set up trajectory configuration controls
 */
function initTrajectoryConfig() {
    const slider = document.getElementById('trajectoryDuration');
    const valueDisplay = document.getElementById('trajectoryDurationValue');
    const resetBtn = document.getElementById('trajectoryConfigReset');
    const DEFAULT_DAYS = 60;

    // Coalesce trajectory duration updates within a frame.
    // The slider fires many 'input' events per second during drag;
    // only apply the latest value once per animation frame.
    let pendingDurationDays = null;
    let durationUpdatePending = false;
    function scheduleDurationUpdate(days) {
        pendingDurationDays = days;
        if (!durationUpdatePending) {
            durationUpdatePending = true;
            requestAnimationFrame(() => {
                durationUpdatePending = false;
                if (pendingDurationDays !== null) {
                    setTrajectoryDuration(pendingDurationDays);
                    pendingDurationDays = null;
                }
            });
        }
    }

    if (slider) {
        slider.addEventListener('input', (e) => {
            const days = parseInt(e.target.value);
            scheduleDurationUpdate(days);
            // Update display immediately for responsiveness
            if (valueDisplay) {
                valueDisplay.textContent = formatDuration(days);
            }
        });
    }

    document.querySelectorAll('.preset-btn[data-days]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = parseInt(e.target.dataset.days);
            // Update active state for preset buttons
            document.querySelectorAll('.preset-btn[data-days]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            if (slider) {
                slider.value = days;
            }
            setTrajectoryDuration(days);
            if (valueDisplay) {
                valueDisplay.textContent = formatDuration(days);
            }
        });
    });

    // Reset button handler
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (slider) {
                slider.value = DEFAULT_DAYS;
            }
            setTrajectoryDuration(DEFAULT_DAYS);
            if (valueDisplay) {
                valueDisplay.textContent = formatDuration(DEFAULT_DAYS);
            }
            // Update active state for preset buttons
            document.querySelectorAll('.preset-btn[data-days]').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.days) === DEFAULT_DAYS);
            });
        });
    }

    // Also update active state when slider changes
    if (slider) {
        const updatePresetActiveState = () => {
            const currentDays = parseInt(slider.value);
            document.querySelectorAll('.preset-btn[data-days]').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.days) === currentDays);
            });
        };
        slider.addEventListener('input', updatePresetActiveState);
        // Set initial active state
        updatePresetActiveState();
    }
}

/**
 * Format duration in days to human-readable string
 * @param {number} days - Duration in days
 * @returns {string} Formatted string
 */
function formatDuration(days) {
    if (days >= 365) {
        const years = days / 365;
        // For exact years (365, 730), show as integer
        if (days % 365 === 0) {
            return `${Math.round(years)}yr`;
        }
        // For near-exact years (within 5 days), round to integer
        if (Math.abs(days - Math.round(years) * 365) < 5) {
            return `${Math.round(years)}yr`;
        }
        // Otherwise show one decimal place
        return `${years.toFixed(1)}yr`;
    }
    if (days >= 30) {
        const months = days / 30;
        // For exact months (180 = 6mo), show as integer
        if (days % 30 === 0) {
            return `${Math.round(months)}mo`;
        }
        // For near-exact months, round to integer
        if (Math.abs(days - Math.round(months) * 30) < 3) {
            return `${Math.round(months)}mo`;
        }
        // Otherwise show one decimal place
        return `${months.toFixed(1)}mo`;
    }
    return `${days}d`;
}

/**
 * Initialize expandable panels with state persistence
 */
function initExpandablePanels() {
    const panels = ['zoomPanel', 'speedPanel', 'orbitPanel', 'displayPanel', 'bodyFiltersSection', 'cheatCodesPanel', 'trajectoryConfigPanel'];

    panels.forEach(id => {
        const savedState = loadPanelState(id);
        const defaultExpanded = savedState !== undefined ? savedState : true;
        initExpandablePanel(id, defaultExpanded);
    });
}

/**
 * Initialize right panel tabs
 */
function initRightPanelTabs() {
    initTabGroup('rightPanelTabs', 'sail');
}

/**
 * Set up sail control sliders.
 *
 * Uses requestAnimationFrame-based coalescing for updateSailDisplay()
 * to avoid redundant DOM updates when multiple slider input events
 * fire within the same frame (e.g., during fast slider dragging).
 */
function initSailControls() {
    const sailCountSlider = document.getElementById('sailCount');
    const deploySlider = document.getElementById('sailDeployment');
    const angleSlider = document.getElementById('sailAngle');
    const pitchSlider = document.getElementById('sailPitch');
    const sailCountValue = document.getElementById('sailCountValue');
    const deployValue = document.getElementById('sailDeployValue');
    const angleValue = document.getElementById('sailAngleValue');
    const pitchValue = document.getElementById('sailPitchValue');

    // Coalesce updateSailDisplay() calls within a single animation frame.
    // Slider 'input' events can fire many times per frame during fast dragging;
    // this ensures we only update the display once per frame.
    let sailDisplayUpdatePending = false;
    function scheduleSailDisplayUpdate() {
        if (!sailDisplayUpdatePending) {
            sailDisplayUpdatePending = true;
            requestAnimationFrame(() => {
                sailDisplayUpdatePending = false;
                updateSailDisplay();
            });
        }
    }

    const player = getPlayerShip();

    // Initialize slider values from current ship state
    if (player && player.sail) {
        if (sailCountSlider) {
            sailCountSlider.value = player.sail.sailCount || 1;
        }
        if (sailCountValue) {
            sailCountValue.textContent = player.sail.sailCount || 1;
        }
        if (deploySlider) {
            deploySlider.value = player.sail.deploymentPercent;
        }
        if (angleSlider) {
            // Convert radians to degrees for display
            angleSlider.value = Math.round(player.sail.angle * 180 / Math.PI);
        }
        if (pitchSlider) {
            // Convert radians to degrees for display
            pitchSlider.value = Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI);
        }
        if (pitchValue) {
            pitchValue.textContent = Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI) + '°';
        }
    }

    // Sail count slider handler
    if (sailCountSlider) {
        sailCountSlider.addEventListener('input', () => {
            const value = parseInt(sailCountSlider.value, 10);
            const player = getPlayerShip();
            if (player) {
                setSailCount(player, value);
            }
            if (sailCountValue) {
                sailCountValue.textContent = value;
            }
            scheduleSailDisplayUpdate();
        });
    }

    // Deployment slider handler
    if (deploySlider) {
        deploySlider.addEventListener('input', () => {
            const value = parseFloat(deploySlider.value);
            const player = getPlayerShip();
            if (player) {
                setSailDeployment(player, value);
            }
            if (deployValue) {
                // Show decimal only if not a whole number (support up to 2 decimals for UBER resolution)
                const rounded = Math.round(value * 100) / 100;
                const displayValue = Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(2));
                deployValue.textContent = displayValue + '%';
            }
            scheduleSailDisplayUpdate();
        });
    }

    // Yaw angle slider handler
    if (angleSlider) {
        angleSlider.addEventListener('input', () => {
            const degrees = parseFloat(angleSlider.value);
            const radians = degrees * Math.PI / 180;
            const player = getPlayerShip();
            if (player) {
                setSailAngle(player, radians);
            }
            if (angleValue) {
                // Show decimal only if not a whole number (support up to 2 decimals for UBER resolution)
                const rounded = Math.round(degrees * 100) / 100;
                const displayValue = Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(2));
                angleValue.textContent = displayValue + '°';
            }
            scheduleSailDisplayUpdate();
        });
    }

    // Pitch angle slider handler
    if (pitchSlider) {
        pitchSlider.addEventListener('input', () => {
            const degrees = parseFloat(pitchSlider.value);
            const radians = degrees * Math.PI / 180;
            const player = getPlayerShip();
            if (player) {
                setSailPitch(player, radians);
            }
            if (pitchValue) {
                // Show decimal only if not a whole number (support up to 2 decimals for UBER resolution)
                const rounded = Math.round(degrees * 100) / 100;
                const displayValue = Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(2));
                pitchValue.textContent = displayValue + '°';
            }
            scheduleSailDisplayUpdate();
        });
    }
}

// ============================================================================
// CHEAT CODES
// ============================================================================

/**
 * Update cheat codes panel enabled/disabled state based on sail deployment.
 */
export function updateCheatCodesUI() {
    const player = getPlayerShip();
    const statusEl = document.getElementById('cheatCodesStatus');
    const controlsEl = document.getElementById('cheatCodesControls');
    if (!statusEl || !controlsEl || !player) return;

    const sailsFurled = player.sail && player.sail.deploymentPercent === 0;

    if (sailsFurled) {
        statusEl.textContent = 'ACTIVE';
        statusEl.classList.add('active');
        controlsEl.classList.remove('disabled');
    } else {
        statusEl.textContent = 'FURL SAILS TO ENABLE';
        statusEl.classList.remove('active');
        controlsEl.classList.add('disabled');
    }
}

/**
 * Perform an orbit nudge and update UI.
 * @param {number} days - Days to nudge (positive = forward, negative = backward)
 */
function performOrbitNudge(days) {
    const player = getPlayerShip();
    if (!player) return;

    const success = nudgeShipAlongOrbit(player, days);
    if (!success) {
        updateCheatCodesUI();
    }
}

/**
 * Set up cheat codes panel button handlers.
 */
function initCheatCodes() {
    const nudgeButtons = [
        { id: 'cheatNudgeBack30', days: -30 },
        { id: 'cheatNudgeBack10', days: -10 },
        { id: 'cheatNudgeBack1', days: -1 },
        { id: 'cheatNudgeFwd1', days: 1 },
        { id: 'cheatNudgeFwd10', days: 10 },
        { id: 'cheatNudgeFwd30', days: 30 },
    ];

    nudgeButtons.forEach(({ id, days }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => performOrbitNudge(days));
        }
    });

    // Update enabled state whenever sail deployment changes
    // We hook into the sail deployment slider's input event
    const deploySlider = document.getElementById('sailDeployment');
    if (deploySlider) {
        deploySlider.addEventListener('input', () => {
            // Defer to next tick so sail state is updated first
            requestAnimationFrame(updateCheatCodesUI);
        });
    }

    // Set initial state
    updateCheatCodesUI();
}

/**
 * Set up keyboard shortcuts
 */
function initKeyboardShortcuts() {
    const sailCountSlider = document.getElementById('sailCount');
    const deploySlider = document.getElementById('sailDeployment');
    const angleSlider = document.getElementById('sailAngle');
    const pitchSlider = document.getElementById('sailPitch');

    document.addEventListener('keydown', e => {
        // Tab switching shortcuts: Ctrl+1/2 for SAIL/NAV
        if ((e.ctrlKey || e.metaKey) && ['1', '2'].includes(e.key)) {
            e.preventDefault(); // Prevent browser shortcuts
            const tabMap = { '1': 'sail', '2': 'nav' };
            const tabButtons = document.querySelectorAll('#rightPanelTabs .tab-btn');
            const targetTab = tabMap[e.key];
            const targetButton = Array.from(tabButtons).find(btn => btn.dataset.tab === targetTab);
            if (targetButton) {
                targetButton.click();
            }
            return;
        }

        // Camera rotation shortcuts (always active, even during autopilot)
        const rotationStep = 0.05;  // ~3 degrees per press
        const tiltStep = 0.05;

        switch (e.key.toLowerCase()) {
            case 'q':
                // Rotate view counter-clockwise
                camera.angleZ -= rotationStep;
                if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;
                clearPlanetTextureCache();
                break;
            case 'e':
                // Rotate view clockwise
                camera.angleZ += rotationStep;
                camera.angleZ = camera.angleZ % (2 * Math.PI);
                clearPlanetTextureCache();
                break;
            case 'r':
                // Reset view to default (avoid conflict with browser refresh)
                if (!e.ctrlKey && !e.metaKey) {
                    camera.angleX = 15 * Math.PI / 180;
                    camera.angleZ = 0;
                    clearPlanetTextureCache();
                }
                break;
            case 'w':
                // Tilt view more top-down
                camera.angleX = Math.max(0, camera.angleX - tiltStep);
                clearPlanetTextureCache();
                break;
            case 's':
                // Tilt view more edge-on
                camera.angleX = Math.min(Math.PI / 2, camera.angleX + tiltStep);
                clearPlanetTextureCache();
                break;
        }

        // Autopilot toggle with 'a'
        if (e.key === 'a' || e.key === 'A') {
            const newState = !isAutoPilotEnabled();
            setAutoPilotEnabled(newState);
            updateAutoPilotUI(newState);
            return;
        }

        // Cheat codes: orbit nudge with , / . (1 day) and < / > (10 days)
        if (e.key === ',') {
            performOrbitNudge(-1);
            return;
        }
        if (e.key === '.') {
            performOrbitNudge(1);
            return;
        }
        if (e.key === '<') {
            performOrbitNudge(-10);
            return;
        }
        if (e.key === '>') {
            performOrbitNudge(10);
            return;
        }

        // Fine-tune control selection with 0, 1, 2, 3
        if (e.key === '0') {
            selectSailControl(SAIL_CONTROLS.SAIL_COUNT);
            return;
        }
        if (e.key === '1') {
            selectSailControl(SAIL_CONTROLS.DEPLOYMENT);
            return;
        }
        if (e.key === '2') {
            selectSailControl(SAIL_CONTROLS.YAW);
            return;
        }
        if (e.key === '3') {
            selectSailControl(SAIL_CONTROLS.PITCH);
            return;
        }

        // Resolution mode cycling with F
        if (e.key === 'f' || e.key === 'F') {
            cycleResolutionMode();
            return;
        }

        // Arrow key adjustments for selected control
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();  // Prevent page scroll
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            const mode = fineTuneState.resolutionMode;

            switch (fineTuneState.selectedControl) {
                case SAIL_CONTROLS.SAIL_COUNT:
                    if (sailCountSlider) {
                        const currentCount = parseInt(sailCountSlider.value, 10);
                        const newCount = Math.max(1, Math.min(50, currentCount + direction * mode.sailCountStep));
                        sailCountSlider.value = newCount;
                        sailCountSlider.dispatchEvent(new Event('input'));
                    }
                    break;
                case SAIL_CONTROLS.DEPLOYMENT:
                    if (deploySlider) {
                        const currentDeploy = parseFloat(deploySlider.value);
                        const newDeploy = Math.max(0, Math.min(100, currentDeploy + direction * mode.deployStep));
                        deploySlider.value = newDeploy;
                        deploySlider.dispatchEvent(new Event('input'));
                    }
                    break;
                case SAIL_CONTROLS.YAW:
                    if (angleSlider) {
                        const currentAngle = parseFloat(angleSlider.value);
                        const newAngle = Math.max(-90, Math.min(90, currentAngle + direction * mode.angleStep));
                        angleSlider.value = newAngle;
                        angleSlider.dispatchEvent(new Event('input'));
                    }
                    break;
                case SAIL_CONTROLS.PITCH:
                    if (pitchSlider) {
                        const currentPitch = parseFloat(pitchSlider.value);
                        const newPitch = Math.max(-90, Math.min(90, currentPitch + direction * mode.angleStep));
                        pitchSlider.value = newPitch;
                        pitchSlider.dispatchEvent(new Event('input'));
                    }
                    break;
            }
            return;
        }

        // Sail yaw angle adjustments with [ and ]
        // Negative = retrograde (lower orbit), Positive = prograde (raise orbit)
        if (e.key === '[' && angleSlider) {
            angleSlider.value = Math.max(-90, parseInt(angleSlider.value) - 5);
            angleSlider.dispatchEvent(new Event('input'));
        }
        if (e.key === ']' && angleSlider) {
            angleSlider.value = Math.min(90, parseInt(angleSlider.value) + 5);
            angleSlider.dispatchEvent(new Event('input'));
        }
        // Sail pitch angle adjustments with { and } (Shift+[ and Shift+])
        // Negative = thrust toward orbital south, Positive = thrust toward orbital north
        if (e.key === '{' && pitchSlider) {
            pitchSlider.value = Math.max(-90, parseInt(pitchSlider.value) - 5);
            pitchSlider.dispatchEvent(new Event('input'));
        }
        if (e.key === '}' && pitchSlider) {
            pitchSlider.value = Math.min(90, parseInt(pitchSlider.value) + 5);
            pitchSlider.dispatchEvent(new Event('input'));
        }
        // Sail deployment with - and =
        if (e.key === '-' && deploySlider) {
            deploySlider.value = Math.max(0, parseInt(deploySlider.value) - 10);
            deploySlider.dispatchEvent(new Event('input'));
        }
        if (e.key === '=' && deploySlider) {
            deploySlider.value = Math.min(100, parseInt(deploySlider.value) + 10);
            deploySlider.dispatchEvent(new Event('input'));
        }
    });
}

/**
 * Handle camera panning with rotation compensation
 * Uses INVERSE rotation matrix to convert screen-space deltas to world-space
 * @param {MouseEvent} e
 */
function handlePan(e) {
    const deltaX = e.clientX - dragState.lastX;
    const deltaY = e.clientY - dragState.lastY;

    const scale = getScale();
    const effectiveScale = scale * camera.zoom;

    // Convert screen delta to view-space delta
    const viewDeltaX = -deltaX / effectiveScale;
    const viewDeltaY = deltaY / effectiveScale;

    // Apply INVERSE rotation to convert screen-space to world-space
    // When view is rotated by angleZ, we need the transpose (inverse) of the rotation matrix
    const cosZ = Math.cos(camera.angleZ);
    const sinZ = Math.sin(camera.angleZ);

    // Inverse rotation matrix (transpose of forward rotation):
    // [cos(θ)   sin(θ)]   instead of   [cos(θ)  -sin(θ)]
    // [-sin(θ)  cos(θ)]                 [sin(θ)   cos(θ)]
    const worldDeltaX = viewDeltaX * cosZ + viewDeltaY * sinZ;
    const worldDeltaY = -viewDeltaX * sinZ + viewDeltaY * cosZ;

    camera.target.x += worldDeltaX;
    camera.target.y += worldDeltaY;

    dragState.lastX = e.clientX;
    dragState.lastY = e.clientY;
}

/**
 * Handle camera rotation from mouse drag
 * @param {MouseEvent} e
 */
function handleRotation(e) {
    const deltaX = e.clientX - rotateState.lastX;
    const deltaY = e.clientY - rotateState.lastY;

    // Rotation sensitivity (radians per pixel)
    const sensitivity = 0.005;

    // Horizontal drag: orbital rotation around Z-axis
    camera.angleZ += deltaX * sensitivity;

    // Normalize angleZ to [0, 2*PI) range
    camera.angleZ = camera.angleZ % (2 * Math.PI);
    if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;

    // Vertical drag: tilt adjustment (pitch around X-axis)
    camera.angleX -= deltaY * sensitivity;

    // Clamp tilt between 0° (top-down) and 90° (edge-on)
    const minTilt = 0;
    const maxTilt = Math.PI / 2;
    camera.angleX = Math.max(minTilt, Math.min(maxTilt, camera.angleX));

    rotateState.lastX = e.clientX;
    rotateState.lastY = e.clientY;

    // Clear planet texture cache when camera rotates
    clearPlanetTextureCache();
}

// ============================================================================
// Touch Gesture Handlers (Mobile)
// ============================================================================

/**
 * Handle camera panning from single-finger touch drag
 * Mirrors handlePan() logic with touch coordinates
 * @param {Touch} touch - Active touch point
 */
function handleTouchPan(touch) {
    const deltaX = touch.clientX - touchState.lastCenter.x;
    const deltaY = touch.clientY - touchState.lastCenter.y;

    const scale = getScale();
    const effectiveScale = scale * camera.zoom;

    // Convert screen delta to view-space delta
    const viewDeltaX = -deltaX / effectiveScale;
    const viewDeltaY = deltaY / effectiveScale;

    // Apply inverse rotation to convert screen-space to world-space
    const cosZ = Math.cos(camera.angleZ);
    const sinZ = Math.sin(camera.angleZ);

    camera.target.x += viewDeltaX * cosZ + viewDeltaY * sinZ;
    camera.target.y += -viewDeltaX * sinZ + viewDeltaY * cosZ;

    touchState.lastCenter.x = touch.clientX;
    touchState.lastCenter.y = touch.clientY;
}

/**
 * Handle camera rotation from two-finger drag
 * Center point movement controls rotation
 * @param {Touch[]} touches - Array of two active touch points
 */
function handleTouchRotate(touches) {
    const centerX = (touches[0].clientX + touches[1].clientX) / 2;
    const centerY = (touches[0].clientY + touches[1].clientY) / 2;

    const deltaX = centerX - touchState.lastCenter.x;
    const deltaY = centerY - touchState.lastCenter.y;

    // Rotation sensitivity (same as mouse)
    const sensitivity = 0.005;

    // Horizontal drag: orbital rotation around Z-axis
    camera.angleZ += deltaX * sensitivity;
    camera.angleZ = camera.angleZ % (2 * Math.PI);
    if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;

    // Vertical drag: tilt adjustment
    camera.angleX -= deltaY * sensitivity;
    camera.angleX = Math.max(0, Math.min(Math.PI / 2, camera.angleX));

    touchState.lastCenter.x = centerX;
    touchState.lastCenter.y = centerY;

    // Clear planet texture cache when camera rotates
    clearPlanetTextureCache();
}

/**
 * Handle pinch-to-zoom gesture
 * Distance between fingers controls zoom level
 * @param {Touch[]} touches - Array of two active touch points
 */
function handlePinchZoom(touches) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    // Require minimum initial distance to avoid division issues
    if (touchState.initialPinchDist > 10) {
        const scale = currentDist / touchState.initialPinchDist;
        camera.zoom = touchState.initialZoom * scale;
        // Clamp zoom to valid range
        camera.zoom = Math.max(0.1, Math.min(1000, camera.zoom));
    }
}

/**
 * Set up touch controls for mobile devices
 * @param {HTMLCanvasElement} canvas
 */
function initTouchControls(canvas) {
    // Touchstart - initialize gesture
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchState.touches = Array.from(e.touches);

        if (touchState.touches.length === 1) {
            // Single finger: pan mode
            touchState.gestureMode = 'pan';
            touchState.lastCenter.x = touchState.touches[0].clientX;
            touchState.lastCenter.y = touchState.touches[0].clientY;
            stopFollowing();
        } else if (touchState.touches.length >= 2) {
            // Two fingers: rotate + pinch mode
            touchState.gestureMode = 'rotate';

            // Initialize pinch distance
            const dx = touchState.touches[1].clientX - touchState.touches[0].clientX;
            const dy = touchState.touches[1].clientY - touchState.touches[0].clientY;
            touchState.initialPinchDist = Math.sqrt(dx * dx + dy * dy);
            touchState.initialZoom = camera.zoom;

            // Set center point
            touchState.lastCenter.x = (touchState.touches[0].clientX + touchState.touches[1].clientX) / 2;
            touchState.lastCenter.y = (touchState.touches[0].clientY + touchState.touches[1].clientY) / 2;
        }
    }, { passive: false });

    // Touchmove - handle gestures
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        touchState.touches = Array.from(e.touches);

        if (touchState.gestureMode === 'pan' && touchState.touches.length === 1) {
            handleTouchPan(touchState.touches[0]);
        } else if (touchState.gestureMode === 'rotate' && touchState.touches.length >= 2) {
            handleTouchRotate(touchState.touches);
            handlePinchZoom(touchState.touches);
        }
    }, { passive: false });

    // Touchend - handle finger release
    canvas.addEventListener('touchend', (e) => {
        touchState.touches = Array.from(e.touches);

        if (touchState.touches.length === 0) {
            // All fingers released
            touchState.gestureMode = null;
            touchState.initialPinchDist = 0;
        } else if (touchState.touches.length === 1 && touchState.gestureMode === 'rotate') {
            // Transition from rotate to pan (one finger lifted)
            touchState.gestureMode = 'pan';
            touchState.lastCenter.x = touchState.touches[0].clientX;
            touchState.lastCenter.y = touchState.touches[0].clientY;
        }
    }, { passive: false });

    // Touchcancel - reset state
    canvas.addEventListener('touchcancel', () => {
        touchState.touches = [];
        touchState.gestureMode = null;
        touchState.initialPinchDist = 0;
    }, { passive: false });
}

/**
 * Set up mouse controls (wheel zoom, drag to pan, right-drag to rotate)
 * @param {HTMLCanvasElement} canvas
 */
function initMouseControls(canvas) {
    // Prevent context menu on canvas to allow right-click rotation
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Wheel zoom
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        camera.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
        // Increased max zoom to 1000 to support close planetary approaches with scale-based rendering
        // At tactical (10000 px/AU) with 1000× zoom = 10,000,000 px/AU (very close orbital view)
        camera.zoom = Math.max(0.1, Math.min(1000, camera.zoom));
    });

    // Mousedown - with mutual exclusion to prevent simultaneous pan+rotate
    canvas.addEventListener('mousedown', e => {
        if (e.button === MOUSE_BUTTON.LEFT && !rotateState.isRotating) {
            // Left-click: start panning (only if not already rotating)
            dragState.isDragging = true;
            dragState.lastX = e.clientX;
            dragState.lastY = e.clientY;
            canvas.style.cursor = 'grabbing';
            stopFollowing();
        } else if (e.button === MOUSE_BUTTON.RIGHT && !dragState.isDragging) {
            // Right-click: start rotating (only if not already panning)
            rotateState.isRotating = true;
            rotateState.lastX = e.clientX;
            rotateState.lastY = e.clientY;
            canvas.style.cursor = 'move';
        }
    });

    // Mousemove - handle pan and rotate
    canvas.addEventListener('mousemove', e => {
        if (dragState.isDragging) {
            handlePan(e);
        }
        if (rotateState.isRotating) {
            handleRotation(e);
        }
    });

    // Mouseup - end actions
    canvas.addEventListener('mouseup', e => {
        if (e.button === MOUSE_BUTTON.LEFT) {
            dragState.isDragging = false;
        } else if (e.button === MOUSE_BUTTON.RIGHT) {
            rotateState.isRotating = false;
        }
        if (!dragState.isDragging && !rotateState.isRotating) {
            canvas.style.cursor = 'default';
        }
    });

    // Mouseleave - only reset cursor, preserve state
    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
    });

    // Mouseenter - check if buttons released while off-canvas
    canvas.addEventListener('mouseenter', e => {
        // e.buttons bitmask: 1 = left, 2 = right, 4 = middle
        if (dragState.isDragging && !(e.buttons & 1)) {
            dragState.isDragging = false;
        }
        if (rotateState.isRotating && !(e.buttons & 2)) {
            rotateState.isRotating = false;
        }
    });
}

/**
 * Populate the object list in the left panel
 */
export function populateObjectList() {
    const list = document.getElementById('objectList');
    if (!list) return;

    list.innerHTML = '';

    [...getVisibleBodies(), ...ships].forEach(obj => {
        const item = document.createElement('div');
        item.className = 'object-item' + (obj.name === destination ? ' selected' : '');
        item.innerHTML = `
            <div class="object-icon ${obj.type}"></div>
            <span>${obj.name}</span>
        `;
        item.addEventListener('click', () => {
            document.querySelectorAll('.object-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            
            // Set camera focus to selected object
            setFocusTarget(obj.name);
            setCameraFollow(obj.name);
            
            if (obj.type !== 'ship') {
                setDestination(obj.name);
                setDestinationName(obj.name);
                generateFlightPath();
            }
        });
        list.appendChild(item);
    });
}

/**
 * Set up autopilot toggle button
 */
function initAutoPilotControls() {
    const toggleBtn = document.getElementById('autoPilotToggle');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const newState = !isAutoPilotEnabled();
            setAutoPilotEnabled(newState);
            updateAutoPilotUI(newState);
        });
    }
}

/**
 * Set up encounter mode selector buttons
 */
function initEncounterModeControls() {
    const insertionBtn = document.getElementById('modeOrbitalInsertion');
    const slingshotBtn = document.getElementById('modeGravitySlingshot');
    const statusText = document.getElementById('encounterModeStatus');

    function updateModeUI(mode) {
        if (insertionBtn) {
            insertionBtn.classList.toggle('active', mode === AUTOPILOT_MODES.ORBITAL_INSERTION);
        }
        if (slingshotBtn) {
            slingshotBtn.classList.toggle('active', mode === AUTOPILOT_MODES.GRAVITY_SLINGSHOT);
        }
        if (statusText) {
            const text = statusText.querySelector('.mode-status-text');
            if (text) {
                if (mode === AUTOPILOT_MODES.ORBITAL_INSERTION) {
                    text.textContent = 'Thruster fires retrograde at periapsis to capture';
                } else {
                    text.textContent = 'Thruster fires prograde at periapsis to boost exit';
                }
            }
        }
    }

    if (insertionBtn) {
        insertionBtn.addEventListener('click', () => {
            setAutoPilotMode(AUTOPILOT_MODES.ORBITAL_INSERTION);
            updateModeUI(AUTOPILOT_MODES.ORBITAL_INSERTION);
        });
    }

    if (slingshotBtn) {
        slingshotBtn.addEventListener('click', () => {
            setAutoPilotMode(AUTOPILOT_MODES.GRAVITY_SLINGSHOT);
            updateModeUI(AUTOPILOT_MODES.GRAVITY_SLINGSHOT);
        });
    }

    // Set initial UI state
    updateModeUI(getAutoPilotMode());
}

// Course Plotter feature removed

/**
 * Set up thruster controls for orbital insertion and gravity assist
 */
function initThrusterControls() {
    const retroBtn = document.getElementById('thrusterRetrograde');
    const proBtn = document.getElementById('thrusterPrograde');
    const burnSlider = document.getElementById('thrusterBurnSize');
    const burnValue = document.getElementById('thrusterBurnValue');
    const deltaVDisplay = document.getElementById('thrusterDeltaV');
    const fuelFill = document.getElementById('thrusterFuelFill');
    const lastBurnDisplay = document.getElementById('thrusterLastBurn');

    // Burn size slider
    if (burnSlider) {
        burnSlider.addEventListener('input', () => {
            const value = parseFloat(burnSlider.value);
            const player = getPlayerShip();
            if (player) {
                setThrusterBurnSize(player, value);
            }
            if (burnValue) {
                burnValue.textContent = value.toFixed(1) + ' km/s';
            }
        });
    }

    // Retrograde burn (orbital insertion)
    if (retroBtn) {
        retroBtn.addEventListener('click', () => {
            const player = getPlayerShip();
            if (!player) return;

            const result = fireThruster(player, 'retrograde');
            handleThrusterResult(result, 'RETROGRADE', retroBtn);
        });
    }

    // Prograde burn (gravity assist)
    if (proBtn) {
        proBtn.addEventListener('click', () => {
            const player = getPlayerShip();
            if (!player) return;

            const result = fireThruster(player, 'prograde');
            handleThrusterResult(result, 'PROGRADE', proBtn);
        });
    }

    /**
     * Handle thruster burn result: update UI, show feedback
     */
    function handleThrusterResult(result, label, btn) {
        const player = getPlayerShip();

        // Flash the button
        btn.classList.add('firing');
        setTimeout(() => btn.classList.remove('firing'), 300);

        if (result.success) {
            // Show last burn result
            if (lastBurnDisplay) {
                lastBurnDisplay.textContent =
                    `${label}: -${result.deltaVApplied.toFixed(2)} km/s | e=${result.newEccentricity.toFixed(4)}`;
                lastBurnDisplay.classList.add('success');
                lastBurnDisplay.classList.remove('empty');
                setTimeout(() => lastBurnDisplay.classList.remove('success'), 2000);
            }

            // Update sail display too (thrust info may change)
            updateSailDisplay();
        } else {
            if (lastBurnDisplay) {
                lastBurnDisplay.textContent = `NO FUEL - ${result.reason || 'empty'}`;
                lastBurnDisplay.classList.add('empty');
                lastBurnDisplay.classList.remove('success');
            }
        }
    }
}

// Course Plotter and Launch Windows features removed

/**
 * Set up save/load game state controls
 */
function initSaveLoadControls() {
    const saveLoadBtn = document.getElementById('saveLoadBtn');
    const saveLoadModal = document.getElementById('saveLoadModal');
    const saveLoadClose = document.getElementById('saveLoadClose');
    const saveStateBtn = document.getElementById('saveStateBtn');
    const loadStateBtn = document.getElementById('loadStateBtn');
    const loadFileBtn = document.getElementById('loadFileBtn');
    const saveFileSelect = document.getElementById('saveFileSelect');
    const saveStateText = document.getElementById('saveStateText');
    const saveLoadStatus = document.getElementById('saveLoadStatus');

    // Populate save file dropdown from index
    async function refreshSaveFileList() {
        if (!saveFileSelect) return;
        try {
            const files = await fetchSaveIndex();
            // Clear existing options except the placeholder
            saveFileSelect.innerHTML = '<option value="">-- Select a save file --</option>';
            for (const file of files) {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file.replace(/\.json$/, '');
                saveFileSelect.appendChild(option);
            }
        } catch (error) {
            console.warn('Could not load save file index:', error.message);
        }
    }

    // Open modal
    if (saveLoadBtn) {
        saveLoadBtn.addEventListener('click', () => {
            saveLoadModal?.classList.add('active');
            saveLoadStatus.textContent = '';
            saveLoadStatus.className = 'save-load-status';
            refreshSaveFileList();
        });
    }

    // Close modal
    if (saveLoadClose) {
        saveLoadClose.addEventListener('click', () => {
            saveLoadModal?.classList.remove('active');
        });
    }

    // Close on backdrop click
    if (saveLoadModal) {
        saveLoadModal.addEventListener('click', (e) => {
            if (e.target === saveLoadModal) {
                saveLoadModal.classList.remove('active');
            }
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && saveLoadModal?.classList.contains('active')) {
            saveLoadModal.classList.remove('active');
        }
    });

    // Load from file dropdown
    if (loadFileBtn) {
        loadFileBtn.addEventListener('click', async () => {
            const filename = saveFileSelect?.value;
            if (!filename) {
                saveLoadStatus.textContent = 'Please select a save file first.';
                saveLoadStatus.className = 'save-load-status error';
                return;
            }

            try {
                await loadSaveFile(filename);
                saveLoadStatus.textContent = `Loaded: ${filename}`;
                saveLoadStatus.className = 'save-load-status success';

                populateObjectList();

                setTimeout(() => {
                    saveLoadModal?.classList.remove('active');
                }, 1000);
            } catch (error) {
                console.error('Load file error:', error);
                saveLoadStatus.textContent = `Load failed: ${error.message}`;
                saveLoadStatus.className = 'save-load-status error';
            }
        });
    }

    // Export state button
    if (saveStateBtn) {
        saveStateBtn.addEventListener('click', () => {
            try {
                const json = exportGameState();
                if (saveStateText) {
                    saveStateText.value = json;
                    saveStateText.select();
                }
                saveLoadStatus.textContent = 'State exported. Copy the JSON above to save.';
                saveLoadStatus.className = 'save-load-status success';
            } catch (error) {
                console.error('Export error:', error);
                saveLoadStatus.textContent = `Export failed: ${error.message}`;
                saveLoadStatus.className = 'save-load-status error';
            }
        });
    }

    // Import from text button
    if (loadStateBtn) {
        loadStateBtn.addEventListener('click', () => {
            const json = saveStateText?.value?.trim();
            if (!json) {
                saveLoadStatus.textContent = 'Please paste a saved game state JSON first.';
                saveLoadStatus.className = 'save-load-status error';
                return;
            }

            try {
                importGameState(json);
                saveLoadStatus.textContent = 'State loaded successfully!';
                saveLoadStatus.className = 'save-load-status success';

                populateObjectList();

                setTimeout(() => {
                    saveLoadModal?.classList.remove('active');
                }, 1000);
            } catch (error) {
                console.error('Import error:', error);
                saveLoadStatus.textContent = `Import failed: ${error.message}`;
                saveLoadStatus.className = 'save-load-status error';
            }
        });
    }
}

/**
 * Update autopilot UI elements based on state
 * @param {boolean} enabled
 */
function updateAutoPilotUI(enabled) {
    const toggleBtn = document.getElementById('autoPilotToggle');
    const statusDisplay = document.getElementById('autoPilotStatusDisplay');
    const encounterSection = document.querySelector('.encounter-mode-section');
    const label = toggleBtn?.querySelector('.autopilot-label');

    if (enabled) {
        toggleBtn?.classList.add('engaged');
        statusDisplay?.classList.add('engaged');
        encounterSection?.classList.add('engaged');
        if (label) label.textContent = 'DISENGAGE';
    } else {
        toggleBtn?.classList.remove('engaged');
        statusDisplay?.classList.remove('engaged');
        encounterSection?.classList.remove('engaged');
        if (label) label.textContent = 'ENGAGE';
    }

    updateAutoPilotStatusText();
}

/**
 * Update the autopilot status text display.
 * Autopilot only fires thrusters - shows thruster-related status.
 */
function updateAutoPilotStatusText() {
    const statusDisplay = document.getElementById('autoPilotStatusDisplay');
    const statusText = statusDisplay?.querySelector('.status-text');

    if (!statusText) return;

    if (!isAutoPilotEnabled()) {
        statusText.textContent = 'THRUSTERS: MANUAL';
        return;
    }

    const player = getPlayerShip();
    if (!player) {
        statusText.textContent = 'NO SHIP';
        return;
    }

    const phase = getAutoPilotPhase();

    // Only CAPTURE and SLINGSHOT phases fire thrusters
    if (phase === AUTOPILOT_PHASES.CAPTURE || phase === AUTOPILOT_PHASES.SLINGSHOT) {
        const plan = phase === AUTOPILOT_PHASES.CAPTURE
            ? computeCapturePlan()
            : computeSlingshotPlan();

        if (plan?.thrusterAction) {
            const dir = plan.thrusterAction.direction.toUpperCase();
            if (plan.thrusterAction.when === 'NOW') {
                statusText.textContent = `${phase}: ${dir} BURN`;
            } else {
                statusText.textContent = `${phase}: ${dir} @ PERIAPSIS`;
            }
        } else {
            statusText.textContent = `${phase}: STANDBY`;
        }
    } else {
        statusText.textContent = 'THRUSTERS: ARMED';
    }
}

/**
 * Determine the appropriate autopilot phase based on current state and encounter mode.
 *
 * Phase transitions:
 * - CRUISE: Far from destination, optimize for intercept
 * - APPROACH: Within 10x SOI radius, optimize for velocity matching
 * - CAPTURE: Inside SOI with ORBITAL_INSERTION mode, circularize orbit
 * - SLINGSHOT: Inside SOI with GRAVITY_SLINGSHOT mode, maximize flyby assist
 * - ESCAPE: Inside SOI but want to leave (manual override)
 *
 * @returns {string} Appropriate phase from AUTOPILOT_PHASES
 */
function determineAutopilotPhase() {
    const player = getPlayerShip();
    if (!player) return AUTOPILOT_PHASES.CRUISE;

    // If inside SOI, phase depends on encounter mode
    if (player.soiState?.isInSOI) {
        const currentPhase = getAutoPilotPhase();
        // Respect manual ESCAPE override
        if (currentPhase === AUTOPILOT_PHASES.ESCAPE) {
            return AUTOPILOT_PHASES.ESCAPE;
        }
        // Use encounter mode to determine phase
        const mode = getAutoPilotMode();
        if (mode === AUTOPILOT_MODES.GRAVITY_SLINGSHOT) {
            return AUTOPILOT_PHASES.SLINGSHOT;
        }
        return AUTOPILOT_PHASES.CAPTURE;
    }

    // Check distance to destination SOI
    const info = getDestinationInfo();
    if (!info || !info.soiRadius) {
        return AUTOPILOT_PHASES.CRUISE;
    }

    // Approach phase when close to destination
    const approachThreshold = info.soiRadius * 10;
    if (info.distance < approachThreshold) {
        return AUTOPILOT_PHASES.APPROACH;
    }

    return AUTOPILOT_PHASES.CRUISE;
}

// Cooldown for autopilot thruster firing (prevents rapid-fire burns)
let lastAutopilotThrusterTime = 0;
const AUTOPILOT_THRUSTER_COOLDOWN = 500;       // ms between auto-fires (normal orbits)
const AUTOPILOT_THRUSTER_COOLDOWN_FAST = 100;   // ms between auto-fires (extreme flybys)

/**
 * Update autopilot - call this each frame to auto-fire thrusters for orbital insertion
 * and gravity assist maneuvers.
 *
 * The autopilot does NOT adjust sail settings - that is the course plotter's job.
 * Autopilot only fires thrusters when inside a body's SOI:
 * - CAPTURE: Auto-fires retrograde thruster at periapsis to circularize orbit
 * - SLINGSHOT: Auto-fires prograde thruster at periapsis to boost exit velocity
 *
 * @param {number} deltaTime - Time since last frame in days
 */
export function updateAutoPilot(deltaTime) {
    if (!isAutoPilotEnabled()) return;

    const player = getPlayerShip();
    if (!player?.sail) return;

    // Determine appropriate phase
    const phase = determineAutopilotPhase();
    setAutoPilotPhase(phase);

    // Only get thruster-relevant plans (CAPTURE and SLINGSHOT phases)
    let plan;
    switch (phase) {
        case AUTOPILOT_PHASES.CAPTURE:
            plan = computeCapturePlan();
            break;
        case AUTOPILOT_PHASES.SLINGSHOT:
            plan = computeSlingshotPlan();
            break;
        default:
            // No thruster action needed outside SOI
            updateAutoPilotStatusText();
            return;
    }

    if (!plan) {
        updateAutoPilotStatusText();
        return;
    }

    // Auto-fire thruster if plan recommends it
    if (plan.thrusterAction) {
        const shouldFire = plan.thrusterAction.when === 'NOW' ||
                          (plan.thrusterAction.when === 'AT_PERIAPSIS' && plan.nearPeriapsis);

        if (shouldFire) {
            const now = Date.now();
            // Use fast cooldown for extreme flybys (e > 50) - ship traverses SOI in seconds
            const ecc = plan.eccentricity || 0;
            const cooldown = ecc > 50 ? AUTOPILOT_THRUSTER_COOLDOWN_FAST : AUTOPILOT_THRUSTER_COOLDOWN;
            if (now - lastAutopilotThrusterTime > cooldown) {
                const result = fireThruster(player, plan.thrusterAction.direction);
                if (result.success) {
                    lastAutopilotThrusterTime = now;
                    const label = plan.thrusterAction.direction.toUpperCase();
                    console.log(`[AUTOPILOT] Auto-fired ${label} thruster: ΔV=${result.deltaVApplied.toFixed(2)} km/s, e=${result.newEccentricity.toFixed(4)}`);

                    // Update thruster UI
                    const lastBurnDisplay = document.getElementById('thrusterLastBurn');
                    if (lastBurnDisplay) {
                        lastBurnDisplay.textContent =
                            `AUTO ${label}: -${result.deltaVApplied.toFixed(2)} km/s | e=${result.newEccentricity.toFixed(4)}`;
                        lastBurnDisplay.classList.add('success');
                        lastBurnDisplay.classList.remove('empty');
                        setTimeout(() => lastBurnDisplay.classList.remove('success'), 2000);
                    }
                    updateSailDisplay();
                }
            }
        }
    }

    // Update status text
    updateAutoPilotStatusText();
}

// ============================================================================
// Mobile Quick Actions
// ============================================================================

// Track current speed preset index for cycling
let currentSpeedIndex = 1; // Start at 1x
const SPEED_PRESETS = ['pause', '1x', '100x', '10000x', '100000x', '1000000x'];
const SPEED_ICONS = ['⏸', '▶', '▶▶', '⏩', '⏩⏩', '🚀'];

// Track current zoom index for cycling
let currentZoomIndex = 1; // Start at inner
const ZOOM_PRESETS = ['system', 'inner', 'local', 'tactical'];

/**
 * Initialize mobile quick action buttons
 * These provide quick access to common controls on mobile devices
 */
export function initMobileControls() {
    const zoomOutBtn = document.getElementById('mobileZoomOut');
    const zoomInBtn = document.getElementById('mobileZoomIn');
    const pauseBtn = document.getElementById('mobilePause');
    const speedBtn = document.getElementById('mobileSpeed');
    const autopilotBtn = document.getElementById('mobileAutopilot');

    // Zoom out button
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            currentZoomIndex = Math.max(0, currentZoomIndex - 1);
            setZoom(ZOOM_PRESETS[currentZoomIndex]);
            updateMobileZoomUI();
        });
    }

    // Zoom in button
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            currentZoomIndex = Math.min(ZOOM_PRESETS.length - 1, currentZoomIndex + 1);
            setZoom(ZOOM_PRESETS[currentZoomIndex]);
            updateMobileZoomUI();
        });
    }

    // Pause button
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            const isPaused = currentSpeedIndex === 0;
            if (isPaused) {
                // Unpause - go to 1x
                currentSpeedIndex = 1;
            } else {
                // Pause
                currentSpeedIndex = 0;
            }
            setSpeed(SPEED_PRESETS[currentSpeedIndex]);
            updateMobileSpeedUI();
        });
    }

    // Speed cycle button
    if (speedBtn) {
        speedBtn.addEventListener('click', () => {
            // Cycle through non-pause speeds (1-5)
            if (currentSpeedIndex === 0) {
                currentSpeedIndex = 1;
            } else {
                currentSpeedIndex = (currentSpeedIndex % (SPEED_PRESETS.length - 1)) + 1;
            }
            setSpeed(SPEED_PRESETS[currentSpeedIndex]);
            updateMobileSpeedUI();
        });
    }

    // Autopilot toggle button
    if (autopilotBtn) {
        autopilotBtn.addEventListener('click', () => {
            const newState = !isAutoPilotEnabled();
            setAutoPilotEnabled(newState);
            updateAutoPilotUI(newState);
            updateMobileAutopilotUI(newState);
        });
    }

    // Initial UI state
    updateMobileSpeedUI();
    updateMobileAutopilotUI(isAutoPilotEnabled());
}

/**
 * Update mobile zoom button states
 */
function updateMobileZoomUI() {
    const zoomOutBtn = document.getElementById('mobileZoomOut');
    const zoomInBtn = document.getElementById('mobileZoomIn');

    // Update disabled states at boundaries
    if (zoomOutBtn) {
        zoomOutBtn.style.opacity = currentZoomIndex === 0 ? '0.5' : '1';
    }
    if (zoomInBtn) {
        zoomInBtn.style.opacity = currentZoomIndex === ZOOM_PRESETS.length - 1 ? '0.5' : '1';
    }

    // Sync desktop zoom buttons
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.zoom === ZOOM_PRESETS[currentZoomIndex]);
    });
}

/**
 * Update mobile speed button states
 */
function updateMobileSpeedUI() {
    const pauseBtn = document.getElementById('mobilePause');
    const speedBtn = document.getElementById('mobileSpeed');

    const isPaused = currentSpeedIndex === 0;

    if (pauseBtn) {
        const icon = pauseBtn.querySelector('.icon');
        if (icon) {
            icon.textContent = isPaused ? '▶' : '⏸';
        }
        pauseBtn.classList.toggle('active', isPaused);
    }

    if (speedBtn) {
        const icon = speedBtn.querySelector('.icon');
        const label = speedBtn.querySelector('span:last-child');
        if (icon && currentSpeedIndex > 0) {
            icon.textContent = SPEED_ICONS[currentSpeedIndex];
        }
        if (label) {
            label.textContent = SPEED_PRESETS[currentSpeedIndex].toUpperCase();
        }
    }

    // Sync desktop speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.speed === SPEED_PRESETS[currentSpeedIndex]);
    });
}

/**
 * Update mobile autopilot button state
 * @param {boolean} enabled
 */
function updateMobileAutopilotUI(enabled) {
    const autopilotBtn = document.getElementById('mobileAutopilot');

    if (autopilotBtn) {
        autopilotBtn.classList.toggle('active', enabled);
        const icon = autopilotBtn.querySelector('.icon');
        if (icon) {
            icon.textContent = enabled ? '◉' : '◎';
        }
    }
}

// ============================================================================
// Mobile Floating Sail Widget
// ============================================================================

/**
 * Initialize the mobile floating sail widget
 * Provides compact sail controls that float over the map on mobile devices
 */
export function initMobileSailWidget() {
    const widget = document.getElementById('mobileSailWidget');
    const toggle = document.getElementById('sailWidgetToggle');
    const controls = document.getElementById('sailWidgetControls');

    if (!widget || !toggle) return;

    // Toggle widget expansion
    toggle.addEventListener('click', () => {
        widget.classList.toggle('expanded');
    });

    // Get mobile sliders
    const mobileDeploySlider = document.getElementById('mobileSailDeployment');
    const mobileYawSlider = document.getElementById('mobileSailYaw');
    const mobilePitchSlider = document.getElementById('mobileSailPitch');
    const mobileDeployValue = document.getElementById('mobileSailDeployValue');
    const mobileYawValue = document.getElementById('mobileSailYawValue');
    const mobilePitchValue = document.getElementById('mobileSailPitchValue');

    // Get desktop sliders for syncing
    const desktopDeploySlider = document.getElementById('sailDeployment');
    const desktopAngleSlider = document.getElementById('sailAngle');
    const desktopPitchSlider = document.getElementById('sailPitch');

    // Initialize mobile sliders from current ship state
    const player = getPlayerShip();
    if (player && player.sail) {
        if (mobileDeploySlider) {
            mobileDeploySlider.value = player.sail.deploymentPercent;
            if (mobileDeployValue) mobileDeployValue.textContent = Math.round(player.sail.deploymentPercent) + '%';
        }
        if (mobileYawSlider) {
            const yawDeg = Math.round(player.sail.angle * 180 / Math.PI);
            mobileYawSlider.value = yawDeg;
            if (mobileYawValue) mobileYawValue.textContent = yawDeg + '°';
        }
        if (mobilePitchSlider) {
            const pitchDeg = Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI);
            mobilePitchSlider.value = pitchDeg;
            if (mobilePitchValue) mobilePitchValue.textContent = pitchDeg + '°';
        }
    }

    // Deployment slider handler
    if (mobileDeploySlider) {
        mobileDeploySlider.addEventListener('input', () => {
            const value = parseInt(mobileDeploySlider.value, 10);
            const player = getPlayerShip();
            if (player) {
                setSailDeployment(player, value);
            }
            if (mobileDeployValue) {
                mobileDeployValue.textContent = value + '%';
            }
            // Sync desktop slider
            if (desktopDeploySlider) {
                desktopDeploySlider.value = value;
            }
            updateSailDisplay();
        });
    }

    // Yaw slider handler
    if (mobileYawSlider) {
        mobileYawSlider.addEventListener('input', () => {
            const degrees = parseInt(mobileYawSlider.value, 10);
            const radians = degrees * Math.PI / 180;
            const player = getPlayerShip();
            if (player) {
                setSailAngle(player, radians);
            }
            if (mobileYawValue) {
                mobileYawValue.textContent = degrees + '°';
            }
            // Sync desktop slider
            if (desktopAngleSlider) {
                desktopAngleSlider.value = degrees;
            }
            updateSailDisplay();
        });
    }

    // Pitch slider handler
    if (mobilePitchSlider) {
        mobilePitchSlider.addEventListener('input', () => {
            const degrees = parseInt(mobilePitchSlider.value, 10);
            const radians = degrees * Math.PI / 180;
            const player = getPlayerShip();
            if (player) {
                setSailPitch(player, radians);
            }
            if (mobilePitchValue) {
                mobilePitchValue.textContent = degrees + '°';
            }
            // Sync desktop slider
            if (desktopPitchSlider) {
                desktopPitchSlider.value = degrees;
            }
            updateSailDisplay();
        });
    }

    // Close widget when tapping outside (on mobile)
    document.addEventListener('click', (e) => {
        if (widget.classList.contains('expanded') &&
            !widget.contains(e.target)) {
            widget.classList.remove('expanded');
        }
    });
}
