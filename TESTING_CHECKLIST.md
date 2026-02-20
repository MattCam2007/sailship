# Testing Checklist: Ship Minting Bug Fixes

## Pre-Test Setup

### Start All Services

```bash
# From the project root
docker compose up --build
```

**Expected:**
- Hardhat node starts on http://localhost:8545
- Contracts auto-deploy (check logs: `docker compose logs contracts-deploy`)
- Backoffice server starts on http://localhost:3000
- Frontend starts on http://localhost:8080

---

## Test Case 1: Token ID Extraction

### Steps:
1. Open browser to http://localhost:3000
2. Navigate to "Ships" section
3. Fill out the mint form:
   - **Owner Address:** 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (default Hardhat account)
   - **Class Name:** HELIOS-CLASS
   - **Mass:** 10000
   - **Sail Area:** 3000000
   - **Sail Reflectivity:** 9000
   - **Max Sail Count:** 5
   - **Cargo Capacity:** 1000
4. Click "Mint Ship"

### Expected Results:
- ✅ Success toast shows: "Ship minted successfully! Token ID: 1"
- ✅ Token ID is a **number**, not **null**
- ✅ Transaction hash is displayed
- ✅ Block number is displayed

### Failure Indicators:
- ❌ "Token ID: null" appears
- ❌ Console error about event parsing
- ❌ No ship appears in list

---

## Test Case 2: TBA Balances Display

### Steps:
1. After successfully minting a ship (from Test Case 1)
2. Look for the "View Ship Details" section
3. Observe the Token Bound Account (TBA) section

### Expected Results:
- ✅ TBA Address is displayed (0x... format)
- ✅ Resource balances table appears with columns: Symbol, Balance, Address
- ✅ If no balances: Shows "No balances available" message
- ✅ If balances exist: Shows CH4, O2, H2O, CO2, N2 with amounts
- ✅ **No JavaScript errors in console**

### Failure Indicators:
- ❌ Console error: "can't access property 'map', tba.balances is undefined"
- ❌ Page crashes or freezes
- ❌ Ship details section is blank

---

## Test Case 3: Mint Multiple Ships

### Steps:
1. Mint ship #1 (Test Case 1)
2. Mint ship #2 with different parameters
3. Mint ship #3 with different parameters

### Expected Results:
- ✅ Each ship gets sequential token ID: 1, 2, 3
- ✅ Each ship displays correctly in the list
- ✅ Each ship can be viewed individually
- ✅ TBA addresses are unique for each ship

### Failure Indicators:
- ❌ Token IDs are null
- ❌ Token IDs are not sequential
- ❌ Ships don't appear in list

---

## Test Case 4: Error Handling

### Steps:
1. **Test invalid address:**
   - Try to mint with owner address: "0xinvalid"
   - Expected: Validation error, graceful failure

2. **Test missing fields:**
   - Leave "Class Name" blank
   - Expected: Validation error, graceful failure

3. **Test with stopped contracts:**
   - Stop Hardhat node (Ctrl+C)
   - Try to mint a ship
   - Expected: Network error message, no crash

### Expected Results:
- ✅ Clear error messages
- ✅ No uncaught exceptions
- ✅ UI remains functional after errors

---

## Browser Console Checks

### Open Developer Tools (F12):
1. **Console Tab:**
   - Should have NO red errors during normal operation
   - Warnings are OK (CORS, etc.)
   - Should NOT see: "can't access property 'map'"
   - Should NOT see: "undefined is not an object"

2. **Network Tab:**
   - Mint request (`POST /api/ships/mint`) should return 200 OK
   - Response body should include: `{ tokenId: "1", txHash: "0x...", blockNumber: 123 }`
   - TBA request (`GET /api/ships/1/tba`) should return 200 OK
   - Response body should include: `{ tbaAddress: "0x...", balances: [...] }`

---

## Regression Tests

### Verify Existing Features Still Work:
- ✅ Ships list loads correctly
- ✅ Resources section works
- ✅ Celestial Bodies section works
- ✅ Game Registry section works
- ✅ Navigation between sections works

---

## Success Criteria

**All tests must pass:**
- [ ] Test Case 1: Token ID is correct (not null)
- [ ] Test Case 2: TBA balances display without error
- [ ] Test Case 3: Multiple ships mint correctly
- [ ] Test Case 4: Errors are handled gracefully
- [ ] Console Checks: No JavaScript errors
- [ ] Regression Tests: Existing features work

**If any test fails:**
1. Check browser console for errors
2. Check server logs for errors
3. Verify Hardhat node is running
4. Verify contracts are deployed
5. Verify contract addresses match `deployment.json`

---

## Additional Verification Commands

### Check contract deployment status:
```bash
docker compose exec contracts-deploy cat /app/deployment.json
```

### Check server logs for errors:
Check backoffice logs (`docker compose logs backoffice`) for:
- Event parsing errors
- ABI loading errors
- Network connection errors

### Verify ethers.js version:
```bash
docker compose exec backoffice npm ls ethers
```
**Expected:** ethers@^6.10.0

---

## Debugging Tips

### If Token ID is still null:
1. Check that ShipMinted event is being emitted (in Hardhat logs)
2. Verify event signature matches contract ABI
3. Add console.log to see all receipt.logs
4. Check that parseLog is not throwing errors

### If balances crash:
1. Check TBA endpoint returns valid response
2. Verify `balances` is an array in response
3. Check for network errors in browser console
4. Verify resource contracts are deployed

---

## Quick Smoke Test (1 minute)

If you just want to verify the fix works:

```bash
# Start all services from the project root
docker compose up --build
```

Then in browser:
1. Go to http://localhost:3000
2. Go to Ships → Mint Ship
3. Fill form with any valid values
4. Click "Mint Ship"
5. **PASS if:** "Token ID: 1" appears (not null)
6. **PASS if:** No console errors about balances

---

## Test Report Template

```
Date: ______
Tester: ______

Test Case 1 (Token ID): [ ] PASS [ ] FAIL
Test Case 2 (Balances): [ ] PASS [ ] FAIL
Test Case 3 (Multiple): [ ] PASS [ ] FAIL
Test Case 4 (Errors):   [ ] PASS [ ] FAIL
Console Checks:         [ ] PASS [ ] FAIL
Regression Tests:       [ ] PASS [ ] FAIL

Notes:
_________________________________
_________________________________
_________________________________
```
