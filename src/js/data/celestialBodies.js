/**
 * Celestial bodies data - planets, moons, asteroids
 * Coordinates in AU (Astronomical Units)
 *
 * Uses Keplerian orbital elements for realistic orbital mechanics.
 * Display properties (radius, color) are stored separately in config.js.
 */

import { getPosition, MU_SUN, J2000 } from '../lib/orbital.js';
import { getJulianDate, timeTravelState, getEphemerisDate, isPlanningMode, bodyFilters } from '../core/gameState.js';
import { GRAVITATIONAL_PARAMS, BODY_DISPLAY } from '../config.js';
import { getHeliocentricPosition } from '../lib/ephemeris.js';

// ============================================================================
// Orbital Elements Data
// ============================================================================

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
function deg2rad(deg) {
    return deg * Math.PI / 180;
}

/**
 * Celestial bodies with Keplerian orbital elements.
 *
 * Orbital elements (for bodies with orbits):
 *   a  - semi-major axis (AU)
 *   e  - eccentricity
 *   i  - inclination (radians)
 *   Ω  - longitude of ascending node (radians)
 *   ω  - argument of periapsis (radians)
 *   M0 - mean anomaly at epoch (radians)
 *   epoch - Julian date of epoch
 *   μ  - gravitational parameter of parent (AU³/day²)
 *
 * Display properties (radius, color) are looked up from BODY_DISPLAY in config.js.
 */
export const celestialBodies = [
    // ========================================================================
    // Sun (stationary at origin)
    // ========================================================================
    {
        name: 'SOL',
        type: 'star',
        x: 0, y: 0, z: 0,
    },

    // ========================================================================
    // Planets
    // ========================================================================
    {
        name: 'MERCURY',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 0.387098,           // AU
            e: 0.205630,           // Highest eccentricity of planets
            i: deg2rad(7.005),     // Inclination to ecliptic
            Ω: deg2rad(48.331),    // Longitude of ascending node
            ω: deg2rad(29.124),    // Argument of periapsis
            M0: deg2rad(174.796),  // Mean anomaly at J2000
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'VENUS',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 0.723332,
            e: 0.006772,           // Very circular
            i: deg2rad(3.39458),
            Ω: deg2rad(76.680),
            ω: deg2rad(54.884),
            M0: deg2rad(50.115),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'EARTH',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 1.000001018,        // AU (by definition, approximately 1)
            e: 0.0167086,
            i: deg2rad(0.00005),   // Reference plane (nearly 0)
            Ω: deg2rad(-11.26064),
            ω: deg2rad(114.20783),
            M0: deg2rad(358.617),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'MARS',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 1.523679,
            e: 0.0934,
            i: deg2rad(1.850),
            Ω: deg2rad(49.558),
            ω: deg2rad(286.502),
            M0: deg2rad(19.373),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'JUPITER',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 5.2044,
            e: 0.0489,
            i: deg2rad(1.303),
            Ω: deg2rad(100.464),
            ω: deg2rad(273.867),
            M0: deg2rad(20.020),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'SATURN',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 9.5826,
            e: 0.0565,
            i: deg2rad(2.485),
            Ω: deg2rad(113.665),
            ω: deg2rad(339.392),
            M0: deg2rad(317.020),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'URANUS',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 19.2184,
            e: 0.0457,
            i: deg2rad(0.773),
            Ω: deg2rad(74.006),
            ω: deg2rad(96.998),
            M0: deg2rad(142.238),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'NEPTUNE',
        type: 'planet',
        category: 'planet',
        elements: {
            a: 30.110387,
            e: 0.0113,
            i: deg2rad(1.770),
            Ω: deg2rad(131.784),
            ω: deg2rad(276.336),
            M0: deg2rad(256.228),
            epoch: J2000,
            μ: MU_SUN
        },
    },

    // ========================================================================
    // Dwarf Planets
    // ========================================================================
    {
        name: 'CERES',
        type: 'asteroid',
        category: 'dwarf-planet',
        elements: {
            a: 2.7691651,
            e: 0.0760090,
            i: deg2rad(10.59406),
            Ω: deg2rad(80.3055),
            ω: deg2rad(73.5977),
            M0: deg2rad(77.372),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'PLUTO',
        type: 'planet',
        category: 'dwarf-planet',
        elements: {
            a: 39.48211675,
            e: 0.24882730,
            i: deg2rad(17.14001206),
            Ω: deg2rad(110.29914900),
            ω: deg2rad(113.76329000),
            M0: deg2rad(14.86205900),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'ERIS',
        type: 'planet',
        category: 'dwarf-planet',
        elements: {
            a: 67.668,
            e: 0.44068,
            i: deg2rad(44.040),
            Ω: deg2rad(35.951),
            ω: deg2rad(151.430),
            M0: deg2rad(205.989),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'MAKEMAKE',
        type: 'planet',
        category: 'dwarf-planet',
        elements: {
            a: 45.791,
            e: 0.15586,
            i: deg2rad(28.983),
            Ω: deg2rad(79.620),
            ω: deg2rad(298.410),
            M0: deg2rad(165.514),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'HAUMEA',
        type: 'planet',
        category: 'dwarf-planet',
        elements: {
            a: 43.116,
            e: 0.19126,
            i: deg2rad(28.213),
            Ω: deg2rad(122.167),
            ω: deg2rad(239.041),
            M0: deg2rad(218.205),
            epoch: J2000,
            μ: MU_SUN
        },
    },

    // ========================================================================
    // Major Moons
    // ========================================================================
    // Earth
    {
        name: 'LUNA',
        type: 'moon',
        category: 'major-moon',
        parent: 'EARTH',
        elements: {
            a: 0.00257,            // ~384,400 km in AU
            e: 0.0549,
            i: deg2rad(5.145),     // To ecliptic (varies due to precession)
            Ω: deg2rad(125.08),    // Precesses with 18.6 year period
            ω: deg2rad(318.15),
            M0: deg2rad(135.27),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.earth
        },
    },

    // Mars
    {
        name: 'PHOBOS',
        type: 'moon',
        category: 'major-moon',
        parent: 'MARS',
        elements: {
            a: 0.0000629,          // ~9,376 km in AU
            e: 0.0151,
            i: deg2rad(1.093),     // To Mars equator
            Ω: deg2rad(16.946),
            ω: deg2rad(150.057),
            M0: deg2rad(91.059),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.mars
        },
    },
    {
        name: 'DEIMOS',
        type: 'moon',
        category: 'major-moon',
        parent: 'MARS',
        elements: {
            a: 0.000157,           // ~23,460 km in AU
            e: 0.00033,
            i: deg2rad(1.791),
            Ω: deg2rad(47.650),
            ω: deg2rad(290.496),
            M0: deg2rad(296.230),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.mars
        },
    },

    // Jupiter
    {
        name: 'IO',
        type: 'moon',
        category: 'major-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.002819,           // ~421,700 km in AU
            e: 0.0041,
            i: deg2rad(0.050),
            Ω: deg2rad(43.977),
            ω: deg2rad(84.129),
            M0: deg2rad(342.021),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },
    {
        name: 'EUROPA',
        type: 'moon',
        category: 'major-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.004486,           // ~671,034 km in AU
            e: 0.0094,
            i: deg2rad(0.470),
            Ω: deg2rad(219.106),
            ω: deg2rad(88.970),
            M0: deg2rad(171.016),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },
    {
        name: 'GANYMEDE',
        type: 'moon',
        category: 'major-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.00716,            // ~1,070,400 km in AU
            e: 0.0013,
            i: deg2rad(0.20),
            Ω: deg2rad(63.552),
            ω: deg2rad(192.417),
            M0: deg2rad(317.54),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },
    {
        name: 'CALLISTO',
        type: 'moon',
        category: 'major-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.01259,            // ~1,882,700 km in AU
            e: 0.0074,
            i: deg2rad(0.192),
            Ω: deg2rad(298.848),
            ω: deg2rad(52.643),
            M0: deg2rad(181.408),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },

    // Saturn
    {
        name: 'MIMAS',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.001239,           // ~185,539 km in AU
            e: 0.0196,
            i: deg2rad(1.574),
            Ω: deg2rad(139.771),
            ω: deg2rad(334.307),
            M0: deg2rad(127.690),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'ENCELADUS',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.001591,           // ~237,948 km in AU
            e: 0.0047,
            i: deg2rad(0.009),
            Ω: deg2rad(223.947),
            ω: deg2rad(170.226),
            M0: deg2rad(320.130),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'TETHYS',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.001970,           // ~294,619 km in AU
            e: 0.0001,
            i: deg2rad(1.091),
            Ω: deg2rad(167.789),
            ω: deg2rad(262.626),
            M0: deg2rad(156.220),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'DIONE',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.002524,           // ~377,396 km in AU
            e: 0.0022,
            i: deg2rad(0.019),
            Ω: deg2rad(290.341),
            ω: deg2rad(127.810),
            M0: deg2rad(310.580),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'RHEA',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.003521,           // ~527,108 km in AU
            e: 0.0013,
            i: deg2rad(0.345),
            Ω: deg2rad(318.042),
            ω: deg2rad(65.330),
            M0: deg2rad(190.670),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'TITAN',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.008168,           // ~1,221,870 km in AU
            e: 0.0288,
            i: deg2rad(0.348),
            Ω: deg2rad(28.056),
            ω: deg2rad(180.532),
            M0: deg2rad(163.280),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'IAPETUS',
        type: 'moon',
        category: 'major-moon',
        parent: 'SATURN',
        elements: {
            a: 0.02381,            // ~3,560,820 km in AU
            e: 0.0283,
            i: deg2rad(15.47),
            Ω: deg2rad(81.148),
            ω: deg2rad(271.606),
            M0: deg2rad(350.180),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },

    // Uranus
    {
        name: 'MIRANDA',
        type: 'moon',
        category: 'major-moon',
        parent: 'URANUS',
        elements: {
            a: 0.000869,           // ~129,390 km in AU
            e: 0.0013,
            i: deg2rad(4.338),
            Ω: deg2rad(172.248),
            ω: deg2rad(68.312),
            M0: deg2rad(311.330),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.uranus
        },
    },
    {
        name: 'ARIEL',
        type: 'moon',
        category: 'major-moon',
        parent: 'URANUS',
        elements: {
            a: 0.001278,           // ~191,020 km in AU
            e: 0.0012,
            i: deg2rad(0.260),
            Ω: deg2rad(22.394),
            ω: deg2rad(115.349),
            M0: deg2rad(39.481),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.uranus
        },
    },
    {
        name: 'UMBRIEL',
        type: 'moon',
        category: 'major-moon',
        parent: 'URANUS',
        elements: {
            a: 0.001784,           // ~266,300 km in AU
            e: 0.0039,
            i: deg2rad(0.128),
            Ω: deg2rad(33.485),
            ω: deg2rad(84.709),
            M0: deg2rad(12.469),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.uranus
        },
    },
    {
        name: 'TITANIA',
        type: 'moon',
        category: 'major-moon',
        parent: 'URANUS',
        elements: {
            a: 0.002911,           // ~435,910 km in AU
            e: 0.0011,
            i: deg2rad(0.340),
            Ω: deg2rad(99.771),
            ω: deg2rad(284.400),
            M0: deg2rad(24.614),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.uranus
        },
    },
    {
        name: 'OBERON',
        type: 'moon',
        category: 'major-moon',
        parent: 'URANUS',
        elements: {
            a: 0.003898,           // ~583,520 km in AU
            e: 0.0014,
            i: deg2rad(0.058),
            Ω: deg2rad(104.400),
            ω: deg2rad(106.324),
            M0: deg2rad(283.088),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.uranus
        },
    },

    // Neptune
    {
        name: 'TRITON',
        type: 'moon',
        category: 'major-moon',
        parent: 'NEPTUNE',
        elements: {
            a: 0.002371,           // ~354,760 km in AU
            e: 0.000016,
            i: deg2rad(156.885),   // Retrograde orbit
            Ω: deg2rad(177.608),
            ω: deg2rad(344.046),
            M0: deg2rad(359.341),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.neptune
        },
    },
    {
        name: 'PROTEUS',
        type: 'moon',
        category: 'major-moon',
        parent: 'NEPTUNE',
        elements: {
            a: 0.000788,           // ~117,646 km in AU
            e: 0.0005,
            i: deg2rad(0.524),
            Ω: deg2rad(47.099),
            ω: deg2rad(93.357),
            M0: deg2rad(102.215),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.neptune
        },
    },

    // Pluto
    {
        name: 'CHARON',
        type: 'moon',
        category: 'major-moon',
        parent: 'PLUTO',
        elements: {
            a: 0.000131,           // ~19,591 km in AU
            e: 0.0022,
            i: deg2rad(0.001),
            Ω: deg2rad(223.046),
            ω: deg2rad(146.596),
            M0: deg2rad(147.848),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.pluto
        },
    },

    // ========================================================================
    // Minor Moons
    // ========================================================================
    // Jupiter
    {
        name: 'AMALTHEA',
        type: 'moon',
        category: 'minor-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.001214,           // ~181,366 km in AU
            e: 0.0032,
            i: deg2rad(0.374),
            Ω: deg2rad(108.946),
            ω: deg2rad(155.873),
            M0: deg2rad(185.194),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },
    {
        name: 'THEBE',
        type: 'moon',
        category: 'minor-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.001483,           // ~221,889 km in AU
            e: 0.0175,
            i: deg2rad(1.076),
            Ω: deg2rad(235.694),
            ω: deg2rad(234.269),
            M0: deg2rad(135.956),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },
    {
        name: 'HIMALIA',
        type: 'moon',
        category: 'minor-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.07659,            // ~11,460,000 km in AU
            e: 0.1623,
            i: deg2rad(27.496),
            Ω: deg2rad(57.245),
            ω: deg2rad(50.994),
            M0: deg2rad(323.290),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },
    {
        name: 'ELARA',
        type: 'moon',
        category: 'minor-moon',
        parent: 'JUPITER',
        elements: {
            a: 0.07837,            // ~11,720,000 km in AU
            e: 0.2174,
            i: deg2rad(26.627),
            Ω: deg2rad(107.040),
            ω: deg2rad(355.364),
            M0: deg2rad(134.730),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.jupiter
        },
    },

    // Saturn
    {
        name: 'HYPERION',
        type: 'moon',
        category: 'minor-moon',
        parent: 'SATURN',
        elements: {
            a: 0.009933,           // ~1,481,010 km in AU
            e: 0.0232,
            i: deg2rad(0.630),
            Ω: deg2rad(168.819),
            ω: deg2rad(320.362),
            M0: deg2rad(184.580),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'PHOEBE',
        type: 'moon',
        category: 'minor-moon',
        parent: 'SATURN',
        elements: {
            a: 0.08652,            // ~12,947,780 km in AU
            e: 0.1562,
            i: deg2rad(175.986),   // Retrograde
            Ω: deg2rad(245.998),
            ω: deg2rad(280.211),
            M0: deg2rad(230.000),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'JANUS',
        type: 'moon',
        category: 'minor-moon',
        parent: 'SATURN',
        elements: {
            a: 0.001016,           // ~151,460 km in AU
            e: 0.0068,
            i: deg2rad(0.163),
            Ω: deg2rad(54.509),
            ω: deg2rad(284.826),
            M0: deg2rad(28.690),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },
    {
        name: 'EPIMETHEUS',
        type: 'moon',
        category: 'minor-moon',
        parent: 'SATURN',
        elements: {
            a: 0.001016,           // ~151,410 km in AU
            e: 0.0098,
            i: deg2rad(0.335),
            Ω: deg2rad(127.470),
            ω: deg2rad(206.799),
            M0: deg2rad(297.177),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.saturn
        },
    },

    // Uranus
    {
        name: 'PUCK',
        type: 'moon',
        category: 'minor-moon',
        parent: 'URANUS',
        elements: {
            a: 0.000575,           // ~86,004 km in AU
            e: 0.0001,
            i: deg2rad(0.319),
            Ω: deg2rad(245.934),
            ω: deg2rad(91.247),
            M0: deg2rad(218.930),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.uranus
        },
    },

    // Neptune
    {
        name: 'NEREID',
        type: 'moon',
        category: 'minor-moon',
        parent: 'NEPTUNE',
        elements: {
            a: 0.03685,            // ~5,513,400 km in AU
            e: 0.7507,
            i: deg2rad(7.090),
            Ω: deg2rad(334.762),
            ω: deg2rad(17.686),
            M0: deg2rad(358.979),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.neptune
        },
    },
    {
        name: 'LARISSA',
        type: 'moon',
        category: 'minor-moon',
        parent: 'NEPTUNE',
        elements: {
            a: 0.000492,           // ~73,548 km in AU
            e: 0.0014,
            i: deg2rad(0.205),
            Ω: deg2rad(239.736),
            ω: deg2rad(178.258),
            M0: deg2rad(325.020),
            epoch: J2000,
            μ: GRAVITATIONAL_PARAMS.neptune
        },
    },

    // ========================================================================
    // Asteroids
    // ========================================================================
    {
        name: 'VESTA',
        type: 'asteroid',
        category: 'asteroid',
        elements: {
            a: 2.361793,
            e: 0.088622,
            i: deg2rad(7.140),
            Ω: deg2rad(103.809),
            ω: deg2rad(150.297),
            M0: deg2rad(205.549),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'PALLAS',
        type: 'asteroid',
        category: 'asteroid',
        elements: {
            a: 2.773155,
            e: 0.230880,
            i: deg2rad(34.836),
            Ω: deg2rad(173.096),
            ω: deg2rad(310.049),
            M0: deg2rad(78.184),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'JUNO',
        type: 'asteroid',
        category: 'asteroid',
        elements: {
            a: 2.669634,
            e: 0.255904,
            i: deg2rad(12.971),
            Ω: deg2rad(169.871),
            ω: deg2rad(248.410),
            M0: deg2rad(53.704),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'HYGIEA',
        type: 'asteroid',
        category: 'asteroid',
        elements: {
            a: 3.138706,
            e: 0.114254,
            i: deg2rad(3.842),
            Ω: deg2rad(283.415),
            ω: deg2rad(312.325),
            M0: deg2rad(198.636),
            epoch: J2000,
            μ: MU_SUN
        },
    },
    {
        name: 'EROS',
        type: 'asteroid',
        category: 'asteroid',
        elements: {
            a: 1.458261,
            e: 0.222885,
            i: deg2rad(10.829),
            Ω: deg2rad(304.401),
            ω: deg2rad(178.664),
            M0: deg2rad(320.215),
            epoch: J2000,
            μ: MU_SUN
        },
    }
];

// ============================================================================
// Position Update Functions
// ============================================================================

/**
 * Update positions of all celestial bodies based on current Julian date.
 * Uses Keplerian orbital mechanics via the orbital library.
 *
 * TIME TRAVEL MODE:
 * When timeTravelState.enabled = true, uses astronomy-engine ephemeris data
 * instead of Keplerian propagation for accurate historical/future positions.
 *
 * Note: Julian date is managed by gameState.js and accessed via getJulianDate().
 */
export function updateCelestialPositions() {
    // Choose date source based on time travel or planning mode
    // - Planning mode: Always ephemeris (synchronized with ship)
    // - Time travel enabled: Ephemeris for historical/future accuracy
    // - Live mode: Keplerian (fast, deterministic)
    const useEphemeris = timeTravelState.enabled || isPlanningMode();
    const jd = useEphemeris ? null : getJulianDate();
    const ephemerisDate = useEphemeris ? getEphemerisDate() : null;

    // First pass: update all non-moon bodies
    celestialBodies.forEach(body => {
        if (body.elements && !body.parent) {
            let pos;

            if (useEphemeris) {
                // Use astronomy-engine ephemeris (time travel or planning mode)
                pos = getHeliocentricPosition(body.name, ephemerisDate);
                if (!pos) {
                    // Fallback to Keplerian if ephemeris fails
                    pos = getPosition(body.elements, jd || getJulianDate());
                }
            } else {
                // Use Keplerian propagation (live mode)
                pos = getPosition(body.elements, jd);
            }

            body.x = pos.x;
            body.y = pos.y;
            body.z = pos.z;
        }
    });

    // Second pass: update moons (need parent positions first)
    celestialBodies.forEach(body => {
        if (body.elements && body.parent) {
            const parent = celestialBodies.find(b => b.name === body.parent);
            if (parent) {
                // Moons always use Keplerian propagation relative to parent
                // (astronomy-engine doesn't provide moon ephemeris in HelioState)
                const relPos = getPosition(body.elements, jd || getJulianDate());

                // Add parent's position for absolute coordinates
                body.x = parent.x + relPos.x;
                body.y = parent.y + relPos.y;
                body.z = parent.z + relPos.z;
            }
        }
    });
}

/**
 * Get a celestial body by name
 * @param {string} name - Body name
 * @returns {Object|undefined} The celestial body
 */
export function getBodyByName(name) {
    return celestialBodies.find(b => b.name === name);
}

/**
 * Get display properties for a celestial body.
 * @param {Object|string} body - Body object or name
 * @returns {Object} Display properties { radius, color }
 */
export function getBodyDisplay(body) {
    const name = typeof body === 'string' ? body : body.name;
    return BODY_DISPLAY[name] || { radius: 4, color: '#ffffff' };
}

/**
 * Get only the bodies that should be displayed based on current filter settings.
 * NOTE: Physics systems should use the full celestialBodies array, not this.
 * This is for rendering, labels, navigation dropdown, etc.
 *
 * @returns {Array} Filtered array of celestial bodies
 */
export function getVisibleBodies() {
    return celestialBodies.filter(body =>
        !body.category || bodyFilters[body.category]
    );
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Get orbital properties for rendering orbit paths.
 * Returns simplified orbital parameters for drawing ellipses.
 *
 * @param {Object} body - Celestial body object
 * @returns {Object|null} Orbital properties or null if no orbit
 */
export function getOrbitalProperties(body) {
    if (!body.elements) {
        return null;
    }

    const { a, e, i, Ω, ω } = body.elements;

    return {
        semiMajorAxis: a,
        eccentricity: e,
        inclination: i,
        longitudeOfAscendingNode: Ω,
        argumentOfPeriapsis: ω,
        // Derived values useful for rendering
        semiMinorAxis: a * Math.sqrt(1 - e * e),
        periapsis: a * (1 - e),
        apoapsis: a * (1 + e)
    };
}
