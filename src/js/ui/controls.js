/**
 * User input and control handlers
 */

import { camera, setCameraFollow, stopFollowing } from '../core/camera.js';
import { setZoom, setDisplayOption, setFocusTarget, getScale, setSpeed, setCustomSpeed, autoPilotState, setAutoPilotEnabled, isAutoPilotEnabled, AUTOPILOT_PHASES, setAutoPilotPhase, getAutoPilotPhase, setTrajectoryDuration, bodyFilters, saveBodyFilters } from '../core/gameState.js';
import { resizeCanvas } from './renderer.js';
import {
    setDestination,
    destination,
    generateFlightPath,
    computeNavigationPlan,
    computeApproachPlan,
    computeCapturePlan,
    computeEscapePlan,
    getDestinationInfo
} from '../core/navigation.js';
import { celestialBodies, getVisibleBodies } from '../data/celestialBodies.js';
import { ships, getPlayerShip, setSailAngle, setSailPitch, setSailDeployment, setSailCount } from '../data/ships.js';
import { setDestinationName, updateSailDisplay } from './uiUpdater.js';
import { initExpandablePanel, loadPanelState, initTabGroup, isMobileView } from './ui-components.js';

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
    initAutoPilotControls();
    initKeyboardShortcuts();
    initMouseControls(canvas);
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

    if (slider) {
        slider.addEventListener('input', (e) => {
            const days = parseInt(e.target.value);
            setTrajectoryDuration(days);
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
    const panels = ['zoomPanel', 'speedPanel', 'orbitPanel', 'displayPanel', 'bodyFiltersSection', 'trajectoryConfigPanel'];

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
 * Set up sail control sliders
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
            updateSailDisplay();
        });
    }

    // Deployment slider handler
    if (deploySlider) {
        deploySlider.addEventListener('input', () => {
            const value = parseInt(deploySlider.value, 10);
            const player = getPlayerShip();
            if (player) {
                setSailDeployment(player, value);
            }
            if (deployValue) {
                deployValue.textContent = value + '%';
            }
            updateSailDisplay();
        });
    }

    // Yaw angle slider handler
    if (angleSlider) {
        angleSlider.addEventListener('input', () => {
            const degrees = parseInt(angleSlider.value, 10);
            const radians = degrees * Math.PI / 180;
            const player = getPlayerShip();
            if (player) {
                const oldAngle = player.sail?.angle || 0;
                setSailAngle(player, radians);
                console.log(`[SAIL] Yaw changed: ${(oldAngle * 180 / Math.PI).toFixed(1)}° → ${degrees}°`);
                // Log current orbital state for correlation
                if (player.velocity && player.orbitalElements) {
                    const vMag = Math.sqrt(player.velocity.x**2 + player.velocity.y**2 + player.velocity.z**2);
                    const { a, e, i } = player.orbitalElements;
                    console.log(`[SAIL] Orbit: a=${a.toFixed(4)} AU, e=${e.toFixed(4)}, i=${(i * 180 / Math.PI).toFixed(2)}°`);
                    console.log(`[SAIL] Velocity: (${player.velocity.x.toFixed(4)}, ${player.velocity.y.toFixed(4)}, ${player.velocity.z.toFixed(4)}) |v|=${(vMag * 1731.46).toFixed(1)} km/s`);
                    // Check if orbit is hyperbolic
                    if (e >= 1.0) {
                        console.error(`[SAIL] ⚠️ HYPERBOLIC ORBIT! e=${e.toFixed(4)}`);
                    }
                }
            }
            if (angleValue) {
                angleValue.textContent = degrees + '°';
            }
            updateSailDisplay();
        });
    }

    // Pitch angle slider handler
    if (pitchSlider) {
        pitchSlider.addEventListener('input', () => {
            const degrees = parseInt(pitchSlider.value, 10);
            const radians = degrees * Math.PI / 180;
            const player = getPlayerShip();
            if (player) {
                const oldPitch = player.sail?.pitchAngle || 0;
                setSailPitch(player, radians);
                console.log(`[SAIL] Pitch changed: ${(oldPitch * 180 / Math.PI).toFixed(1)}° → ${degrees}°`);
                // Log current orbital state for correlation
                if (player.velocity) {
                    const vMag = Math.sqrt(player.velocity.x**2 + player.velocity.y**2 + player.velocity.z**2);
                    console.log(`[SAIL] Current velocity: (${player.velocity.x.toFixed(4)}, ${player.velocity.y.toFixed(4)}, ${player.velocity.z.toFixed(4)}) |v|=${(vMag * 1731.46).toFixed(1)} km/s`);
                }
            }
            if (pitchValue) {
                pitchValue.textContent = degrees + '°';
            }
            updateSailDisplay();
        });
    }
}

/**
 * Set up keyboard shortcuts
 */
function initKeyboardShortcuts() {
    const deploySlider = document.getElementById('sailDeployment');
    const angleSlider = document.getElementById('sailAngle');
    const pitchSlider = document.getElementById('sailPitch');

    document.addEventListener('keydown', e => {
        // Tab switching shortcuts: Ctrl+1/2/3 for SAIL/NAV/AUTO
        if ((e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
            e.preventDefault(); // Prevent browser shortcuts
            const tabMap = { '1': 'sail', '2': 'nav', '3': 'auto' };
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
                break;
            case 'e':
                // Rotate view clockwise
                camera.angleZ += rotationStep;
                camera.angleZ = camera.angleZ % (2 * Math.PI);
                break;
            case 'r':
                // Reset view to default (avoid conflict with browser refresh)
                if (!e.ctrlKey && !e.metaKey) {
                    camera.angleX = 15 * Math.PI / 180;
                    camera.angleZ = 0;
                }
                break;
            case 'w':
                // Tilt view more top-down
                camera.angleX = Math.max(0, camera.angleX - tiltStep);
                break;
            case 's':
                // Tilt view more edge-on
                camera.angleX = Math.min(Math.PI / 2, camera.angleX + tiltStep);
                break;
        }

        // Autopilot toggle with 'a'
        if (e.key === 'a' || e.key === 'A') {
            const newState = !isAutoPilotEnabled();
            setAutoPilotEnabled(newState);
            updateAutoPilotUI(newState);
            return;
        }

        // Skip manual sail controls if autopilot is engaged
        if (isAutoPilotEnabled()) return;

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
        // At tactical (3000 px/AU) with 1000× zoom = 3,000,000 px/AU (very close orbital view)
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
    const statusDisplay = document.getElementById('autoPilotStatusDisplay');
    const autopilotSection = document.querySelector('.autopilot-section');
    const sailControls = document.querySelector('.sail-controls');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const newState = !isAutoPilotEnabled();
            setAutoPilotEnabled(newState);
            updateAutoPilotUI(newState);
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
    const autopilotSection = document.querySelector('.autopilot-section');
    const sailControls = document.querySelector('.sail-controls');
    const label = toggleBtn?.querySelector('.autopilot-label');

    if (enabled) {
        toggleBtn?.classList.add('engaged');
        statusDisplay?.classList.add('engaged');
        autopilotSection?.classList.add('engaged');
        sailControls?.classList.add('autopilot-active');
        if (label) label.textContent = 'DISENGAGE';
    } else {
        toggleBtn?.classList.remove('engaged');
        statusDisplay?.classList.remove('engaged');
        autopilotSection?.classList.remove('engaged');
        sailControls?.classList.remove('autopilot-active');
        if (label) label.textContent = 'ENGAGE';
    }

    updateAutoPilotStatusText();
}

/**
 * Update the autopilot status text display
 */
function updateAutoPilotStatusText() {
    const statusDisplay = document.getElementById('autoPilotStatusDisplay');
    const statusText = statusDisplay?.querySelector('.status-text');

    if (!statusText) return;

    if (!isAutoPilotEnabled()) {
        statusText.textContent = 'MANUAL CONTROL';
        return;
    }

    const player = getPlayerShip();
    if (!player?.sail) {
        statusText.textContent = 'NO SAIL';
        return;
    }

    // Get current phase and appropriate plan
    const phase = getAutoPilotPhase();
    let plan;
    switch (phase) {
        case AUTOPILOT_PHASES.APPROACH:
            plan = computeApproachPlan();
            break;
        case AUTOPILOT_PHASES.CAPTURE:
            plan = computeCapturePlan();
            break;
        case AUTOPILOT_PHASES.ESCAPE:
            plan = computeEscapePlan();
            break;
        case AUTOPILOT_PHASES.CRUISE:
        default:
            plan = computeNavigationPlan();
            break;
    }

    if (!plan) {
        statusText.textContent = 'NO NAV DATA';
        return;
    }

    // Show phase and strategy
    const strategy = plan.strategyName || 'CALCULATING';
    statusText.textContent = `${phase}: ${strategy}`;
}

/**
 * Determine the appropriate autopilot phase based on current state.
 *
 * Phase transitions:
 * - CRUISE: Far from destination, optimize for intercept
 * - APPROACH: Within 5x SOI radius, optimize for velocity matching
 * - CAPTURE: Inside SOI, circularize orbit
 * - ESCAPE: Inside SOI but want to leave (manual override)
 *
 * @returns {string} Appropriate phase from AUTOPILOT_PHASES
 */
function determineAutopilotPhase() {
    const player = getPlayerShip();
    if (!player) return AUTOPILOT_PHASES.CRUISE;

    // If inside SOI, we're in capture phase
    if (player.soiState?.isInSOI) {
        // Could be ESCAPE if user manually sets it, otherwise CAPTURE
        const currentPhase = getAutoPilotPhase();
        if (currentPhase === AUTOPILOT_PHASES.ESCAPE) {
            return AUTOPILOT_PHASES.ESCAPE;
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

/**
 * Update autopilot - call this each frame to adjust sail toward nav computer recommendations.
 *
 * Handles multiple phases:
 * - CRUISE: Use nav computer plan to intercept destination
 * - APPROACH: Use approach plan to match velocity before SOI entry
 * - CAPTURE: Use capture plan to circularize orbit inside SOI
 * - ESCAPE: Use escape plan to leave SOI
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

    // Get plan based on phase
    let plan;
    switch (phase) {
        case AUTOPILOT_PHASES.APPROACH:
            plan = computeApproachPlan();
            break;
        case AUTOPILOT_PHASES.CAPTURE:
            plan = computeCapturePlan();
            break;
        case AUTOPILOT_PHASES.ESCAPE:
            plan = computeEscapePlan();
            break;
        case AUTOPILOT_PHASES.CRUISE:
        default:
            plan = computeNavigationPlan();
            break;
    }

    if (!plan) return;

    // Convert deltaTime from days to seconds for rate calculations
    const deltaSeconds = deltaTime * 86400;

    const currentAngleDeg = player.sail.angle * 180 / Math.PI;
    const currentDeploy = player.sail.deploymentPercent;
    const targetAngleDeg = plan.recommendedAngle;
    const targetDeploy = plan.recommendedDeployment;

    // Calculate how much we can adjust this frame
    const maxAngleChange = autoPilotState.adjustmentRateDegPerSec * deltaSeconds;
    const maxDeployChange = autoPilotState.adjustmentRatePctPerSec * deltaSeconds;

    // Smoothly adjust angle toward target
    let newAngleDeg = currentAngleDeg;
    const angleDiff = targetAngleDeg - currentAngleDeg;
    if (Math.abs(angleDiff) > 0.5) {
        const angleChange = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxAngleChange);
        newAngleDeg = currentAngleDeg + angleChange;
        newAngleDeg = Math.max(-90, Math.min(90, newAngleDeg));
        setSailAngle(player, newAngleDeg * Math.PI / 180);
    }

    // Smoothly adjust deployment toward target
    let newDeploy = currentDeploy;
    const deployDiff = targetDeploy - currentDeploy;
    if (Math.abs(deployDiff) > 1) {
        const deployChange = Math.sign(deployDiff) * Math.min(Math.abs(deployDiff), maxDeployChange);
        newDeploy = currentDeploy + deployChange;
        newDeploy = Math.max(0, Math.min(100, newDeploy));
        setSailDeployment(player, newDeploy);
    }

    // Smoothly adjust pitch toward target (for 3D maneuvers)
    const currentPitchDeg = (player.sail.pitchAngle || 0) * 180 / Math.PI;
    const targetPitchDeg = plan.recommendedPitch || 0;
    let newPitchDeg = currentPitchDeg;
    const pitchDiff = targetPitchDeg - currentPitchDeg;
    if (Math.abs(pitchDiff) > 0.5) {
        const pitchChange = Math.sign(pitchDiff) * Math.min(Math.abs(pitchDiff), maxAngleChange);
        newPitchDeg = currentPitchDeg + pitchChange;
        newPitchDeg = Math.max(-90, Math.min(90, newPitchDeg));
        setSailPitch(player, newPitchDeg * Math.PI / 180);
    }

    // Update UI sliders to reflect autopilot changes
    const deploySlider = document.getElementById('sailDeployment');
    const angleSlider = document.getElementById('sailAngle');
    const pitchSlider = document.getElementById('sailPitch');
    const deployValue = document.getElementById('sailDeployValue');
    const angleValue = document.getElementById('sailAngleValue');
    const pitchValue = document.getElementById('sailPitchValue');

    if (deploySlider) deploySlider.value = Math.round(newDeploy);
    if (angleSlider) angleSlider.value = Math.round(newAngleDeg);
    if (pitchSlider) pitchSlider.value = Math.round(newPitchDeg);
    if (deployValue) deployValue.textContent = Math.round(newDeploy) + '%';
    if (angleValue) angleValue.textContent = Math.round(newAngleDeg) + '°';
    if (pitchValue) pitchValue.textContent = Math.round(newPitchDeg) + '°';

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
