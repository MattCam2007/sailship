# Visual Testing Checklist - Planet Scale Rendering

**Date:** 2026-01-21
**Feature:** Hybrid fixed/scaled planet rendering

## Quick Browser Console Test

Open the game in browser and run this in console to verify functions exist:

```javascript
// Test that config exports properly
import { SCALE_RENDERING_CONFIG, BODY_DISPLAY } from './js/config.js';
console.log('Config loaded:', SCALE_RENDERING_CONFIG);
console.log('Earth physical radius:', BODY_DISPLAY.EARTH.physicalRadiusKm, 'km');
```

## Visual Test Cases

### Test 1: System Zoom (Default View)
**Expected:** Planets should appear as small fixed-size orbs (same as before)
- [ ] Earth is ~6px radius
- [ ] Jupiter is ~12px radius
- [ ] Sun is small (scaled, but far away)
- [ ] All bodies visible and correctly colored

### Test 2: Zoom Toward Earth
**Action:** Use mouse wheel to zoom in on Earth
**Expected:** Earth should grow smoothly without any visible "pop"
- [ ] Smooth continuous growth from 6px → larger sizes
- [ ] No sudden jumps or discontinuities
- [ ] Gradient quality remains good
- [ ] Labels adjust position correctly

### Test 3: Close to Earth (Local/Tactical Zoom)
**Expected:** Earth should be much larger, using physical scale
- [ ] Earth fills significant portion of screen
- [ ] Luna (moon) is visible and proportionally smaller
- [ ] Gradient rendering still looks good
- [ ] No performance issues

### Test 4: Approach Scale
**Action:** Zoom even closer (use Q/E to increase zoom further if needed)
**Expected:** Planet becomes very large
- [ ] Earth can fill 30-50% of viewport
- [ ] Still renders correctly at large sizes
- [ ] No gradient artifacts
- [ ] FPS remains stable

### Test 5: Sun Scale Test
**Action:** Zoom back out, then pan to Sun
**Expected:** Sun should always use physical scale
- [ ] Sun is tiny at system zoom (correct - it's far away)
- [ ] Sun grows when you zoom in
- [ ] Sun can become very large at close range
- [ ] Corona scales with sun size

### Test 6: Jupiter Comparison
**Action:** At same zoom level, compare Earth and Jupiter
**Expected:** Jupiter should be noticeably larger than Earth
- [ ] Jupiter is ~11x radius of Earth (69,911 km vs 6,371 km)
- [ ] Size ratio feels correct
- [ ] Both planets transition smoothly

### Test 7: Moon Behavior
**Action:** Zoom close to Luna (Earth's moon)
**Expected:** Luna should behave like planets
- [ ] Luna is fixed size when small
- [ ] Luna transitions to scaled when zoomed in
- [ ] Luna is much smaller than Earth (correct - 1,737 km radius)
- [ ] Transitions smoothly

### Test 8: Tiny Body Test (Phobos)
**Action:** Find Phobos (Mars moon, 11 km radius)
**Expected:** Phobos should remain visible
- [ ] Phobos appears at fixed 2px when far
- [ ] If you can zoom close enough, it scales
- [ ] Doesn't disappear
- [ ] Renders correctly

### Test 9: Rapid Zoom Changes
**Action:** Rapidly scroll mouse wheel in/out
**Expected:** Smooth performance, no glitches
- [ ] No visual stuttering
- [ ] No cache thrashing (check console for errors)
- [ ] Gradients update smoothly
- [ ] No memory leaks (check Task Manager if testing for extended period)

### Test 10: Multiple Bodies on Screen
**Action:** Zoom to show several planets at once (inner solar system view)
**Expected:** All bodies render correctly at their appropriate sizes
- [ ] Each body has correct size for its distance/zoom
- [ ] No Z-fighting or overlap issues
- [ ] Performance is acceptable (check FPS)
- [ ] All labels positioned correctly

## Performance Checks

### Gradient Cache
```javascript
// Run in console while testing
window.getGradientCacheStats()
```
**Expected:**
- Hit rate should be >80% during steady viewing
- Cache size should stay below 100 entries
- Some misses during zoom transitions are normal

### Frame Rate
**Expected:** 60 FPS at all zoom levels
- Check browser DevTools Performance tab
- Look for dropped frames
- Verify renderer frame time remains low

## Known Edge Cases

### Very Close Zoom
If you zoom extremely close (beyond intended "orbital" zoom level):
- Planets may become so large they're partially off-screen (expected)
- Gradient might show banding at extreme sizes (acceptable limitation)
- Performance should still be fine

### Very Small Bodies
Phobos (11 km) is the smallest body:
- At system zoom, uses fixed 2px size
- Physical scale is so tiny you'll need extreme zoom to see it grow
- This is astronomically correct behavior

## Acceptance Criteria

- [ ] No JavaScript errors in console
- [ ] Smooth transitions with no visible pops
- [ ] Planets grow naturally when zooming in
- [ ] Sun always uses scaled rendering
- [ ] Moons behave consistently with planets
- [ ] Performance remains at 60 FPS
- [ ] Gradient cache hit rate >80%
- [ ] All bodies render at correct relative sizes

## If Issues Found

### Transition Too Abrupt
Edit `SCALE_RENDERING_CONFIG` in `config.js`:
- Increase `maxScreenSize` (e.g., 150px) for longer blend
- Decrease `minScreenSize` (e.g., 15px) to start earlier

### Bodies Too Small/Large
Edit `BODY_DISPLAY` in `config.js`:
- Adjust `physicalRadiusKm` values
- Or add a global scale multiplier in `SCALE_RENDERING_CONFIG`

### Performance Issues
- Check gradient cache stats
- Verify no memory leaks
- Check for console errors

## Success!

If all tests pass, the feature is ready for user acceptance testing.
Commit the verification results and close the testing unit.
