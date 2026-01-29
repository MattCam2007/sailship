/**
 * UI update functions for panels and displays
 */

import { destination, getDestinationInfo, predictClosestApproach, computeNavigationPlan, computeApproachPlan, computeCapturePlan, computeEscapePlan } from '../core/navigation.js';
import { getTime, getCurrentZoom, isAutoPilotEnabled, getAutoPilotPhase, AUTOPILOT_PHASES, isPlanningMode, planningModeState, getEphemerisDate, julianToDate } from '../core/gameState.js';
import { getPlayerShip } from '../data/ships.js';
import { getThrustInfo } from '../core/shipPhysics.js';
import { updateTimeTravelDisplay } from './controls.js';

// Cache DOM elements
let elements = {};

/**
 * Initialize UI element references
 */
export function initUI() {
    elements = {
        timeDisplay: document.getElementById('timeDisplay'),
        scaleDisplay: document.getElementById('scaleDisplay'),
        destName: document.getElementById('destName'),
        destDist: document.getElementById('destDist'),
        // Intercept prediction elements
        closestDist: document.getElementById('closestDist'),
        timeToClosest: document.getElementById('timeToClosest'),
        interceptStatus: document.getElementById('interceptStatus'),
        // Sail control elements
        sailDeployValue: document.getElementById('sailDeployValue'),
        sailAngleValue: document.getElementById('sailAngleValue'),
        sailThrust: document.getElementById('sailThrust'),
        sailAccelG: document.getElementById('sailAccelG'),
        sailDeployment: document.getElementById('sailDeployment'),
        sailAngle: document.getElementById('sailAngle'),
        // Navigation computer elements
        navStrategy: document.getElementById('navStrategy'),
        navRecAngle: document.getElementById('navRecAngle'),
        navRecDeploy: document.getElementById('navRecDeploy'),
        navCurrentSettings: document.getElementById('navCurrentSettings'),
        navDeviation: document.getElementById('navDeviation'),
        navArrival: document.getElementById('navArrival'),
        navApproach: document.getElementById('navApproach'),
        navProgressPct: document.getElementById('navProgressPct'),
        navProgressFill: document.getElementById('navProgressFill'),
        // SOI status elements
        soiStatus: document.getElementById('soiStatus'),
        soiBody: document.getElementById('soiBody'),
        relVelocity: document.getElementById('relVelocity')
    };

    // Initialize sail display with current values
    updateSailDisplay();
}

/**
 * Synchronize all UI elements with planning mode state
 * Call this whenever planning mode is toggled programmatically or via UI
 */
export function syncPlanningModeUI() {
    const enabled = isPlanningMode();

    // 1. Update body class for CSS styling
    document.body.classList.toggle('planning-mode', enabled);

    // 2. Sync checkbox state
    const checkbox = document.getElementById('planningModeEnabled');
    if (checkbox && checkbox.checked !== enabled) {
        checkbox.checked = enabled;
    }

    // 3. Disable/enable speed controls
    const speedButtons = document.querySelectorAll('.speed-button');
    speedButtons.forEach(btn => {
        btn.disabled = enabled;
        btn.style.opacity = enabled ? '0.3' : '';
        btn.style.cursor = enabled ? 'not-allowed' : '';
    });

    // 4. Update dual date display
    const contextDiv = document.getElementById('planningContext');
    if (contextDiv) {
        if (enabled) {
            contextDiv.style.display = 'block';

            // Update planning date
            const ephemerisDate = getEphemerisDate();
            const planningDisplay = document.getElementById('planningDateDisplay');
            if (planningDisplay) {
                const formatted = formatPlanningDate(ephemerisDate);
                planningDisplay.textContent = formatted;
            }

            // Update frozen date
            const frozenJD = planningModeState.frozenJulianDate;
            const frozenDisplay = document.getElementById('frozenDateDisplay');
            if (frozenDisplay && frozenJD) {
                const frozenDate = julianToDate(frozenJD);
                if (frozenDate) {
                    const formatted = formatPlanningDate(frozenDate);
                    frozenDisplay.textContent = formatted;
                }
            }
        } else {
            contextDiv.style.display = 'none';
        }
    }

    // 5. Update time travel display
    updateTimeTravelDisplay();
}

/**
 * Format date for planning mode display
 * @param {Date} date - JavaScript Date object
 * @returns {string} Formatted date string
 */
function formatPlanningDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    updateTimeDisplay();
    updateScaleDisplay();
    updateDestinationDisplay();
    updateSailDisplay();
    updateNavigationComputer();
    updateSOIStatus();
    updateTimeTravelDisplay();

    // Sync planning mode UI (speed buttons, indicators, etc.)
    syncPlanningModeUI();
}

/**
 * Update time display
 */
function updateTimeDisplay() {
    const time = getTime();
    const days = Math.floor(time);
    const hours = Math.floor((time % 1) * 24);
    const mins = Math.floor(((time % 1) * 24 % 1) * 60);
    
    if (elements.timeDisplay) {
        elements.timeDisplay.textContent = 
            `2351.${String(127 + days).padStart(3, '0')} // ${String(14 + hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:07 UTC`;
    }
}

/**
 * Update scale display
 */
function updateScaleDisplay() {
    const scaleText = {
        system: '1 AU = 50px',
        inner: '1 AU = 200px',
        local: '0.1 AU = 80px',
        tactical: '0.01 AU = 30px'
    };
    
    if (elements.scaleDisplay) {
        elements.scaleDisplay.textContent = scaleText[getCurrentZoom()];
    }
}

/**
 * Update destination info display
 */
function updateDestinationDisplay() {
    const info = getDestinationInfo();

    if (info) {
        if (elements.destDist) {
            elements.destDist.textContent = info.distance.toFixed(3) + ' AU';
        }

        // Show relative velocity to target (important for capture)
        if (elements.relVelocity && info.relativeVelocity !== null) {
            elements.relVelocity.textContent = info.relativeVelocity.toFixed(1) + ' km/s';
            // Color code: green if capture-ready, red if too fast
            elements.relVelocity.classList.remove('capture-ready', 'too-fast');
            if (info.captureReady) {
                elements.relVelocity.classList.add('capture-ready');
            } else {
                elements.relVelocity.classList.add('too-fast');
            }
        }
    }

    // Update intercept prediction
    const intercept = predictClosestApproach();

    if (intercept) {
        if (elements.closestDist) {
            elements.closestDist.textContent = intercept.closestDistance.toFixed(3) + ' AU';
        }
        if (elements.timeToClosest) {
            const days = Math.floor(intercept.timeToClosest);
            const hours = Math.floor((intercept.timeToClosest % 1) * 24);
            elements.timeToClosest.textContent = `${days}d ${hours}h`;
        }
        if (elements.interceptStatus) {
            elements.interceptStatus.textContent = intercept.status;
            // Add color coding based on status
            elements.interceptStatus.classList.remove('status-intercept', 'status-near', 'status-wide', 'status-miss');
            if (intercept.status === 'INTERCEPT') {
                elements.interceptStatus.classList.add('status-intercept');
            } else if (intercept.status === 'NEAR MISS') {
                elements.interceptStatus.classList.add('status-near');
            } else if (intercept.status === 'WIDE MISS') {
                elements.interceptStatus.classList.add('status-wide');
            } else {
                elements.interceptStatus.classList.add('status-miss');
            }
        }
    }
}

/**
 * Update sail control display with current thrust values
 */
export function updateSailDisplay() {
    const player = getPlayerShip();
    if (!player) return;
    
    const thrustInfo = getThrustInfo(player);
    
    if (thrustInfo) {
        // Update thrust display (convert to mm/s² for readability)
        if (elements.sailThrust) {
            const thrustMMS2 = thrustInfo.accelerationMS2 * 1000; // m/s² to mm/s²
            elements.sailThrust.textContent = thrustMMS2.toFixed(3) + ' mm/s²';
        }
        
        // Update g-force display
        if (elements.sailAccelG) {
            elements.sailAccelG.textContent = thrustInfo.accelerationG.toFixed(6) + ' g';
        }
    } else {
        // No thrust info available
        if (elements.sailThrust) {
            elements.sailThrust.textContent = '0.000 mm/s²';
        }
        if (elements.sailAccelG) {
            elements.sailAccelG.textContent = '0.000000 g';
        }
    }
    
    // Update slider value displays if sail exists
    if (player.sail) {
        if (elements.sailDeployValue) {
            elements.sailDeployValue.textContent = Math.round(player.sail.deploymentPercent) + '%';
        }
        if (elements.sailAngleValue) {
            const degrees = Math.round(player.sail.angle * 180 / Math.PI);
            elements.sailAngleValue.textContent = degrees + '°';
        }
    }
}

/**
 * Update destination name display
 * @param {string} name - Destination name
 */
export function setDestinationName(name) {
    if (elements.destName) {
        elements.destName.textContent = name;
    }
}

/**
 * Update navigation computer display.
 * Shows different info based on autopilot phase.
 */
function updateNavigationComputer() {
    const player = getPlayerShip();

    // Inside SOI - use capture plan display
    if (player?.soiState?.isInSOI) {
        const plan = computeCapturePlan();
        updateNavigationComputerCapture(plan);
        return;
    }

    // Default: standard navigation plan for both cruise and approach
    const plan = computeNavigationPlan();

    if (!plan) {
        if (elements.navStrategy) {
            elements.navStrategy.textContent = 'NO DATA';
        }
        return;
    }

    // Update strategy name
    if (elements.navStrategy) {
        elements.navStrategy.textContent = plan.strategyName;
    }

    // Update recommended settings
    if (elements.navRecAngle) {
        const sign = plan.recommendedAngle >= 0 ? '+' : '';
        elements.navRecAngle.textContent = sign + plan.recommendedAngle + '°';
    }
    if (elements.navRecDeploy) {
        elements.navRecDeploy.textContent = plan.recommendedDeployment + '%';
    }

    // Update current settings comparison
    if (elements.navCurrentSettings) {
        const sign = plan.currentAngle >= 0 ? '+' : '';
        elements.navCurrentSettings.textContent =
            sign + plan.currentAngle + '°, ' + plan.currentDeployment + '%';
    }

    // Update deviation status with color coding
    if (elements.navDeviation) {
        elements.navDeviation.textContent = plan.deviationStatus;
        elements.navDeviation.classList.remove(
            'deviation-optimal', 'deviation-acceptable', 'deviation-adjust'
        );
        if (plan.deviationStatus === 'OPTIMAL') {
            elements.navDeviation.classList.add('deviation-optimal');
        } else if (plan.deviationStatus === 'ACCEPTABLE') {
            elements.navDeviation.classList.add('deviation-acceptable');
        } else {
            elements.navDeviation.classList.add('deviation-adjust');
        }
    }

    // Update arrival prediction
    if (elements.navArrival) {
        if (plan.willIntercept) {
            const days = Math.floor(plan.estimatedArrival);
            const hours = Math.floor((plan.estimatedArrival % 1) * 24);
            elements.navArrival.textContent = days + 'd ' + hours + 'h';
            elements.navArrival.classList.add('status-intercept');
            elements.navArrival.classList.remove('status-miss');
        } else {
            elements.navArrival.textContent = 'NO INTERCEPT';
            elements.navArrival.classList.add('status-miss');
            elements.navArrival.classList.remove('status-intercept');
        }
    }

    // Update approach distance
    if (elements.navApproach) {
        elements.navApproach.textContent = plan.closestApproach.toFixed(3) + ' AU';
    }

    // Update progress bar
    if (elements.navProgressPct) {
        elements.navProgressPct.textContent = Math.round(plan.progress) + '%';
    }
    if (elements.navProgressFill) {
        elements.navProgressFill.style.width = Math.round(plan.progress) + '%';
    }
}

/**
 * Update navigation computer for approach phase.
 */
function updateNavigationComputerApproach(plan) {
    if (!plan) {
        if (elements.navStrategy) {
            elements.navStrategy.textContent = 'APPROACH';
        }
        return;
    }

    // Update strategy
    if (elements.navStrategy) {
        elements.navStrategy.textContent = plan.strategyName;
    }

    // Update recommended settings
    if (elements.navRecAngle) {
        const sign = plan.recommendedAngle >= 0 ? '+' : '';
        elements.navRecAngle.textContent = sign + plan.recommendedAngle + '°';
    }
    if (elements.navRecDeploy) {
        elements.navRecDeploy.textContent = plan.recommendedDeployment + '%';
    }

    // Show relative velocity info
    if (elements.navCurrentSettings) {
        elements.navCurrentSettings.textContent = plan.relativeVelocity.toFixed(1) + ' km/s';
    }

    // Show capture readiness with escape velocity threshold
    if (elements.navDeviation) {
        if (plan.captureReady) {
            elements.navDeviation.textContent = 'CAPTURE READY';
            elements.navDeviation.classList.remove('deviation-acceptable', 'deviation-adjust');
            elements.navDeviation.classList.add('deviation-optimal');
        } else {
            // Show how much over the limit we are
            const excess = plan.relativeVelocity - plan.escapeVelocity;
            elements.navDeviation.textContent = `+${excess.toFixed(1)} km/s OVER`;
            elements.navDeviation.classList.remove('deviation-optimal', 'deviation-acceptable');
            elements.navDeviation.classList.add('deviation-adjust');
        }
    }

    // Show distance to SOI
    if (elements.navArrival) {
        if (plan.distanceToSOI !== null) {
            elements.navArrival.textContent = plan.distanceToSOI.toFixed(4) + ' AU';
        } else {
            elements.navArrival.textContent = '---';
        }
        elements.navArrival.classList.remove('status-intercept', 'status-miss');
    }

    if (elements.navApproach) {
        elements.navApproach.textContent = 'TO SOI';
    }

    // Progress shows velocity matching progress
    const maxVel = 60; // km/s reference
    const progress = Math.max(0, Math.min(100, (1 - plan.relativeVelocity / maxVel) * 100));
    if (elements.navProgressPct) {
        elements.navProgressPct.textContent = Math.round(progress) + '%';
    }
    if (elements.navProgressFill) {
        elements.navProgressFill.style.width = Math.round(progress) + '%';
    }
}

/**
 * Update navigation computer for capture phase (inside SOI).
 */
function updateNavigationComputerCapture(plan) {
    if (!plan) {
        if (elements.navStrategy) {
            elements.navStrategy.textContent = 'IN SOI';
        }
        return;
    }

    // Update strategy
    if (elements.navStrategy) {
        elements.navStrategy.textContent = plan.strategyName;
    }

    // Update recommended settings
    if (elements.navRecAngle) {
        const sign = plan.recommendedAngle >= 0 ? '+' : '';
        elements.navRecAngle.textContent = sign + plan.recommendedAngle + '°';
    }
    if (elements.navRecDeploy) {
        elements.navRecDeploy.textContent = plan.recommendedDeployment + '%';
    }

    // Show eccentricity
    if (elements.navCurrentSettings) {
        elements.navCurrentSettings.textContent = 'e=' + plan.eccentricity.toFixed(3);
    }

    // Show orbit stability
    if (elements.navDeviation) {
        if (plan.isStable) {
            elements.navDeviation.textContent = 'STABLE ORBIT';
            elements.navDeviation.classList.remove('deviation-acceptable', 'deviation-adjust');
            elements.navDeviation.classList.add('deviation-optimal');
        } else if (plan.eccentricity < 0.5) {
            elements.navDeviation.textContent = 'CIRCULARIZING';
            elements.navDeviation.classList.remove('deviation-optimal', 'deviation-adjust');
            elements.navDeviation.classList.add('deviation-acceptable');
        } else {
            elements.navDeviation.textContent = 'HIGH ECCENTRICITY';
            elements.navDeviation.classList.remove('deviation-optimal', 'deviation-acceptable');
            elements.navDeviation.classList.add('deviation-adjust');
        }
    }

    // Show orbit info
    if (elements.navArrival) {
        // Show periapsis in km (convert from AU)
        const periKm = plan.periapsis * 149597870.7;
        if (periKm < 1000000) {
            elements.navArrival.textContent = Math.round(periKm) + ' km';
        } else {
            elements.navArrival.textContent = (periKm / 1000000).toFixed(2) + 'M km';
        }
        elements.navArrival.classList.remove('status-intercept', 'status-miss');
    }

    if (elements.navApproach) {
        // Show apoapsis
        const apoKm = plan.apoapsis * 149597870.7;
        if (apoKm < 1000000) {
            elements.navApproach.textContent = Math.round(apoKm) + ' km';
        } else {
            elements.navApproach.textContent = (apoKm / 1000000).toFixed(2) + 'M km';
        }
    }

    // Progress shows circularization progress (lower e = more progress)
    const progress = Math.max(0, Math.min(100, (1 - plan.eccentricity) * 100));
    if (elements.navProgressPct) {
        elements.navProgressPct.textContent = Math.round(progress) + '%';
    }
    if (elements.navProgressFill) {
        elements.navProgressFill.style.width = Math.round(progress) + '%';
    }
}

/**
 * Update SOI (Sphere of Influence) status display
 */
function updateSOIStatus() {
    const player = getPlayerShip();
    if (!player) return;

    const isInSOI = player.soiState?.isInSOI || false;
    const currentBody = player.soiState?.currentBody || 'SUN';

    // Update SOI status indicator
    if (elements.soiStatus) {
        if (isInSOI) {
            elements.soiStatus.textContent = 'IN SOI';
            elements.soiStatus.classList.add('in-soi');
            elements.soiStatus.classList.remove('heliocentric');
        } else {
            elements.soiStatus.textContent = 'HELIOCENTRIC';
            elements.soiStatus.classList.remove('in-soi');
            elements.soiStatus.classList.add('heliocentric');
        }
    }

    // Update current parent body
    if (elements.soiBody) {
        elements.soiBody.textContent = currentBody;
    }
}
