/**
 * UI update functions for panels and displays
 */

import { destination, getDestinationInfo, predictClosestApproach, computeNavigationPlan, computeApproachPlan, computeCapturePlan, computeEscapePlan } from '../core/navigation.js';
import { getTime, getCurrentZoom, isAutoPilotEnabled, getAutoPilotPhase, AUTOPILOT_PHASES, getClosestApproachForBody } from '../core/gameState.js';
import { getPlayerShip } from '../data/ships.js';
import { getThrustInfo } from '../core/shipPhysics.js';

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
 * Update all UI elements
 */
export function updateUI() {
    updateTimeDisplay();
    updateScaleDisplay();
    updateDestinationDisplay();
    updateSailDisplay();
    updateNavigationComputer();
    updateSOIStatus();
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
    // Try to use our new accurate closest approach cache first (Solution #5)
    // Falls back to the old simulation method if cache is empty
    const cachedApproach = getClosestApproachForBody(destination);

    let closestDistance, timeToClosest, status;

    if (cachedApproach) {
        // Use the accurate data from trajectory predictor
        closestDistance = cachedApproach.minDistance;
        timeToClosest = cachedApproach.daysFromNow;

        // Determine status based on distance
        if (closestDistance < 0.01) {
            status = 'INTERCEPT';
        } else if (closestDistance < 0.05) {
            status = 'NEAR MISS';
        } else if (closestDistance < 0.2) {
            status = 'WIDE MISS';
        } else {
            status = 'NO INTERCEPT';
        }
    } else {
        // Fall back to old prediction method
        const intercept = predictClosestApproach();
        if (intercept) {
            closestDistance = intercept.closestDistance;
            timeToClosest = intercept.timeToClosest;
            status = intercept.status;
        }
    }

    if (closestDistance !== undefined) {
        if (elements.closestDist) {
            elements.closestDist.textContent = closestDistance.toFixed(3) + ' AU';
        }
        if (elements.timeToClosest) {
            const days = Math.floor(timeToClosest);
            const hours = Math.floor((timeToClosest % 1) * 24);
            elements.timeToClosest.textContent = `${days}d ${hours}h`;
        }
        if (elements.interceptStatus) {
            elements.interceptStatus.textContent = status;
            // Add color coding based on status
            elements.interceptStatus.classList.remove('status-intercept', 'status-near', 'status-wide', 'status-miss');
            if (status === 'INTERCEPT') {
                elements.interceptStatus.classList.add('status-intercept');
            } else if (status === 'NEAR MISS') {
                elements.interceptStatus.classList.add('status-near');
            } else if (status === 'WIDE MISS') {
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

    // Calculate thrust value for display
    const thrustMMS2 = thrustInfo ? thrustInfo.accelerationMS2 * 1000 : 0; // m/s² to mm/s²
    const thrustText = thrustMMS2.toFixed(3) + ' mm/s²';

    if (thrustInfo) {
        // Update thrust display (convert to mm/s² for readability)
        if (elements.sailThrust) {
            elements.sailThrust.textContent = thrustText;
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

        // Update mobile sail widget values
        const mobileDeployValue = document.getElementById('mobileSailDeployValue');
        const mobileYawValue = document.getElementById('mobileSailYawValue');
        const mobilePitchValue = document.getElementById('mobileSailPitchValue');
        const mobileThrustValue = document.getElementById('mobileSailThrust');
        const mobileDeploySlider = document.getElementById('mobileSailDeployment');
        const mobileYawSlider = document.getElementById('mobileSailYaw');
        const mobilePitchSlider = document.getElementById('mobileSailPitch');

        if (mobileDeployValue) {
            mobileDeployValue.textContent = Math.round(player.sail.deploymentPercent) + '%';
        }
        if (mobileDeploySlider) {
            mobileDeploySlider.value = player.sail.deploymentPercent;
        }

        const yawDeg = Math.round(player.sail.angle * 180 / Math.PI);
        if (mobileYawValue) {
            mobileYawValue.textContent = yawDeg + '°';
        }
        if (mobileYawSlider) {
            mobileYawSlider.value = yawDeg;
        }

        const pitchDeg = Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI);
        if (mobilePitchValue) {
            mobilePitchValue.textContent = pitchDeg + '°';
        }
        if (mobilePitchSlider) {
            mobilePitchSlider.value = pitchDeg;
        }

        if (mobileThrustValue) {
            mobileThrustValue.textContent = thrustText;
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
