/**
 * Ephemeris calculations using astronomy-engine library
 *
 * Provides accurate planetary positions for any date 1900-2100 using JPL ephemeris data.
 * This is a wrapper around astronomy-engine with:
 * - Name mapping (game names → astronomy-engine names)
 * - Caching for performance
 * - Fallback error handling
 */

// astronomy-engine is loaded as global Astronomy object via script tag
// We check for its existence before using

/**
 * Planet name mapping: game names → astronomy-engine names
 * astronomy-engine uses capitalized names like 'Mercury', 'Mars'
 * Game uses uppercase like 'MERCURY', 'MARS'
 */
const PLANET_NAME_MAP = {
    'MERCURY': 'Mercury',
    'VENUS': 'Venus',
    'EARTH': 'Earth',
    'MARS': 'Mars',
    'JUPITER': 'Jupiter',
    'SATURN': 'Saturn',
    'URANUS': 'Uranus',
    'NEPTUNE': 'Neptune',
    'PLUTO': 'Pluto',
    'SOL': 'Sun',
    'SUN': 'Sun',
};

/**
 * Simple cache for ephemeris calculations
 * Key: `${bodyName}_${julianDate.toFixed(6)}`
 * Value: {x, y, z, vx, vy, vz}
 * TTL: 100ms
 */
const cache = new Map();
const CACHE_TTL = 100;  // milliseconds

/**
 * Get heliocentric position and velocity for a celestial body at a given date
 *
 * @param {string} bodyName - Planet name (game format: 'MARS', 'EARTH', etc.)
 * @param {Date} date - JavaScript Date object
 * @returns {{x: number, y: number, z: number, vx: number, vy: number, vz: number}|null}
 *          Position in AU, velocity in AU/day, or null if failed
 */
export function getHeliocentricPosition(bodyName, date) {
    // Check if astronomy-engine is loaded
    if (typeof Astronomy === 'undefined') {
        console.warn('astronomy-engine not loaded, cannot calculate ephemeris');
        return null;
    }

    // Handle Sun (always at origin in heliocentric coordinates)
    if (bodyName === 'SOL' || bodyName === 'SUN') {
        return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    }

    // Map game name to astronomy-engine name
    const astronomyName = PLANET_NAME_MAP[bodyName];
    if (!astronomyName) {
        console.warn(`Unknown body name: ${bodyName}`);
        return null;
    }

    // Check cache
    const jd = (date.getTime() / 86400000) + 2440587.5;
    const cacheKey = `${bodyName}_${jd.toFixed(6)}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    try {
        // Calculate position using astronomy-engine
        const time = Astronomy.MakeTime(date);
        const state = Astronomy.HelioState(astronomyName, time);

        const result = {
            x: state.x,   // AU
            y: state.y,
            z: state.z,
            vx: state.vx, // AU/day
            vy: state.vy,
            vz: state.vz
        };

        // Store in cache
        cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        // Limit cache size (prevent memory leak)
        if (cache.size > 100) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }

        return result;
    } catch (error) {
        console.error(`Failed to calculate position for ${bodyName}:`, error);
        return null;
    }
}

/**
 * Check if astronomy-engine library is available
 * @returns {boolean}
 */
export function isEphemerisAvailable() {
    return typeof Astronomy !== 'undefined';
}

/**
 * Clear ephemeris cache (call when time jumps significantly)
 */
export function clearEphemerisCache() {
    cache.clear();
}
