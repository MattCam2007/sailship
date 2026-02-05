# SOI Warnings Fix - Implementation Plan

**Date:** 2026-02-05
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/core/shipPhysics.js` - Remove collision prevention, fix SOI exit cooldown, reset anomaly detector on transitions
2. `src/js/lib/orbital.js` - Fix `getPeriapsis()` formula for hyperbolic orbits
3. `src/js/lib/trajectory-predictor.js` - Reduce TRAJ_DIAG and VERY SHORT TRAJECTORY log spam

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
During SOI (Sphere of Influence) transitions—particularly high-speed Venus flybys—the console fills with hundreds of warnings and diagnostic messages per second, eventually crashing the browser tab. The warnings indicate several distinct bugs that compound to create the spam.

### 1.2 Root Causes

**Bug A: SOI Exit Blocked by Shared Cooldown** (`shipPhysics.js:964-966`)
- `handleSOIExit()` uses the SAME cooldown timer as `handleSOIEntry()` (`lastSOITransitionTime`/`lastSOITransitionBody`)
- When entering Venus SOI, the cooldown starts. On the next frame, the ship (at 40 km/s) is already past the SOI boundary, but exit is blocked for 0.1 game days (~0.86 real seconds at 10,000X)
- During this stuck period, ALL other warnings accumulate

**Bug B: Collision Prevention with Wrong Periapsis** (`orbital.js:633`)
- `getPeriapsis()` returns `Math.abs(a) * (1 - e)` which gives NEGATIVE values for hyperbolic orbits (e > 1)
- Negative periapsis always triggers collision prevention, modifying orbital elements every frame
- User has requested this entire feature be removed ("if you hit the planet, you die")

**Bug C: TRAJ_DIAG Spam** (`trajectory-predictor.js:248-262, 400-412`)
- Trajectory predictor is called every frame, logs TRUNCATED at SOI boundary every 2 seconds
- Two separate calls per frame (4380 and 1500 steps) can both log
- VERY SHORT TRAJECTORY warning also fires every 2 seconds
- Root cause is the ship being stuck in SOI (Bug A), but rate limits are also too permissive

**Bug D: False ANOMALY Warnings** (`shipPhysics.js:1311-1402`)
- Anomaly detector compares state across SOI reference frame changes
- Position/velocity naturally jump during heliocentric↔planetocentric transitions
- `lastKnownState` is never reset on SOI transitions, causing false LARGE DIRECTION CHANGE / SPEED JUMP warnings

### 1.3 Constraints
- No new features, only cleanup and bug fixes
- Must not break existing orbital mechanics
- Must not break SOI entry/exit for normal-speed encounters

## 2. Solution Architecture

### 2.1 High-Level Design
Fix each root cause independently. The SOI exit cooldown fix (Bug A) resolves the primary spam issue. The other fixes address individual warning sources.

### 2.2 Key Changes
1. Remove cooldown from `handleSOIExit()` - the 1.01× hysteresis in `checkSOIExit()` already prevents oscillation
2. Delete `checkAndPreventCollision()` and its call site
3. Fix `getPeriapsis()` formula: use `a * (1 - e)` instead of `Math.abs(a) * (1 - e)`
4. Make TRAJ_DIAG truncation and short trajectory warnings log-once-per-SOI-stay instead of every 2 seconds
5. Reset `lastKnownState = null` after SOI transitions

## 3. Units of Work

### Unit 1: Remove Collision Prevention
**Description:** Delete the collision prevention feature entirely
**Files:** `src/js/core/shipPhysics.js`
**Acceptance Criteria:**
- [ ] `checkAndPreventCollision()` function removed
- [ ] Call site at lines 311-322 removed
- [ ] No "COLLISION PREVENTED" warnings appear
**Test Method:** Search codebase for `checkAndPreventCollision` - no hits

### Unit 2: Fix SOI Exit Cooldown
**Description:** Remove the shared cooldown from `handleSOIExit()` so ships can exit the same SOI they just entered
**Files:** `src/js/core/shipPhysics.js`
**Acceptance Criteria:**
- [ ] `handleSOIExit()` no longer checks cooldown against entry
- [ ] Ship properly exits SOI during high-speed flyby
- [ ] Re-entry cooldown in `handleSOIEntry()` is preserved (prevents re-entering same body after exit)
**Test Method:** High-speed Venus flyby at 10,000X should produce clean SOI entry → flyby → SOI exit sequence

### Unit 3: Fix getPeriapsis Formula
**Description:** Fix the periapsis calculation for hyperbolic orbits
**Files:** `src/js/lib/orbital.js`
**Acceptance Criteria:**
- [ ] Returns positive value for hyperbolic orbits (a < 0, e > 1)
- [ ] Returns positive value for elliptic orbits (a > 0, e < 1)
**Test Method:** `getPeriapsis({a: -0.001, e: 1.5})` should return positive 0.0005 (not -0.0005)

### Unit 4: Reduce TRAJ_DIAG Log Spam
**Description:** Change TRAJ_DIAG truncation and VERY SHORT TRAJECTORY logs to once-per-SOI-stay
**Files:** `src/js/lib/trajectory-predictor.js`
**Acceptance Criteria:**
- [ ] TRUNCATED at SOI_EXIT logs only once per SOI stay (not every 2 seconds)
- [ ] VERY SHORT TRAJECTORY warning logs only once per SOI stay
**Test Method:** SOI flyby produces at most 1 TRUNCATED log and 1 SHORT TRAJECTORY warning

### Unit 5: Reset Anomaly Detector on SOI Transitions
**Description:** Clear `lastKnownState` when entering/exiting SOI to prevent false anomaly warnings
**Files:** `src/js/core/shipPhysics.js`
**Acceptance Criteria:**
- [ ] No false ANOMALY warnings during SOI entry/exit
- [ ] Anomaly detection still works during normal flight
**Test Method:** SOI transition produces no ANOMALY warnings from reference frame change

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SOI oscillation without exit cooldown | Low | Medium | Hysteresis (1.01×) in checkSOIExit prevents this |
| Removing collision prevention causes stuck ships | Low | Low | Ships either fly through (hyperbolic) or orbit normally (elliptic) |
| getPeriapsis change breaks other consumers | Low | Medium | Only called from collision prevention (being removed) and debug logging |
