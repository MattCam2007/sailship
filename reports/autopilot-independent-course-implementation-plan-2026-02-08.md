# Autopilot Independent Course Implementation Plan

**Date:** 2026-02-08
**Status:** Draft

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/main.js` - Fix misleading comment on line 89 (autopilot fires thrusters, not adjusts sails)

### Files to CREATE:
- None (reports only)

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
The user plans to remove the automatic course plotter and wants assurance that the thruster autopilot will continue to function when sailing a manually-set course. The discovery phase confirmed the systems are already independent, but a misleading code comment suggests otherwise.

### 1.2 Root Cause
A comment in `main.js:89` says "Update autopilot (adjusts sail settings before physics)" when the autopilot actually fires thrusters, not adjusts sail settings. This is the only artifact in the codebase that suggests a coupling between the autopilot and sail settings.

### 1.3 Constraints
- No functional code changes needed (systems are already independent)
- Must not break any existing functionality
- Minimal change footprint

## 2. Solution Architecture

### 2.1 High-Level Design
Fix the single misleading comment. No architectural changes required.

### 2.2 Design Principles
- Accurate documentation: Comments should reflect actual behavior
- Minimal change: Don't change what isn't broken

## 3. Units of Work

### Unit 1: Fix misleading comment in main.js
**Description:** Correct the comment on line 89 of main.js that incorrectly states autopilot "adjusts sail settings" when it actually fires thrusters.
**Files:** `src/js/main.js`
**Acceptance Criteria:**
- [ ] Comment accurately describes autopilot behavior (fires thrusters at periapsis)
- [ ] No functional code changes
- [ ] Game loop continues to call updateAutoPilot in the same position
**Test Method:** Read the file and confirm the comment is accurate

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Accidental code change | Low | High | Only edit the comment string, not code |
| Breaking game loop order | Low | High | Don't move or rename the function call |

## 5. Testing Strategy

### 5.1 Unit Tests
- N/A (comment-only change)

### 5.2 Integration Tests
- N/A (comment-only change)

### 5.3 Manual Verification
- Confirm autopilot ENGAGE button still toggles correctly
- Confirm thruster fires at periapsis when inside SOI with autopilot enabled
- Confirm course plotter still works independently (for now, until user removes it)
