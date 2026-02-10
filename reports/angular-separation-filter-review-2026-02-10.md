# Angular Separation Filter: 7-Perspective Iterative Review

**Date:** 2026-02-10
**Problem:** The 45-degree angular separation filter (`main.js:256-258`) suppresses ghost planets when the planet is far around its orbit from the crossing point. This is correct (a 45-degree gap is not a viable intercept) but creates a UX dead zone: the player has no visual guidance when they need it most — when they're far off-course and need to know *which direction* to adjust.

**Constraint:** The filter exists for a reason. Simply removing it would flood the display with misleading ghosts showing "intercepts" that are actually half an orbit away. The solution must preserve the filter's intent while solving the guidance gap.

---

## Round 1: Independent Perspectives

### 1. Physicist

**Observation:** The 45-degree threshold is arbitrary from a physics standpoint. What matters is whether the angular gap is *closable* given the ship's available thrust and time. A solar sail at 1 AU can change its orbital phase by roughly 5-15 degrees per orbit (depending on orbital period and sail efficiency). So:

- At Earth's orbit (~365 day period): ~10 deg/orbit achievable
- At Mars's orbit (~687 day period): ~5-8 deg/orbit achievable
- 45 degrees at Mars might take 6-9 orbits (~12-17 years) to close — truly not viable
- But 45 degrees at Mercury (~88 day period): ~15 deg/orbit → closable in ~3 orbits (~264 days)

**Proposal P1: Dynamic threshold based on orbital period.** Instead of a fixed 45 degrees, calculate the maximum closable angular gap based on:
- Ship's characteristic acceleration
- Target body's orbital period
- Remaining trajectory prediction window

This is physically principled but complex and hard to communicate to the player.

**Proposal P2: Show the gap as a number, even when ghost is hidden.** The physics don't change just because we hide the ghost. The angular separation is already computed. Show it somewhere in the UI regardless of whether the ghost renders.

---

### 2. Solar Sailing Expert

**Key insight: The 45-degree filter is thinking like a chemical rocket.** With a chemical rocket, if you miss your transfer window, you wait for the next one. The window is binary: open or closed. But solar sails don't have discrete windows — they have a continuous spectrum of "how hard is this intercept."

A solar sail can *always* reach any planet eventually. The question is never "can I?" but "how long will it take?" A 45-degree angular separation means the planet is ~12.5% of its orbit away from your crossing point. For an inner planet, that might mean "adjust your sail and try again in one orbit" (months). For an outer planet, it might mean "years of spiraling."

**Proposal SS1: Replace binary ghost visibility with a continuous "difficulty gradient."** Instead of ghost/no-ghost, show ALL crossings but with visual encoding of how achievable the intercept is:
- 0-10 degrees: Bright ghost, pulsing, "CLOSE" label — viable now
- 10-25 degrees: Visible ghost, "EARLY/LATE Xdeg" — needs adjustment
- 25-45 degrees: Faded ghost, "PHASE GAP Xdeg" — needs significant work
- 45-90 degrees: Very faint ghost outline, "Xdeg — ADJUST SAIL" — showing direction only
- 90+ degrees: No ghost (truly on the wrong side of the Sun)

This matches how solar sail navigation actually works: you don't ignore the planet because it's 50 degrees away — you use that information to plan your next orbital adjustment.

**Proposal SS2: Show the "time to phase match" estimate.** Using orbital period and approximate phase adjustment rate, show roughly how many orbits until the gap closes. "MARS +47deg (~2 orbits)" is much more actionable than silence.

---

### 3. Functional Tester

**The current behavior creates a frustrating feedback loop:**
1. Player adjusts sail to aim at ghost (within 45 degrees — ghost visible)
2. Due to trajectory drift (see prior investigation), actual approach diverges
3. Planet drifts past 45 degrees from crossing point
4. Ghost disappears entirely
5. Player has NO visual feedback about which direction to adjust
6. Player randomly adjusts sail hoping ghost reappears
7. If lucky, ghost reappears. If unlucky, player wastes time.

Step 5-6 is the core UX failure. The ghost is most useful precisely when you're off-course, but that's when it vanishes.

**Proposal F1: "Breadcrumb ghost" — when a ghost was recently visible but is now filtered, show a dimmed marker at the last known position with a directional arrow.** The arrow points toward where the planet actually is. This provides continuity: the player knows the ghost didn't just glitch out, it moved, and here's which way.

**Proposal F2: "Phase compass" on the predicted trajectory line.** At the point where the trajectory crosses the target's orbital radius, draw a small marker (even without a ghost) that shows the angular gap. A tiny wedge or arc showing "the planet is this far around its orbit from here." This gives guidance without the full ghost.

---

### 4. Architect

**The angular separation filter lives in the wrong layer.** Currently:
- `intersectionDetector.js` computes crossings with full data (including angular separation)
- `main.js:256-258` filters them out before caching
- `renderer.js` only sees what survived the filter

This means downstream code (renderer, UI updater, any future autopilot) cannot access filtered-out crossings. If we want to show "guidance ghosts" or phase information, we'd have to either remove the filter or add a second data path.

**Proposal A1: Move filtering from the cache layer to the render layer.** Store ALL crossings in the intersection cache (with their angular separation data). Let the renderer decide what to show at what opacity. Let the UI updater decide what to display in the NAV panel. This doesn't change what the player sees today but enables all the other proposals without architectural surgery.

**Proposal A2: Add a "filtered crossings" cache alongside the main cache.** Less clean than A1, but non-breaking. Store the filtered-out crossings separately so the renderer can optionally show them as guidance markers.

---

### 5. Failure Analyst

**Failure mode: "Guidance ghost" could be worse than no ghost.** If we show very-faint ghosts at 60+ degrees, the player might interpret them as "I'm sort of close" when they're actually half an orbit away. This would cause them to maintain a bad trajectory for longer instead of making a major course correction.

**Failure mode: Information overload.** If every crossing at every angle shows a marker, a player passing through the asteroid belt region could see dozens of faint markers for bodies they don't care about. (Mitigated by the existing destination-only filter in `renderer.js:1153`.)

**Failure mode: Phase compass is useless at system zoom.** At system-level zoom, a small angular marker on the trajectory line would be invisible. It only works at inner-planet zoom levels.

**Proposal FM1: Visual encoding must be unambiguous.** Whatever we show beyond 45 degrees must look fundamentally different from a "real" ghost. Not just fainter — structurally different. A full planet circle at 80 degrees, even if very faint, will be misread as "almost there." An arrow, a line, or a text-only indicator won't be confused with an actual intercept.

**Proposal FM2: Two-tier system with clear visual break.**
- Tier 1 (0-45 degrees): Current ghost behavior (circle, color, label, fade). This is "you can intercept this."
- Tier 2 (45-90 degrees): Phase indicator only. NOT a circle — use a directional chevron, arc segment, or text label at the crossing point on the trajectory. This is "here's where to aim next."
- Beyond 90 degrees: Nothing. Planet is on the other side of the Sun.

---

### 6. Best Practices

**The current 45-degree threshold is a magic number** in `config.js:350`. This is already correctly externalized as `INTERSECTION_CONFIG.maxAngularSeparation`. Good.

**Any solution should follow the existing pattern:** configurable thresholds in `config.js`, rendering logic in `renderer.js`, data flow through the cache system. No new modules needed for any of the proposed approaches.

**Proposal BP1: Whatever the solution, add a second threshold to config.** If we go with a two-tier system, add `INTERSECTION_CONFIG.guidanceMaxAngularSeparation` (e.g., pi/2 = 90 degrees) alongside the existing `maxAngularSeparation` (pi/4 = 45 degrees). Keep both configurable.

---

### 7. Regression Checker

**Current behavior that must not regress:**
- Ghosts within 45 degrees must continue to display identically
- The fade from 22.5 to 45 degrees must remain smooth
- "CLOSE" pulsing for encounters within 2x SOI must remain
- EARLY/LATE labels with degree indicators must remain
- NAV panel closest approach data (independent of ghosts) must remain
- Performance: intersection detection must stay under ~15ms

**Proposal RC1: Any new rendering in the 45-90 degree range must be independently toggleable** so it can be disabled if it causes confusion or performance issues. Could be a sub-toggle under ENCOUNTER MARKERS, or could ship as always-on with a config flag.

---

## Round 2: Cross-Pollination and Convergence

After hearing all perspectives, the reviewers re-engage:

### Physicist responds to Solar Sailing Expert:
> SS1's continuous gradient is physically sound. Agree that the binary threshold is a chemical-rocket mindset. But the gradient should be *perceptually* nonlinear — a ghost at 40 degrees should look dramatically different from one at 10 degrees, not just "a bit fainter." Human perception of opacity differences is poor.

### Solar Sailing Expert responds to Failure Analyst:
> FM1 is critical. I withdraw the "very faint ghost outline" part of SS1 for the 45-90 range. A circle (even faint) at 60 degrees will mislead. Agree with FM2's chevron/arc approach for Tier 2. But I want to keep the *data* — phase angle, direction, time estimate — visible somewhere.

### Architect responds to everyone:
> A1 (move filter to render layer) is a prerequisite for all proposals. Without it, we're fighting the architecture. Let me synthesize: A1 enables FM2's two-tier system, which satisfies the physicist's dynamic feel, the solar sailing expert's continuous information, and the failure analyst's safety concern.

### Functional Tester responds:
> F1 (breadcrumb ghost) is unnecessary if we do FM2. The Tier 2 indicator IS the breadcrumb. Withdrawing F1. But F2 (phase compass at crossing point) still has value — it works even when the ghost would be far away in screen space.

### Failure Analyst responds:
> The 90-degree cutoff needs justification. At exactly 90 degrees, the planet is a quarter-orbit away — this is genuinely a "different transfer entirely" situation. But the real question is: what does the player *do* with this information? At 60 degrees they can plan "I need 2 more orbits of phasing." At 90 degrees... they probably need to reconsider their entire approach. I'm comfortable with 90 degrees as the Tier 2 cutoff.

---

## Round 3: Converged Proposal

### The Two-Tier Ghost System

**Tier 1: Encounter Ghost (0 to 45 degrees) — NO CHANGE**
- Current behavior preserved exactly
- Full planet circle, color, opacity fade from 22.5-45 degrees
- CLOSE/EARLY/LATE labels
- Pulsing glow within 2x SOI

**Tier 2: Phase Indicator (45 to 90 degrees) — NEW**
- Rendered at the ship's **crossing point on the trajectory** (where the predicted path crosses the target's orbital radius), NOT at the planet's position
- Visual: A small directional **chevron** (arrow) pointing along the target orbit in the direction of the planet, plus a text label
- Label format: `MARS 63deg AHEAD ~2 orbits` or `VENUS 51deg BEHIND ~1 orbit`
- Opacity: Fixed low opacity (e.g., 0.4), NOT faded further — it's either shown or not
- Color: Same body color as Tier 1, but drawn as outline/wireframe (no fill) to be visually distinct

**Beyond 90 degrees: Nothing shown**
- Planet is a quarter-orbit or more away; this is a fundamentally different transfer problem

### Architectural Prerequisite (A1)
- Remove the angular separation filter from `main.js:256-258`
- Store ALL crossings in the intersection cache (no filtering at the data layer)
- Move the 45-degree display threshold to `renderer.js` where Tier 1 vs Tier 2 decision is made
- Add `INTERSECTION_CONFIG.guidanceMaxAngularSeparation = Math.PI / 2` to config

### Orbit Count Estimate
- At the crossing point, estimate phase-closure rate: `phaseRate = (n_ship - n_planet)` where n is mean motion
- Time to close gap: `gapRadians / phaseRate`
- Convert to approximate orbit count for display
- This is a rough estimate (doesn't account for thrust changes) but gives the player actionable planning information

---

## Reviewer Confidence Ratings

| Reviewer | Confidence in Converged Proposal | Notes |
|----------|----------------------------------|-------|
| Physicist | 8/10 | Orbit count estimate is approximate but useful. Dynamic threshold (P1) abandoned in favor of simpler two-tier approach. |
| Solar Sailing Expert | 9/10 | Continuous information replaces binary cutoff. Chevron at crossing point is how navigators think. |
| Functional Tester | 9/10 | Eliminates the "ghost disappears, now what?" dead zone. Tier 2 provides recovery guidance. |
| Architect | 9/10 | A1 cleans up the data flow. Rendering decisions belong in the renderer. |
| Failure Analyst | 8/10 | Chevron is visually distinct from ghost circle — low confusion risk. 90-degree cutoff is justified. |
| Best Practices | 9/10 | Two thresholds in config. No new modules. Follows existing patterns. |
| Regression Checker | 8/10 | Tier 1 unchanged. A1 changes the filter location but not the output. Need to verify intersection tests still pass with unfiltered cache. |

**Overall: 8.6/10 — Ready to plan implementation**

---

## Summary of Rejected Alternatives

| Proposal | Reason Rejected |
|----------|----------------|
| P1 (dynamic threshold) | Too complex to implement and communicate. Two-tier achieves the same goal more simply. |
| F1 (breadcrumb ghost) | Superseded by Tier 2 indicator which serves the same purpose. |
| A2 (dual cache) | A1 (move filter to renderer) is cleaner and enables more flexibility. |
| SS1 full gradient (0-90 continuous opacity) | Ghost circle at 60+ degrees would mislead (FM1). Two-tier with visual break is safer. |
| Remove filter entirely | Tier 2 beyond 90 degrees adds nothing actionable and clutters display. |

---

## Recommended Next Steps

1. `/planning` — Design atomic units of work for the two-tier system
2. Key units would likely be:
   - A1: Move angular filter from main.js to renderer.js (data layer change)
   - Add `guidanceMaxAngularSeparation` to config
   - Implement Tier 2 chevron rendering in renderer.js
   - Add orbit-count estimate calculation
   - Add Tier 2 label rendering
3. `/review` the implementation plan
4. `/implement`
