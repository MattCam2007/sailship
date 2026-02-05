/**
 * Game state save/load functionality
 *
 * Serializes and deserializes the complete game state to/from JSON
 * for quick iteration on orbital maneuvers.
 */

import {
    time,
    julianDate,
    timeScale,
    currentSpeed,
    currentZoom,
    scale,
    displayOptions,
    bodyFilters,
    trajectoryConfig,
    focusTarget,
    autoPilotState,
    setSpeed,
    setZoom,
    setDisplayOption,
    setFocusTarget,
    setAutoPilotEnabled,
    setAutoPilotPhase,
    setTrajectoryDuration,
    setTime,
    setJulianDate,
} from './gameState.js';

import { destination, setDestination, clearInterceptCache, clearNavPlanCache } from './navigation.js';
import { getPlayerShip } from '../data/ships.js';
import { camera, setCameraFollow } from './camera.js';

// Version for save format compatibility
const SAVE_VERSION = 1;

/**
 * Serialize the complete game state to a JSON object.
 * @returns {Object} Complete game state
 */
export function serializeGameState() {
    const player = getPlayerShip();

    return {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),

        // Time state
        time: {
            gameDays: time,
            julianDate: julianDate,
            currentSpeed: currentSpeed,
        },

        // View state
        view: {
            zoom: currentZoom,
            focusTarget: focusTarget,
        },

        // Display options
        displayOptions: { ...displayOptions },

        // Body filters
        bodyFilters: { ...bodyFilters },

        // Trajectory configuration
        trajectoryConfig: {
            durationDays: trajectoryConfig.durationDays,
        },

        // Navigation
        navigation: {
            destination: destination,
        },

        // Autopilot
        autopilot: {
            enabled: autoPilotState.enabled,
            phase: autoPilotState.phase,
        },

        // Camera
        camera: {
            angleX: camera.angleX,
            angleZ: camera.angleZ,
            zoom: camera.zoom,
            target: { ...camera.target },
            followTarget: camera.followTarget,
        },

        // Player ship state
        ship: player ? {
            orbitalElements: player.orbitalElements ? { ...player.orbitalElements } : null,
            sail: player.sail ? {
                area: player.sail.area,
                reflectivity: player.sail.reflectivity,
                angle: player.sail.angle,
                pitchAngle: player.sail.pitchAngle,
                deploymentPercent: player.sail.deploymentPercent,
                condition: player.sail.condition,
                sailCount: player.sail.sailCount,
            } : null,
            soiState: player.soiState ? { ...player.soiState } : null,
            mass: player.mass,
        } : null,
    };
}

/**
 * Serialize game state to a JSON string.
 * @returns {string} JSON string of game state
 */
export function exportGameState() {
    const state = serializeGameState();
    return JSON.stringify(state, null, 2);
}

/**
 * Deserialize and apply game state from a JSON object.
 * @param {Object} state - Game state object
 * @throws {Error} If state is invalid or version mismatch
 */
export function deserializeGameState(state) {
    if (!state || typeof state !== 'object') {
        throw new Error('Invalid save state: not an object');
    }

    if (!state.version) {
        throw new Error('Invalid save state: missing version');
    }

    if (state.version > SAVE_VERSION) {
        throw new Error(`Save version ${state.version} is newer than supported version ${SAVE_VERSION}`);
    }

    // Restore time state
    if (state.time) {
        // We need to modify the module-level variables directly
        // This requires exporting setters or using a different pattern
        restoreTimeState(state.time);
    }

    // Restore view state
    if (state.view) {
        if (state.view.zoom) {
            setZoom(state.view.zoom);
        }
        setFocusTarget(state.view.focusTarget);
    }

    // Restore display options
    if (state.displayOptions) {
        for (const [key, value] of Object.entries(state.displayOptions)) {
            setDisplayOption(key, value);
            // Also update the UI checkboxes
            updateDisplayCheckbox(key, value);
        }
    }

    // Restore body filters
    if (state.bodyFilters) {
        Object.assign(bodyFilters, state.bodyFilters);
        updateBodyFilterCheckboxes(state.bodyFilters);
    }

    // Restore trajectory configuration
    if (state.trajectoryConfig && state.trajectoryConfig.durationDays) {
        setTrajectoryDuration(state.trajectoryConfig.durationDays);
        updateTrajectoryUI(state.trajectoryConfig.durationDays);
    }

    // Restore navigation
    if (state.navigation && state.navigation.destination) {
        setDestination(state.navigation.destination);
        clearInterceptCache();
        clearNavPlanCache();
    }

    // Restore autopilot
    if (state.autopilot) {
        setAutoPilotEnabled(state.autopilot.enabled);
        if (state.autopilot.phase) {
            setAutoPilotPhase(state.autopilot.phase);
        }
    }

    // Restore camera
    if (state.camera) {
        camera.angleX = state.camera.angleX ?? camera.angleX;
        camera.angleZ = state.camera.angleZ ?? camera.angleZ;
        camera.zoom = state.camera.zoom ?? camera.zoom;
        if (state.camera.target) {
            camera.target.x = state.camera.target.x ?? 0;
            camera.target.y = state.camera.target.y ?? 0;
            camera.target.z = state.camera.target.z ?? 0;
        }
        if (state.camera.followTarget !== undefined) {
            setCameraFollow(state.camera.followTarget);
        }
    }

    // Restore player ship
    if (state.ship) {
        const player = getPlayerShip();
        if (player) {
            if (state.ship.orbitalElements) {
                player.orbitalElements = { ...state.ship.orbitalElements };
            }
            if (state.ship.sail) {
                player.sail = { ...player.sail, ...state.ship.sail };
                updateSailUI(player.sail);
            }
            if (state.ship.soiState) {
                player.soiState = { ...state.ship.soiState };
            }
            if (state.ship.mass) {
                player.mass = state.ship.mass;
            }
        }
    }

    // Update zoom buttons
    updateZoomButtons(state.view?.zoom);

    // Update speed buttons
    updateSpeedButtons(state.time?.currentSpeed);

    // Center camera on navigation destination after load
    const dest = state.navigation?.destination;
    if (dest) {
        setCameraFollow(dest);
        setFocusTarget(dest);
    }
}

/**
 * Import game state from a JSON string.
 * @param {string} jsonString - JSON string of game state
 * @throws {Error} If JSON is invalid or state is invalid
 */
export function importGameState(jsonString) {
    let state;
    try {
        state = JSON.parse(jsonString);
    } catch (e) {
        throw new Error(`Invalid JSON: ${e.message}`);
    }

    deserializeGameState(state);
}

/**
 * Fetch the list of available save files from saves/index.json.
 * @returns {Promise<string[]>} Array of save file names
 */
export async function fetchSaveIndex() {
    const response = await fetch('saves/index.json');
    if (!response.ok) {
        throw new Error(`Failed to load save index: ${response.status}`);
    }
    return response.json();
}

/**
 * Load a save file by filename from the saves/ directory.
 * @param {string} filename - Name of the save file (e.g. "my-save.json")
 */
export async function loadSaveFile(filename) {
    const response = await fetch(`saves/${filename}`);
    if (!response.ok) {
        throw new Error(`Failed to load save file: ${response.status}`);
    }
    const state = await response.json();
    deserializeGameState(state);
}

// ============================================================================
// Time State Restoration
// ============================================================================

/**
 * Restore time state from save data.
 */
function restoreTimeState(timeState) {
    if (timeState.gameDays !== undefined) {
        setTime(timeState.gameDays);
    }
    if (timeState.julianDate !== undefined) {
        setJulianDate(timeState.julianDate);
    }
    if (timeState.currentSpeed) {
        setSpeed(timeState.currentSpeed);
    }
}

// ============================================================================
// UI Update Helpers
// ============================================================================

/**
 * Update a display option checkbox in the UI
 */
function updateDisplayCheckbox(key, value) {
    const checkboxMap = {
        showStarfield: 'showStarfield',
        showOrbits: 'showOrbits',
        showTargetOrbitOnly: 'showTargetOrbitOnly',
        showLabels: 'showLabels',
        showTrajectory: 'showTrajectory',
        showPredictedTrajectory: 'showPredictedTrajectory',
        showIntersectionMarkers: 'showIntersectionMarkers',
        showGrid: 'showGrid',
    };

    const checkboxId = checkboxMap[key];
    if (checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = value;
        }
    }
}

/**
 * Update body filter checkboxes in the UI
 */
function updateBodyFilterCheckboxes(filters) {
    const filterMap = {
        planet: 'filterPlanet',
        'dwarf-planet': 'filterDwarfPlanet',
        'major-moon': 'filterMajorMoon',
        'minor-moon': 'filterMinorMoon',
        asteroid: 'filterAsteroid',
    };

    for (const [key, checkboxId] of Object.entries(filterMap)) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox && filters[key] !== undefined) {
            checkbox.checked = filters[key];
        }
    }
}

/**
 * Update trajectory configuration UI
 */
function updateTrajectoryUI(durationDays) {
    const slider = document.getElementById('trajectoryDuration');
    const display = document.getElementById('trajectoryDurationValue');

    if (slider) {
        slider.value = durationDays;
    }

    if (display) {
        if (durationDays >= 365) {
            const years = (durationDays / 365).toFixed(1);
            display.textContent = `${years} years`;
        } else {
            display.textContent = `${durationDays} days`;
        }
    }
}

/**
 * Update sail control UI
 */
function updateSailUI(sail) {
    if (!sail) return;

    // Update sliders
    const sailAngle = document.getElementById('sailAngle');
    const sailPitch = document.getElementById('sailPitch');
    const sailDeployment = document.getElementById('sailDeployment');
    const sailCount = document.getElementById('sailCount');

    if (sailAngle) {
        sailAngle.value = sail.angle * (180 / Math.PI);
    }
    if (sailPitch) {
        sailPitch.value = (sail.pitchAngle || 0) * (180 / Math.PI);
    }
    if (sailDeployment) {
        sailDeployment.value = sail.deploymentPercent;
    }
    if (sailCount) {
        sailCount.value = sail.sailCount || 1;
    }

    // Update displays
    const sailAngleValue = document.getElementById('sailAngleValue');
    const sailPitchValue = document.getElementById('sailPitchValue');
    const sailDeployValue = document.getElementById('sailDeployValue');
    const sailCountValue = document.getElementById('sailCountValue');

    if (sailAngleValue) {
        sailAngleValue.textContent = `${(sail.angle * 180 / Math.PI).toFixed(1)}°`;
    }
    if (sailPitchValue) {
        sailPitchValue.textContent = `${((sail.pitchAngle || 0) * 180 / Math.PI).toFixed(1)}°`;
    }
    if (sailDeployValue) {
        sailDeployValue.textContent = `${sail.deploymentPercent.toFixed(1)}%`;
    }
    if (sailCountValue) {
        sailCountValue.textContent = sail.sailCount || 1;
    }

    // Update mobile widget too
    const mobileSailYaw = document.getElementById('mobileSailYaw');
    const mobileSailPitch = document.getElementById('mobileSailPitch');
    const mobileSailDeployment = document.getElementById('mobileSailDeployment');

    if (mobileSailYaw) {
        mobileSailYaw.value = sail.angle * (180 / Math.PI);
    }
    if (mobileSailPitch) {
        mobileSailPitch.value = (sail.pitchAngle || 0) * (180 / Math.PI);
    }
    if (mobileSailDeployment) {
        mobileSailDeployment.value = sail.deploymentPercent;
    }
}

/**
 * Update zoom button active state
 */
function updateZoomButtons(zoomLevel) {
    if (!zoomLevel) return;

    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.zoom === zoomLevel);
    });
}

/**
 * Update speed button active state
 */
function updateSpeedButtons(speedName) {
    if (!speedName) return;

    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.speed === speedName);
    });
}
