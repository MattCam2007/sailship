/**
 * UI update functions for panels and displays
 */

import { destination, getDestinationInfo, predictClosestApproach } from '../core/navigation.js';
import { getTime, getCurrentZoom, getClosestApproachForBody } from '../core/gameState.js';
import { getBodyByName } from '../data/celestialBodies.js';
import { getPlayerShip } from '../data/ships.js';
import { getThrustInfo } from '../core/shipPhysics.js';
import { SOI_RADII } from '../config.js';

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
        // SOI status elements
        soiStatus: document.getElementById('soiStatus'),
        soiBody: document.getElementById('soiBody'),
        relVelocity: document.getElementById('relVelocity'),
        // Orbital plane / inclination elements
        shipInclination: document.getElementById('shipInclination'),
        targetInclination: document.getElementById('targetInclination'),
        deltaInclination: document.getElementById('deltaInclination'),
        planeChangeDirection: document.getElementById('planeChangeDirection')
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
    updateThrusterDisplayInternal();
    updateSOIStatus();
    updateInclinationDisplay();
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

        // Determine status based on SOI-relative distance
        // SOI/2 = intercept (within gravitational capture zone with margin)
        // SOI = near miss (just outside capture, within influence region)
        // SOI * 5 = wide miss (observable approach, could be course-corrected)
        const soiRadius = SOI_RADII[destination] || 0.02;  // Default 0.02 AU for unknown bodies
        const interceptThreshold = soiRadius / 2;  // SOI/2
        const nearMissThreshold = soiRadius;       // SOI
        const wideMissThreshold = soiRadius * 5;   // SOI * 5

        if (closestDistance < interceptThreshold) {
            status = 'INTERCEPT';
        } else if (closestDistance < nearMissThreshold) {
            status = 'NEAR MISS';
        } else if (closestDistance < wideMissThreshold) {
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
        // Helper to format values - show decimal only if not a whole number
        const formatValue = (val, suffix) => {
            // Round to 1 decimal place to avoid floating point noise
            const rounded = Math.round(val * 10) / 10;
            const display = Number.isInteger(rounded) ? rounded : rounded.toFixed(1);
            return display + suffix;
        };

        if (elements.sailDeployValue) {
            elements.sailDeployValue.textContent = formatValue(player.sail.deploymentPercent, '%');
        }
        if (elements.sailAngleValue) {
            const degrees = player.sail.angle * 180 / Math.PI;
            elements.sailAngleValue.textContent = formatValue(degrees, '°');
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
            mobileDeployValue.textContent = formatValue(player.sail.deploymentPercent, '%');
        }
        if (mobileDeploySlider) {
            mobileDeploySlider.value = player.sail.deploymentPercent;
        }

        const yawDeg = player.sail.angle * 180 / Math.PI;
        if (mobileYawValue) {
            mobileYawValue.textContent = formatValue(yawDeg, '°');
        }
        if (mobileYawSlider) {
            mobileYawSlider.value = yawDeg;
        }

        const pitchDeg = (player.sail.pitchAngle || 0) * 180 / Math.PI;
        if (mobilePitchValue) {
            mobilePitchValue.textContent = formatValue(pitchDeg, '°');
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
 * Update thruster display (fuel gauge, delta-V remaining)
 * Called each frame from updateUI.
 */
function updateThrusterDisplayInternal() {
    const player = getPlayerShip();
    if (!player || !player.thruster) return;

    const { deltaVRemaining, deltaVMax } = player.thruster;

    const deltaVDisplay = document.getElementById('thrusterDeltaV');
    const fuelFill = document.getElementById('thrusterFuelFill');

    if (deltaVDisplay) {
        deltaVDisplay.textContent = deltaVRemaining.toFixed(1) + ' km/s';
    }

    if (fuelFill) {
        const pct = (deltaVRemaining / deltaVMax) * 100;
        fuelFill.style.width = pct + '%';
        if (pct < 20) {
            fuelFill.classList.add('low');
        } else {
            fuelFill.classList.remove('low');
        }
    }

    // Disable buttons if no fuel
    const hasFuel = deltaVRemaining > 0;
    const retroBtn = document.getElementById('thrusterRetrograde');
    const proBtn = document.getElementById('thrusterPrograde');
    if (retroBtn) retroBtn.disabled = !hasFuel;
    if (proBtn) proBtn.disabled = !hasFuel;

    // Update header fuel indicator
    const fuelIndicator = document.getElementById('fuelIndicator');
    if (fuelIndicator) {
        const pct = (deltaVRemaining / deltaVMax) * 100;
        fuelIndicator.classList.remove('warning', 'active');
        if (pct <= 0) {
            fuelIndicator.classList.add('warning');
        } else if (pct < 30) {
            fuelIndicator.classList.add('warning');
        } else {
            fuelIndicator.classList.add('active');
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

/**
 * Update orbital plane / inclination display
 * Shows ship inclination, target inclination, and delta-i
 */
function updateInclinationDisplay() {
    const player = getPlayerShip();
    if (!player || !player.orbitalElements) return;

    const targetBody = getBodyByName(destination);
    if (!targetBody || !targetBody.elements) return;

    // Get inclinations in radians, convert to degrees
    const shipIncRad = player.orbitalElements.i || 0;
    const targetIncRad = targetBody.elements.i || 0;

    const shipIncDeg = shipIncRad * 180 / Math.PI;
    const targetIncDeg = targetIncRad * 180 / Math.PI;

    // Calculate delta-i (simple difference for now)
    // Note: This is simplified - true delta-i depends on relative longitude of ascending node
    const deltaIncDeg = Math.abs(targetIncDeg - shipIncDeg);

    // Determine direction needed
    let direction = '---';
    if (deltaIncDeg < 0.1) {
        direction = 'MATCHED';
    } else if (targetIncDeg > shipIncDeg) {
        direction = 'RAISE (+pitch)';
    } else {
        direction = 'LOWER (-pitch)';
    }

    // Update display elements
    if (elements.shipInclination) {
        elements.shipInclination.textContent = shipIncDeg.toFixed(2) + '°';
    }

    if (elements.targetInclination) {
        elements.targetInclination.textContent = targetIncDeg.toFixed(2) + '°';
    }

    if (elements.deltaInclination) {
        elements.deltaInclination.textContent = deltaIncDeg.toFixed(2) + '°';

        // Color code based on magnitude
        elements.deltaInclination.classList.remove('delta-low', 'delta-med', 'delta-high');
        if (deltaIncDeg < 1) {
            elements.deltaInclination.classList.add('delta-low');
        } else if (deltaIncDeg < 5) {
            elements.deltaInclination.classList.add('delta-med');
        } else {
            elements.deltaInclination.classList.add('delta-high');
        }
    }

    if (elements.planeChangeDirection) {
        elements.planeChangeDirection.textContent = direction;
    }
}
