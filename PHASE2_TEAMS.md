# Phase 2: Team Assignments

**Date:** 2026-02-12
**Lead Coordinator:** Claude Sonnet 4.5
**Plan:** [PHASE2_IMPLEMENTATION_PLAN.md](./PHASE2_IMPLEMENTATION_PLAN.md)

---

## Team Structure

### Team A: Backend/API
**Status:** ✅ NO WORK REQUIRED

All necessary backend APIs were implemented and tested in Phase 1:
- `GET /api/ships?owner={address}` - List ships by owner
- `GET /api/ships/:tokenId` - Get ship stats
- `GET /api/ships/:tokenId/tba` - Get TBA balances
- `GET /api/celestial-bodies` - List all celestial bodies
- `GET /api/resources/balances/:address` - Get resource balances

**Phase 1 Test Coverage:** 98.57% statement coverage, 72 passing tests

**Conclusion:** Team A has completed their work. Phase 2 is purely frontend enhancements.

---

### Team B: Frontend/UI
**Role:** Implement all UI enhancements for ships, resources, and celestial bodies pages

**Assigned Units:**
- Unit 1: Ships List Display
- Unit 2: Ship Card Click-to-Expand
- Unit 3: Resources Metadata Display
- Unit 4: Celestial Bodies Auto-Load
- Unit 5: Enhanced Celestial Bodies Display (optional)

**Files to Modify:**
1. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js`
2. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/resources.js`
3. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/celestialBodies.js`

**Key Responsibilities:**
1. Add auto-load functionality to all pages
2. Create ship list display with card grid layout
3. Add resource metadata reference section
4. Enhance celestial bodies display with resource profiles
5. Maintain existing dark theme aesthetic
6. Follow existing UI patterns and CSS classes
7. Add proper error handling and loading states

**Constraints:**
- NO backend changes allowed
- NO new API endpoints needed
- Use existing CSS classes (`.data-card`, `.data-table`, etc.)
- Maintain existing form functionality
- All async operations must show loading spinner
- All errors must show toast notifications

**Deliverables:**
- [ ] Unit 1 complete - Ships list displays on page load
- [ ] Unit 2 complete - Ship cards clickable with details expansion
- [ ] Unit 3 complete - Resource metadata table displays
- [ ] Unit 4 complete - Celestial bodies auto-load on page open
- [ ] Unit 5 complete (optional) - Enhanced bodies display
- [ ] All code follows existing patterns
- [ ] No console errors
- [ ] All acceptance criteria met

**Estimated Time:** 3-4 hours

---

### Team C: Integration/Testing
**Role:** End-to-end verification of all Phase 2 features

**Assigned Units:**
- Unit 6: Integration Testing
- Unit 7: Documentation Update

**Key Responsibilities:**
1. Execute complete test suite for all features
2. Verify no regressions in existing functionality
3. Test error scenarios (network failures, invalid data)
4. Cross-browser testing (Chrome, Firefox, Safari)
5. Document all test results
6. Create `PHASE2_VERIFICATION_REPORT.md`
7. Provide final sign-off

**Test Cases:**
1. **Ships List Display**
   - Verify auto-load on page init
   - Test with 0, 1, and multiple ships
   - Verify data matches blockchain state

2. **Ship Card Interaction**
   - Click cards to load details
   - Verify TBA balances display
   - Test refresh after minting new ship

3. **Resources Display**
   - Verify metadata table accuracy
   - Check contract addresses match `.env`

4. **Celestial Bodies Auto-Load**
   - Verify auto-load on page init
   - Test refresh functionality
   - Verify data accuracy

5. **Error Handling**
   - Disconnect blockchain → Verify error toast
   - Network timeout → Verify loading clears
   - Invalid owner → Verify graceful failure

6. **Performance**
   - Large ship lists (>10 ships)
   - Network latency scenarios

**Deliverables:**
- [ ] Complete test suite executed
- [ ] `PHASE2_VERIFICATION_REPORT.md` created
- [ ] All bugs documented
- [ ] Screenshots of key features
- [ ] Final coordinator sign-off

**Estimated Time:** 2 hours

**Dependencies:** Team B must complete Units 1-5 first

---

## Coordination Points

### Handoff 1: Team B → Team C
**Trigger:** All Team B units (1-5) complete
**Requirements:**
- All acceptance criteria met
- No console errors in browser
- Code committed to `crypto/framing` branch

### Handoff 2: Team C → Lead Coordinator
**Trigger:** Verification report complete
**Requirements:**
- All tests documented
- Pass/fail status for each feature
- Recommendation for Phase 2 approval

---

## Communication Protocol

### Status Updates
Each team should report:
- Unit completion status
- Blockers or issues
- Estimated time to completion

### Issue Escalation
If any team encounters:
- Missing APIs (escalate immediately - should not happen)
- Undefined CSS classes (check existing code for class names)
- Contract deployment issues (check Hardhat node running)
- Unexpected errors (provide full error message)

---

## Success Metrics

Phase 2 is **APPROVED** when:

✅ All Team B units (1-5) complete
✅ All Team C test cases pass
✅ Verification report shows no critical issues
✅ Lead Coordinator approves

---

**Prepared By:** Lead Coordinator
**Next Step:** Spawn Team B task to begin implementation
