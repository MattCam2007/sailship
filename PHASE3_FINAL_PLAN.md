# Phase 3: Resource Management for Ships - Final Plan

**Date:** 2026-02-12
**Status:** Ready for User Approval
**Lead Coordinator:** Claude Sonnet 4.5

---

## Executive Summary

Phase 3 adds complete resource management functionality to the Sailship backoffice. Users will be able to mint resources (CH4, O2, H2O, CO2, N2) directly to ships' Token Bound Accounts and manage resources through a full-featured Resources page.

**Impact:** Frontend enhancements only. No backend or smart contract changes required.

**Estimated Time:** 3-4 days (12-14 hours of development)

---

## Features to Implement

### Feature 1: Add Resources to Ships
**User Story:** *As an admin, I want to mint resources directly to a ship's TBA from the ship details view, so I can easily load cargo without copying addresses manually.*

**What Changes:**
- Ship details view gains an "Add Resources" form below the balances table
- Form includes:
  - Resource dropdown (CH4, O2, H2O, CO2, N2)
  - Amount input (human-readable kg, auto-converted to wei)
  - TBA address (read-only, pre-filled)
  - "MINT TO SHIP" button
- After successful minting:
  - Success toast notification
  - Ship balances auto-refresh

**Screenshot (Mockup):**
```
┌─────────────────────────────────────────────────┐
│ SHIP #1 - HELIOS-CLASS                         │
│                                                 │
│ [Stats Cards: Mass, Sail Area, etc.]          │
│                                                 │
│ TOKEN BOUND ACCOUNT (TBA): 0xABC...123         │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ Resource    Balance      Token Address  │   │
│ │ CH4         0.0000       0xe7f...512    │   │
│ │ O2          0.0000       0xCf7...Fc9    │   │
│ │ ...                                      │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ADD RESOURCES TO SHIP                          │
│ ┌─────────────────────────────────────────┐   │
│ │ Resource Type: [CH4 (Methane) ▼]       │   │
│ │ Amount (kg):   [100            ]        │   │
│ │ Recipient:     0xABC...123 (read-only)  │   │
│ │ [⚗️ MINT TO SHIP]                        │   │
│ └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

### Feature 2: Resources Page Functionality
**User Story:** *As an admin, I want a dedicated Resources page to view all resource tokens, mint resources to any address, and check balances, so I have full control over the resource system.*

**What Changes:**
- Resources page transforms from placeholder to full implementation
- **Section A: Resource Token Overview**
  - 5 cards displaying CH4, O2, H2O, CO2, N2
  - Each card shows: symbol, name, contract address
- **Section B: Mint Resources**
  - Resource dropdown
  - Amount input (kg)
  - Recipient address input (any EOA or TBA)
  - "MINT RESOURCES" button
- **Section C: Balance Checker**
  - Address input field
  - "CHECK" button
  - Results table showing all 5 resource balances

**Screenshot (Mockup):**
```
┌─────────────────────────────────────────────────────────────┐
│ RESOURCE MANAGEMENT                                         │
│                                                              │
│ DEPLOYED RESOURCE TOKENS                                    │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐        │
│ │ CH4   │ │  O2   │ │ H2O   │ │ CO2   │ │  N2   │        │
│ │Methane│ │Oxygen │ │Water  │ │Carbon │ │Nitrogen│       │
│ │0xe7f..│ │0xCf7..│ │0x5FC..│ │0xa51..│ │0x8A7..│        │
│ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘        │
│                                                              │
│ MINT RESOURCES                                              │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ Resource Type: [CH4 (Methane) ▼]  Amount: [1000   ]│    │
│ │ Recipient Address: [0x...                         ]│    │
│ │ [⚗️ MINT RESOURCES]                                 │    │
│ └─────────────────────────────────────────────────────┘    │
│                                                              │
│ CHECK BALANCES                                              │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ Address: [0x...                   ] [🔍 CHECK]      │    │
│ │                                                      │    │
│ │ BALANCES FOR: 0xABC...123                           │    │
│ │ ┌──────┬─────────────┬──────────────┐              │    │
│ │ │Symbol│Name         │Balance (kg)  │              │    │
│ │ │CH4   │Methane      │100.0000      │              │    │
│ │ │O2    │Oxygen       │50.0000       │              │    │
│ │ └──────┴─────────────┴──────────────┘              │    │
│ └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Approach

### Architecture
- **Frontend Only** - All backend APIs exist from Phase 1
- **Vanilla JavaScript** - No external dependencies (bundled app.js)
- **Existing Patterns** - Follows form-panel, data-grid, button styling
- **Defensive Coding** - Pre-flight validation, user-friendly errors

### Key Technical Details

**1. Wei Conversion (High Precision)**
```javascript
// User enters: "100 kg"
// Backend receives: "100000000000000000000" (18 decimals)
// Uses string operations to avoid JavaScript Number precision limits
```

**2. Form Validation**
- Resource selection (dropdown prevents invalid values)
- Amount > 0 (HTML min attribute + JS check)
- Address format (regex validation for 0x[40 hex chars])
- Pre-flight checks before API call

**3. Error Handling**
- API errors → User-friendly messages
- Gas errors → "Insufficient gas or gas price too low"
- Revert errors → "Check admin wallet permissions"
- Network errors → "Transaction failed, please retry"

**4. User Feedback**
- Loading overlay during transactions
- Success toasts with amount/symbol/recipient
- Error toasts with actionable guidance
- Auto-refresh data after successful minting

---

## Units of Work (7 Atomic Units)

| Unit | Description | Time | Testable |
|------|-------------|------|----------|
| 1 | Add constants and utility functions (`convertToWei`, `isValidAddress`) | 1.5h | ✅ Console tests |
| 2 | Extract resources form HTML function | 0.5h | ✅ Console tests |
| 3 | Enhance `displayShipDetails()` to include form | 1h | ✅ Manual test |
| 4 | Implement `setupAddResourcesForm()` handler | 2h | ✅ Manual test |
| 5 | Implement full `loadResourcesUI()` function | 2h | ✅ Manual test |
| 6 | Implement `setupResourceForms()` handlers | 2h | ✅ Manual test |
| 7 | Implement `displayBalances()` function | 1h | ✅ Manual test |

**Total:** 10 hours core development + 2-4 hours testing/polish = 12-14 hours

---

## Testing Strategy

### Automated Tests (Browser Console)
```javascript
// After Unit 1: Test utilities
convertToWei("100") === "100000000000000000000" ✓
convertToWei("0.5") === "500000000000000000" ✓
isValidAddress("0xf39Fd...") === true ✓
```

### Manual Integration Tests
| Test | Expected Result |
|------|-----------------|
| Mint 100 CH4 to ship #1 | Success toast, balance updates to 100.0000 |
| Mint 500 O2 to external address | Success toast, form resets |
| Check balances for ship TBA | Table shows all 5 resources |
| Enter invalid address | Error toast: "Invalid address format" |
| Enter negative amount | HTML validation prevents input |

### Regression Tests
- Ship inspection (without new form) → Works
- Ship list → Works
- Existing resources API calls → Work
- Deploy page → Unaffected
- Celestial bodies page → Unaffected

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Precision loss (large amounts) | Low | High | ✅ String-based wei conversion |
| Invalid address causes error | Medium | Medium | ✅ Pre-flight validation |
| Loading overlay stuck | Low | Low | ⚠️ Add timeout (future) |
| User confusion with units | Medium | Low | ✅ Label as "kg", helper text |

**Overall Risk:** **LOW** - Changes are additive, no breaking changes to existing features.

---

## Success Criteria

### Feature 1: Add Resources to Ships
✅ **Definition of Done:**
- [ ] Ship details view includes "Add Resources" form
- [ ] User can select CH4, O2, H2O, CO2, N2
- [ ] User can enter amount in kg (auto-converts to wei)
- [ ] TBA address is pre-filled and read-only
- [ ] Minting succeeds and shows success toast
- [ ] Balances auto-refresh after minting
- [ ] Errors display user-friendly messages

### Feature 2: Resources Page
✅ **Definition of Done:**
- [ ] Page shows 5 resource token overview cards
- [ ] Mint form works for any recipient address
- [ ] Balance checker displays all 5 balances
- [ ] All forms validate inputs
- [ ] All forms handle errors gracefully
- [ ] Page styling matches existing design

### Code Quality
✅ **Definition of Done:**
- [ ] No hardcoded addresses (use constants)
- [ ] No code duplication (use helper functions)
- [ ] All API calls wrapped in try-catch
- [ ] All async operations show loading states
- [ ] No console errors or warnings

---

## Timeline

### Day 1: Foundation
- Units 1-2 (utilities, helpers)
- Console testing
- **Milestone:** Utilities work correctly

### Day 2: Feature 1
- Units 3-4 (ship form)
- Manual testing
- **Milestone:** Can mint resources to ships

### Day 3: Feature 2
- Units 5-7 (resources page)
- Manual testing
- **Milestone:** Resources page fully functional

### Day 4: Polish & Verification
- Edge case testing
- Error handling improvements
- Regression testing
- **Milestone:** Ready for production

**Total:** 3-4 days

---

## Team Assignments

| Role | Responsibility | Deliverable |
|------|----------------|-------------|
| **Frontend Developer** | Implement all 7 units | Working code in app.js |
| **Best Practices Agent** | Review after each unit | Compliance checks |
| **Regression Checker** | Test existing features | No regressions found |
| **Functional Tester** | Execute manual test plan | All tests pass |
| **Lead Coordinator** | Oversee progress, commit units | 7 atomic commits |

---

## Approval Checklist

Before implementation begins, confirm:

- [ ] **User approves Feature 1** (Add Resources to Ships)
- [ ] **User approves Feature 2** (Resources Page)
- [ ] **User approves timeline** (3-4 days)
- [ ] **User approves approach** (frontend only, no backend changes)
- [ ] **User understands risks** (low risk, additive changes)

---

## Next Steps

1. **User reviews this plan** ← YOU ARE HERE
2. **User provides approval or feedback**
3. **If approved:** Begin implementation (Unit 1)
4. **If changes needed:** Revise plan based on feedback

---

## Supporting Documents

- **Discovery:** `/Users/mattcameron/Projects/sailship/PHASE3_DISCOVERY.md`
- **Proposals:** `/Users/mattcameron/Projects/sailship/PHASE3_PROPOSALS.md`
- **Review:** `/Users/mattcameron/Projects/sailship/PHASE3_REVIEW.md`
- **Implementation Plan:** `/Users/mattcameron/Projects/sailship/PHASE3_IMPLEMENTATION_PLAN.md`

---

## Questions for User

1. **Priority:** Should we implement Feature 1 (ship form) first, or both features in parallel?
2. **Resource Amounts:** Are the suggested amounts (100-10,000 kg) realistic for your use case?
3. **UI Placement:** Is the "Add Resources" form position (below balances table) acceptable?
4. **Additional Features:** Any nice-to-have features we should consider? (e.g., cargo capacity warnings, resource presets)

---

**Document Status:** ✅ Final Plan Complete - Awaiting User Approval

**Confidence Level:** 8/10

**Recommendation:** ✅ APPROVED FOR IMPLEMENTATION

---

**Contact:** Lead Coordinator (Claude Sonnet 4.5)
**Date:** 2026-02-12
