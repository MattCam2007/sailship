/**
 * UI update functions for panels and displays
 */

import { destination, getDestinationInfo, predictClosestApproach } from '../core/navigation.js';
import { getTime, getJulianDate, getCurrentZoom, getScale, getClosestApproachForBody } from '../core/gameState.js';
import { getBodyByName } from '../data/celestialBodies.js';
import { getPlayerShip } from '../data/ships.js';
import { getThrustInfo, getShipVelocityKmS } from '../core/shipPhysics.js';
import { SOI_RADII } from '../config.js';
import { camera } from '../core/camera.js';
import { formatTripDistance, getTripElapsedDays, getTripAvgSpeedKmS, getTripMinSpeedKmS, getTripMaxSpeedKmS, resetTripometer } from '../core/tripometer.js';

// Cache DOM elements
let elements = {};

// Frame counter for throttling velocity display updates
let velocityFrameCounter = 0;

/**
 * Set textContent only if the value has actually changed.
 * Skips the DOM write (and potential reflow) when the text is the same.
 * @param {HTMLElement|null} el - DOM element
 * @param {string} text - New text content
 */
function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) {
        el.textContent = text;
    }
}

/**
 * Initialize UI element references.
 * All DOM lookups are done once here and cached for the lifetime of the session.
 */
export function initUI() {
    elements = {
        timeDisplay: document.getElementById('timeDisplay'),
        mobileTimeDisplay: document.getElementById('mobileTimeDisplay'),
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
        sailVelocity: document.getElementById('sailVelocity'),
        sailDeployment: document.getElementById('sailDeployment'),
        sailAngle: document.getElementById('sailAngle'),
        // SOI status elements
        soiStatus: document.getElementById('soiStatus'),
        soiBody: document.getElementById('soiBody'),
        relVelocity: document.getElementById('relVelocity'),
        // Corner label elements
        viewDisplay: document.getElementById('viewDisplay'),
        trackingDisplay: document.getElementById('trackingDisplay'),
        coordDisplay: document.getElementById('coordDisplay'),
        // Orbital plane / inclination elements
        shipInclination: document.getElementById('shipInclination'),
        targetInclination: document.getElementById('targetInclination'),
        deltaInclination: document.getElementById('deltaInclination'),
        planeChangeDirection: document.getElementById('planeChangeDirection'),
        // Mobile sail widget elements (cached to avoid getElementById per frame)
        mobileSailDeployValue: document.getElementById('mobileSailDeployValue'),
        mobileSailYawValue: document.getElementById('mobileSailYawValue'),
        mobileSailPitchValue: document.getElementById('mobileSailPitchValue'),
        mobileSailThrust: document.getElementById('mobileSailThrust'),
        mobileSailDeployment: document.getElementById('mobileSailDeployment'),
        mobileSailYaw: document.getElementById('mobileSailYaw'),
        mobileSailPitch: document.getElementById('mobileSailPitch'),
        // Thruster elements (cached to avoid getElementById per frame)
        thrusterDeltaV: document.getElementById('thrusterDeltaV'),
        thrusterFuelFill: document.getElementById('thrusterFuelFill'),
        thrusterRetrograde: document.getElementById('thrusterRetrograde'),
        thrusterPrograde: document.getElementById('thrusterPrograde'),
        fuelIndicator: document.getElementById('fuelIndicator'),
        // Tripometer elements
        tripDist: document.getElementById('tripDist'),
        tripTime: document.getElementById('tripTime'),
        tripAvg: document.getElementById('tripAvg'),
        tripMinSpeed: document.getElementById('tripMinSpeed'),
        tripMaxSpeed: document.getElementById('tripMaxSpeed'),
    };

    // Initialize sail display with current values
    updateSailDisplay();

    // Wire up tripometer reset button
    const tripResetBtn = document.getElementById('tripReset');
    if (tripResetBtn) {
        tripResetBtn.addEventListener('click', () => {
            resetTripometer();
        });
    }
}

/**
 * Update all UI elements
 */
export function updateUI() {
    updateTimeDisplay();
    updateScaleDisplay();
    updateViewDisplay();
    updateTrackingDisplay();
    updateCoordDisplay();
    updateDestinationDisplay();
    updateSailDisplay();
    updateThrusterDisplayInternal();
    updateSOIStatus();
    updateInclinationDisplay();
    updateTripometerDisplay();
}

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/**
 * Convert Julian date to Gregorian calendar date + time.
 * Algorithm from Meeus, Astronomical Algorithms.
 * @param {number} jd - Julian date
 * @returns {{year:number, month:number, day:number, hours:number, minutes:number, seconds:number}}
 */
function julianToGregorian(jd) {
    const z = Math.floor(jd + 0.5);
    const f = (jd + 0.5) - z;

    let a;
    if (z < 2299161) {
        a = z;
    } else {
        const alpha = Math.floor((z - 1867216.25) / 36524.25);
        a = z + 1 + alpha - Math.floor(alpha / 4);
    }

    const b = a + 1524;
    const c = Math.floor((b - 122.1) / 365.25);
    const d = Math.floor(365.25 * c);
    const e = Math.floor((b - d) / 30.6001);

    const day = b - d - Math.floor(30.6001 * e);
    const month = e < 14 ? e - 1 : e - 13;
    const year = month > 2 ? c - 4716 : c - 4715;

    const totalHours = f * 24;
    const hours = Math.floor(totalHours);
    const totalMinutes = (totalHours - hours) * 60;
    const minutes = Math.floor(totalMinutes);
    const seconds = Math.floor((totalMinutes - minutes) * 60);

    return { year, month, day, hours, minutes, seconds };
}

/**
 * Format elapsed mission time (in days) to human-readable string.
 * Uses leading zeros for consistent width at accelerated time speeds.
 * @param {number} timeDays - Elapsed time in days
 * @returns {string}
 */
function formatMissionTime(timeDays) {
    const totalSeconds = Math.floor(timeDays * 86400);

    if (totalSeconds < 60) {
        return `${String(totalSeconds).padStart(2, '0')}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (totalMinutes < 60) {
        return `${String(totalMinutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (totalHours < 24) {
        return `${String(totalHours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
    }

    const totalDays = Math.floor(totalHours / 24);
    const hrs = totalHours % 24;

    if (totalDays < 100) {
        // Use 2-digit days for 0-99 days
        return `${String(totalDays).padStart(2, '0')}d ${String(hrs).padStart(2, '0')}h`;
    }

    if (totalDays < 365) {
        // Use 3-digit days for 100-364 days
        return `${String(totalDays).padStart(3, '0')}d ${String(hrs).padStart(2, '0')}h`;
    }

    if (totalDays < 3652) {
        // Years and days (1-9 years)
        const years = Math.floor(totalDays / 365);
        const days = totalDays % 365;
        return `${years}y ${String(days).padStart(3, '0')}d`;
    }

    // Decades and years (10+ years)
    const decades = Math.floor(totalDays / 3652);
    const years = Math.floor((totalDays % 3652) / 365);
    return `${String(decades).padStart(2, '0')}dec ${years}y`;
}

/**
 * Update time display with current date and mission elapsed timer.
 */
function updateTimeDisplay() {
    const jd = getJulianDate();
    const g = julianToGregorian(jd);
    const elapsed = getTime();

    const dateStr = `${String(g.day).padStart(2, '0')} ${MONTH_ABBR[g.month - 1]} ${g.year} ` +
        `${String(g.hours).padStart(2, '0')}:${String(g.minutes).padStart(2, '0')}:${String(g.seconds).padStart(2, '0')} UTC`;
    const missionStr = `T+ ${formatMissionTime(elapsed)}`;

    const timeText = `${dateStr} // ${missionStr}`;
    setTextIfChanged(elements.timeDisplay, timeText);
    setTextIfChanged(elements.mobileTimeDisplay, timeText);
}

/**
 * Update tripometer display with distance, elapsed time, and average speed.
 */
function updateTripometerDisplay() {
    setTextIfChanged(elements.tripDist, formatTripDistance());
    setTextIfChanged(elements.tripTime, 'T+ ' + formatMissionTime(getTripElapsedDays()));

    // Format speeds with leading zeros for whole part (up to 3 digits before decimal)
    const avgSpeed = getTripAvgSpeedKmS();
    const minSpeed = getTripMinSpeedKmS();
    const maxSpeed = getTripMaxSpeedKmS();

    const formatSpeed = (speed) => {
        const wholePart = Math.floor(speed);
        const decimalPart = (speed - wholePart).toFixed(2).substring(1); // ".XX"
        return String(wholePart).padStart(3, '0') + decimalPart;
    };

    setTextIfChanged(elements.tripAvg, 'AVG ' + formatSpeed(avgSpeed) + ' km/s');
    setTextIfChanged(elements.tripMinSpeed, 'MIN ' + formatSpeed(minSpeed));
    setTextIfChanged(elements.tripMaxSpeed, 'MAX ' + formatSpeed(maxSpeed) + ' km/s');
}

/**
 * Round to nearest "nice" number in 1-2-5 series for scale display
 * @param {number} value - Raw value to round
 * @returns {number} Nice round number
 */
function niceScaleNumber(value) {
    if (value <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / pow;

    if (normalized < 1.5) return 1 * pow;
    if (normalized < 3.5) return 2 * pow;
    if (normalized < 7.5) return 5 * pow;
    return 10 * pow;
}

/**
 * Format a distance value with adaptive units based on magnitude and zoom level.
 *
 * Picks the most meaningful unit (AU, M km, K km, km) based on the distance
 * value, and adds extra precision when zoomed in close so that small sail
 * adjustments produce visible changes in the display.
 *
 * @param {number} distanceAU - Distance in AU
 * @returns {string} Formatted distance string (e.g. "1.24 AU", "8.98 M km", "142 K km")
 */
function formatDistance(distanceAU) {
    const KM_PER_AU = 149597870.7;
    const km = distanceAU * KM_PER_AU;

    // Determine extra precision from effective zoom
    // Higher zoom = more pixels per AU = user is looking at finer detail
    const effectiveScale = getScale() * camera.zoom;
    let bonusDecimals = 0;
    if (effectiveScale > 10000) {
        bonusDecimals = 2;
    } else if (effectiveScale > 2000) {
        bonusDecimals = 1;
    }

    if (distanceAU >= 1) {
        // Large distances: AU with 2 decimals
        const decimals = 2 + bonusDecimals;
        return distanceAU.toFixed(decimals) + ' AU';
    } else if (distanceAU >= 0.1) {
        // Medium distances: AU with 3 decimals
        const decimals = 3 + bonusDecimals;
        return distanceAU.toFixed(decimals) + ' AU';
    } else if (km >= 1000000) {
        // 1M-15M km range: millions of km
        const mKm = km / 1000000;
        const decimals = 2 + bonusDecimals;
        return mKm.toFixed(decimals) + ' M km';
    } else if (km >= 10000) {
        // 10K-1M km range: thousands of km
        const kKm = km / 1000;
        const decimals = Math.min(1 + bonusDecimals, 3);
        return kKm.toFixed(decimals) + ' K km';
    } else if (km >= 100) {
        // 100-10K km: plain km, no decimals
        return Math.round(km).toLocaleString('en-US') + ' km';
    } else {
        // Sub-100 km: km with decimals
        return km.toFixed(1) + ' km';
    }
}

/** Track last effective scale to skip redundant updateScaleDisplay calculations */
let lastEffectiveScale = -1;

/**
 * Update scale display dynamically based on effective zoom (base scale * camera.zoom)
 */
function updateScaleDisplay() {
    if (!elements.scaleDisplay) return;

    const effectiveScale = getScale() * camera.zoom; // pixels per AU

    // Skip expensive log/pow calculations when zoom hasn't changed
    if (effectiveScale === lastEffectiveScale) return;
    lastEffectiveScale = effectiveScale;
    const KM_PER_AU = 149597870.7;

    // Find a nice reference distance that maps to roughly 100 pixels
    const auForTargetPx = 100 / effectiveScale;

    // Round to a nice 1-2-5 series number
    const niceAU = niceScaleNumber(auForTargetPx);
    const nicePx = Math.round(niceAU * effectiveScale);

    if (niceAU >= 0.01) {
        // Display in AU
        let auStr;
        if (niceAU >= 1) {
            auStr = niceAU.toString();
        } else {
            // Show enough decimal places to represent the value
            const decimals = Math.max(0, -Math.floor(Math.log10(niceAU)));
            auStr = niceAU.toFixed(decimals);
        }
        elements.scaleDisplay.textContent = `${auStr} AU = ${nicePx}px`;
    } else {
        // Display in km for very close zoom
        const km = niceAU * KM_PER_AU;
        const niceKm = niceScaleNumber(km);
        const kmPx = Math.round((niceKm / KM_PER_AU) * effectiveScale);

        if (niceKm >= 1000000) {
            elements.scaleDisplay.textContent = `${niceKm / 1000000}M km = ${kmPx}px`;
        } else if (niceKm >= 1000) {
            elements.scaleDisplay.textContent = `${niceKm / 1000}K km = ${kmPx}px`;
        } else {
            elements.scaleDisplay.textContent = `${niceKm} km = ${kmPx}px`;
        }
    }
}

/**
 * Update view angle display (camera elevation and rotation)
 */
function updateViewDisplay() {
    if (!elements.viewDisplay) return;

    // Elevation from ecliptic plane: 90° = top-down (angleX=0), 0° = edge-on (angleX=π/2)
    const elevDeg = Math.round(90 - camera.angleX * 180 / Math.PI);

    // Rotation around Z axis
    let rotDeg = Math.round(camera.angleZ * 180 / Math.PI);
    if (rotDeg === 360) rotDeg = 0;

    const text = rotDeg === 0
        ? `ECLIPTIC +${elevDeg}°`
        : `+${elevDeg}° EL ${rotDeg}° ROT`;
    setTextIfChanged(elements.viewDisplay, text);
}

/**
 * Update tracking display (what the camera is following)
 */
function updateTrackingDisplay() {
    if (!elements.trackingDisplay) return;

    setTextIfChanged(elements.trackingDisplay,
        camera.followTarget ? `TRACKING: ${camera.followTarget}` : 'FREE CAMERA');
}

/**
 * Update coordinate display with player ship position
 */
function updateCoordDisplay() {
    if (!elements.coordDisplay) return;

    const player = getPlayerShip();
    if (!player) return;

    setTextIfChanged(elements.coordDisplay,
        `X: ${player.x.toFixed(3)} Y: ${player.y.toFixed(3)} Z: ${player.z.toFixed(3)} AU`);
}

/**
 * Update destination info display
 */
function updateDestinationDisplay() {
    const info = getDestinationInfo();

    if (info) {
        setTextIfChanged(elements.destDist, formatDistance(info.distance));

        // Show relative velocity to target (important for capture)
        if (elements.relVelocity && info.relativeVelocity !== null) {
            setTextIfChanged(elements.relVelocity, info.relativeVelocity.toFixed(1) + ' km/s');
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
        setTextIfChanged(elements.closestDist, formatDistance(closestDistance));
        if (elements.timeToClosest) {
            const days = Math.floor(timeToClosest);
            const hours = Math.floor((timeToClosest % 1) * 24);
            setTextIfChanged(elements.timeToClosest, `${days}d ${hours}h`);
        }
        if (elements.interceptStatus) {
            setTextIfChanged(elements.interceptStatus, status);
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
        setTextIfChanged(elements.sailThrust, thrustText);

        // Update g-force display
        setTextIfChanged(elements.sailAccelG, thrustInfo.accelerationG.toFixed(6) + ' g');
    } else {
        // No thrust info available
        setTextIfChanged(elements.sailThrust, '0.000 mm/s²');
        setTextIfChanged(elements.sailAccelG, '0.000000 g');
    }

    // Update velocity display (throttled to every 6 frames for performance)
    if (++velocityFrameCounter >= 6) {
        velocityFrameCounter = 0;
        const velocityKmS = getShipVelocityKmS(player);
        setTextIfChanged(elements.sailVelocity, velocityKmS.toFixed(2) + ' km/s');
    }

    // Update slider value displays if sail exists
    if (player.sail) {
        // Helper to format values - show decimal only if not a whole number
        const formatValue = (val, suffix) => {
            // Round to 2 decimal places to support UBER resolution (0.01)
            const rounded = Math.round(val * 100) / 100;
            const display = Number.isInteger(rounded) ? rounded : parseFloat(rounded.toFixed(2));
            return display + suffix;
        };

        setTextIfChanged(elements.sailDeployValue, formatValue(player.sail.deploymentPercent, '%'));
        if (elements.sailAngleValue) {
            const degrees = player.sail.angle * 180 / Math.PI;
            setTextIfChanged(elements.sailAngleValue, formatValue(degrees, '°'));
        }

        // Update mobile sail widget values (using cached elements from initUI)
        setTextIfChanged(elements.mobileSailDeployValue, formatValue(player.sail.deploymentPercent, '%'));
        if (elements.mobileSailDeployment) {
            elements.mobileSailDeployment.value = player.sail.deploymentPercent;
        }

        const yawDeg = player.sail.angle * 180 / Math.PI;
        setTextIfChanged(elements.mobileSailYawValue, formatValue(yawDeg, '°'));
        if (elements.mobileSailYaw) {
            elements.mobileSailYaw.value = yawDeg;
        }

        const pitchDeg = (player.sail.pitchAngle || 0) * 180 / Math.PI;
        setTextIfChanged(elements.mobileSailPitchValue, formatValue(pitchDeg, '°'));
        if (elements.mobileSailPitch) {
            elements.mobileSailPitch.value = pitchDeg;
        }

        setTextIfChanged(elements.mobileSailThrust, thrustText);
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

    setTextIfChanged(elements.thrusterDeltaV, deltaVRemaining.toFixed(1) + ' km/s');

    if (elements.thrusterFuelFill) {
        const pct = (deltaVRemaining / deltaVMax) * 100;
        const pctStr = pct + '%';
        if (elements.thrusterFuelFill.style.width !== pctStr) {
            elements.thrusterFuelFill.style.width = pctStr;
        }
        if (pct < 20) {
            elements.thrusterFuelFill.classList.add('low');
        } else {
            elements.thrusterFuelFill.classList.remove('low');
        }
    }

    // Disable buttons if no fuel (using cached elements)
    const hasFuel = deltaVRemaining > 0;
    if (elements.thrusterRetrograde) elements.thrusterRetrograde.disabled = !hasFuel;
    if (elements.thrusterPrograde) elements.thrusterPrograde.disabled = !hasFuel;

    // Update header fuel indicator (using cached element)
    if (elements.fuelIndicator) {
        const pct = (deltaVRemaining / deltaVMax) * 100;
        elements.fuelIndicator.classList.remove('warning', 'active');
        if (pct < 30) {
            elements.fuelIndicator.classList.add('warning');
        } else {
            elements.fuelIndicator.classList.add('active');
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
        const statusText = isInSOI ? 'IN SOI' : 'HELIOCENTRIC';
        setTextIfChanged(elements.soiStatus, statusText);
        if (isInSOI) {
            elements.soiStatus.classList.add('in-soi');
            elements.soiStatus.classList.remove('heliocentric');
        } else {
            elements.soiStatus.classList.remove('in-soi');
            elements.soiStatus.classList.add('heliocentric');
        }
    }

    // Update current parent body
    setTextIfChanged(elements.soiBody, currentBody);
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
    setTextIfChanged(elements.shipInclination, shipIncDeg.toFixed(2) + '°');
    setTextIfChanged(elements.targetInclination, targetIncDeg.toFixed(2) + '°');

    if (elements.deltaInclination) {
        setTextIfChanged(elements.deltaInclination, deltaIncDeg.toFixed(2) + '°');

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

    setTextIfChanged(elements.planeChangeDirection, direction);
}
