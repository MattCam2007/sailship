# Ghost Planet Meaningful Filtering - Review Report

**Date:** 2026-02-09
**Plan Version:** `reports/ghost-planet-filtering-implementation-plan-2026-02-09.md`
**Reviewers:** Solar Sailing Expert, Physicist, Failure Analyst, Architect

## 1. Physics/Realism

### Findings
- Angular separation computation (dot product of heliocentric vectors) is physically correct
- 3D angle closely matches 2D in-plane angle for low-inclination planets; correct for all bodies
- Numerical guards already handle edge cases (division by zero, acos clamping)
- Distance-angle relationship: d ≈ 2a × sin(θ/2). At 45°, d ≈ 0.77a — naturally scales with orbital radius

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Nice-to-have | Document the d ≈ 2a×sin(θ/2) relationship near the config constant | Add code comment |

## 2. Solar Sailing Expert

### Findings
- 45° is a reasonable static threshold for phase gap filtering
- Closing a 45° gap requires significant orbit changes; achievable for far-future crossings, not for near-term
- Angular separation is the correct metric (orbital phase is inherently angular)
- Time-dependent threshold (wider for far-future crossings) would be more physically accurate but adds complexity
- Inner planet transfers benefit from increased acceleration (1/r²), making 45° slightly conservative; acceptable trade-off

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| SS1 | Nice-to-have | Time-dependent threshold would be more accurate | Defer to v2; 45° static is defensible for v1 |
| SS2 | Nice-to-have | Threshold treats ahead/behind symmetrically; closing gap when planet is ahead is harder | Acceptable for a game; second-order effect |

## 3. Functionality

### Findings
- User's scenario (0.95 AU / ~57° from Earth) correctly filtered by 45° threshold
- Close encounters (< 2× SOI) unaffected by the filter
- Multiple crossings of same body handled independently (correct behavior)
- Deduplication runs before filtering (correct ordering)

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Critical | Hard filter in detector discards crossings BEFORE main.js closest approach refinement can correct angular separation | Move filter to main.js after refinement |

## 4. Architecture

### Findings
- intersectionDetector.js already imports from config.js (SOI_RADII) — no new coupling
- Opacity scaling in renderer follows existing visual logic pattern
- Two-layer approach (hard filter + soft fade) is sound

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | Separate GHOST_PLANET_CONFIG is unnecessary | Merge maxAngularSeparation into INTERSECTION_CONFIG |
| A2 | Important | Filter should be after refinement in main.js, not in detector | Move filter to main.js line ~248 |

## 5. Failure Modes

### Findings
- Hard cutoff at 45° boundary could cause pop-in/pop-out... but opacity fade means ghost is already at 0.2 opacity near threshold — visual difference is minimal
- Outer planet crossings often exceed 45° — but this is correct! A 50° crossing of Jupiter's orbit is genuinely not a useful intercept.
- Multiple crossings: filter acts independently on each, which is correct

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Critical | Filter in detector prevents refinement from rescuing valid close encounters | Same as F1: move filter to main.js |
| FM2 | Low | Near-threshold flickering | Opacity fade mitigates this (ghost already very faint at boundary) |

## 6. Best Practices

### Compliance Summary
| Category | Status | Notes |
|----------|--------|-------|
| Imports | Compliant | .js extensions, named exports |
| Naming | Compliant | camelCase functions, UPPER_SNAKE constants |
| Code Style | Compliant | Minimal change, focused on the specific problem |
| Architecture | Compliant | Follows existing config → detector → renderer flow |

## 7. Regression Risk

### Impact Analysis
- Files changed: config.js, main.js, renderer.js (3 files)
- Features affected: Ghost planet display only
- Shared modules touched: config.js (additive only), intersectionDetector.js (NOT modified)

### Risk Assessment
| Existing Feature | Risk Level | Rationale |
|------------------|------------|-----------|
| Ghost planet detection | None | intersectionDetector.js unchanged |
| Closest approach refinement | None | Still runs on all crossings |
| CLOSE indicator | None | Close encounters exempt from fade |
| Autopilot | None | Uses different data path |
| Course solver | None | Uses evaluate-trajectory.js, not intersection detector |

## 8. Summary

### Confidence Rating: 9/10

### Critical Issues (Must Fix)
1. **Move the hard filter from detector to main.js** — Apply angular separation filter AFTER closest approach refinement, not before.

### Important Issues (Should Fix)
1. Merge into INTERSECTION_CONFIG instead of separate GHOST_PLANET_CONFIG
2. Document d ≈ 2a × sin(θ/2) relationship in config comment

### Recommendations
1. Ship with 45° static threshold; consider time-dependent scaling in v2
2. Ensure close encounters (< 2× SOI) are always at full opacity regardless of angular separation

### Verdict
[x] Approved with conditions
- Must move hard filter from detector to main.js (after closest approach refinement)
- Must merge config into INTERSECTION_CONFIG
