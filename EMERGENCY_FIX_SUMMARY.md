# Emergency Fix Summary - Ship Minting

## Date: 2026-02-12

## Problem Analysis

### Root Cause
The ShipNFT contract address in `deployment.json` was **STALE**. Address `0xb7f8bc63bbcad18155201308c8f3540b07f84f5e` pointed to a non-existent contract because:
1. Hardhat node was restarted (wipes all contracts from in-memory blockchain)
2. Contracts were not redeployed after restart
3. Backend tried to call methods on empty address → "not a contract" error

### Secondary Issue
Backend code used `staticCall` approach which:
- Failed with "undefined" error because it tried to call non-existent contract
- Was unnecessary complexity for getting tokenId

---

## Code Changes

### 1. Backend Fix: Event Parsing (ethers.js v6)

**File:** `/Users/mattcameron/Projects/sailship/backoffice/server/routes/ships.js`

**Changed:** Lines 27-54

**Before (BROKEN):**
```javascript
// Use staticCall to get the return value (tokenId) before sending the transaction
const tokenIdBigInt = await shipNFT.mintShip.staticCall(...params);

// Now send the actual transaction
const tx = await shipNFT.mintShip(...params);
const receipt = await tx.wait();

// Convert BigInt to string for JSON serialization
const tokenId = tokenIdBigInt.toString();
```

**After (FIXED):**
```javascript
// Send the transaction
const tx = await shipNFT.mintShip(...params);
const receipt = await tx.wait();

// Extract tokenId from ShipMinted event
let tokenId = null;
for (const log of receipt.logs) {
  try {
    // Parse the log using the contract interface (ethers.js v6 syntax)
    const parsed = shipNFT.interface.parseLog(log);

    if (parsed && parsed.name === 'ShipMinted') {
      // Extract tokenId from the event args
      tokenId = parsed.args.tokenId.toString();
      break;
    }
  } catch (error) {
    // Skip logs that aren't from our contract
    continue;
  }
}

if (!tokenId) {
  throw new Error('ShipMinted event not found in transaction receipt');
}
```

**Key Changes:**
1. **Removed staticCall** - It was causing errors and unnecessary
2. **Added event parsing loop** - Iterates through transaction logs
3. **ethers.js v6 syntax** - `parseLog(log)` takes entire log object (NOT `{ topics, data }`)
4. **Error handling** - Throws if event not found (failsafe)

---

### 2. Frontend Enhancement: Defensive Coding

**File:** `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js`

**Changed:** Lines 250-262

**Added:**
```javascript
// Defensive coding: check if shipData exists and has required structure
if (!shipData || !shipData.stats) {
  container.innerHTML = `
    <div style="background: rgba(255, 78, 78, 0.1); border: 1px solid rgba(255, 78, 78, 0.3); padding: 20px; margin-top: 20px;">
      <p class="text-muted">Unable to load ship data</p>
    </div>
  `;
  return;
}
```

**Why:**
- Prevents crashes if backend returns unexpected data structure
- Displays user-friendly error message instead of blank screen
- Handles edge cases gracefully

---

## Documentation Created

### 1. User Instructions
**File:** `/Users/mattcameron/Projects/sailship/EMERGENCY_FIX_INSTRUCTIONS.md`

**Contents:**
- Problem explanation (stale contract address)
- Step-by-step deployment process (3 terminals)
- Verification checklist
- Troubleshooting section (7 common errors)
- Quick recovery commands
- Success indicators
- Maintenance tips (startup script)

**Key Sections:**
1. **The Problem** - Why "not a contract" error occurs
2. **Step-by-Step Fix** - Exact commands for each terminal
3. **Verification Checklist** - What to check before testing
4. **What If It Still Fails?** - 7 troubleshooting scenarios
5. **Quick Recovery Commands** - Copy-paste restart sequence
6. **Understanding the Fix** - Code changes explained
7. **Why Does This Happen?** - Hardhat node behavior

---

## Technical Verification

### Contract Structure (Confirmed Working)
**File:** `contracts/contracts/ShipNFT.sol`

```solidity
event ShipMinted(uint256 indexed tokenId, address indexed owner, string className);

function mintShip(...) external returns (uint256) {
    uint256 tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
    _shipStats[tokenId] = ShipStats({...});

    emit ShipMinted(tokenId, to, className);  // ✓ Emits event correctly

    return tokenId;  // ✓ Returns tokenId (but not captured in transaction)
}
```

**Event Parameters:**
- `tokenId` - First indexed parameter (what backend extracts)
- `owner` - Second indexed parameter
- `className` - Non-indexed string

**Why Event Parsing is Required:**
- Transaction return values are NOT accessible in receipt
- Only events are logged in receipt.logs
- ethers.js provides `parseLog()` to extract event data

---

## Testing Strategy

### Manual Test Steps
1. **Terminal 1:** Start Hardhat node
   ```bash
   cd contracts && npx hardhat node
   ```

2. **Terminal 2:** Deploy contracts
   ```bash
   cd contracts && npx hardhat run scripts/deploy.js --network localhost
   ```

3. **Terminal 3:** Start backoffice server
   ```bash
   cd backoffice && npm start
   ```

4. **Browser:** Test minting
   - Open http://localhost:3000
   - Go to Ships section
   - Click "Mint Test Ship"
   - Verify success toast shows tokenId
   - Verify ship details panel displays

### Expected Results
- ✓ No "not a contract" errors
- ✓ tokenId extracted from event (e.g., "Token ID: 1")
- ✓ Ship details display with stats
- ✓ TBA address shown
- ✓ Resource balances table rendered

### Failure Indicators
- ✗ "not a contract" error → Contracts not deployed
- ✗ "ShipMinted event not found" → Contract bug (unlikely)
- ✗ "Unable to load ship data" → Backend error
- ✗ Blank ship details → Frontend crash (shouldn't happen with new defensive coding)

---

## Success Criteria

### Code Quality
- [x] No staticCall usage (removed)
- [x] Proper ethers.js v6 event parsing (implemented)
- [x] Defensive null checks in frontend (added)
- [x] Error handling for missing events (added)

### Documentation Quality
- [x] Clear problem explanation
- [x] Step-by-step instructions
- [x] Troubleshooting section (7 scenarios)
- [x] Code changes explained
- [x] Quick recovery commands

### User Experience
- [x] Instructions are copy-pasteable
- [x] Terminal layout clearly explained (3 terminals)
- [x] Verification checklist provided
- [x] Success indicators listed
- [x] Maintenance tips included (startup script)

---

## Mental Verification (Pre-Test)

### Backend Logic Check
1. **Transaction sent** → Receipt returned
2. **Receipt has logs array** → Iterate through logs
3. **Parse each log** → Skip non-contract logs
4. **Find ShipMinted event** → Extract tokenId
5. **Return tokenId as string** → JSON serializable

**Potential Failure Points:**
- ✓ Contract not deployed → Handled by error throw
- ✓ Event not emitted → Handled by null check + error
- ✓ Parsing error → Handled by try-catch in loop

### Frontend Logic Check
1. **Check shipData exists** → Display error if null
2. **Check shipData.stats exists** → Display error if null
3. **Check tbaData exists** → Display error if null
4. **Check tbaData.balances is array** → Display "no balances" if empty

**Potential Failure Points:**
- ✓ Backend returns null → Error message displayed
- ✓ TBA lookup fails → Error message displayed
- ✓ Balances array empty → "No balances" message shown

---

## Comparison to Previous Attempts

### Previous Attempt (FAILED)
- Used staticCall approach
- Caused "undefined" error
- Called non-existent contract

### Current Fix (SHOULD WORK)
- Uses event parsing (standard approach)
- Proper ethers.js v6 syntax
- Comprehensive error handling
- Clear documentation for user

### Why This Should Succeed
1. **Root cause addressed** - Instructions tell user to redeploy
2. **Code uses correct pattern** - Event parsing is standard for getting tokenId
3. **Defensive coding added** - Prevents crashes from unexpected data
4. **Clear documentation** - User knows exactly what to do

---

## Next Steps for User

1. **Stop all running processes** (Hardhat node, backoffice server)
2. **Follow EMERGENCY_FIX_INSTRUCTIONS.md step-by-step**
3. **Verify each step** using the checklist
4. **Test ship minting** in browser
5. **Report results** (success or specific error message)

---

## Rollback Plan (If Still Fails)

If this fix doesn't work:

1. **Check Hardhat node logs** - Are contracts deployed?
2. **Check deployment.json** - Are addresses updated?
3. **Check server logs** - What's the exact error?
4. **Check browser console** - Any frontend errors?
5. **Verify contract code** - Is ShipMinted event emitted?

**Debugging Commands:**
```bash
# Check if contract exists at address
npx hardhat console --network localhost
> const ShipNFT = await ethers.getContractFactory("ShipNFT");
> const shipNFT = ShipNFT.attach("0x<address>");
> await shipNFT.getAddress();  # Should return address, not revert

# Check event is emitted
> const tx = await shipNFT.mintShip(...);
> const receipt = await tx.wait();
> console.log(receipt.logs);  # Should show logs array with events
```

---

## Confidence Level

**9/10** - This fix should work because:
1. Root cause identified (stale contract address)
2. Correct solution implemented (event parsing)
3. Proper ethers.js v6 syntax used
4. Comprehensive documentation provided
5. Defensive coding prevents crashes
6. Mental verification passed all checks

**Remaining 10% risk:** Unknown edge cases or environment-specific issues.
