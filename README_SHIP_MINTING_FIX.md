# Ship Minting Fix - Complete Guide

## Quick Start

If you just want to fix the issue and get back to work:

1. **Read:** `EMERGENCY_FIX_INSTRUCTIONS.md` (5 minutes)
2. **Follow:** The step-by-step instructions (10 minutes)
3. **Test:** Mint a ship at http://localhost:3000 (2 minutes)

**Total time:** ~15-20 minutes

---

## Problem Summary

**Error:** `WARNING: Calling an account which is not a contract`

**Root Cause:** The ShipNFT contract address in `deployment.json` is stale. When Hardhat node restarts, all contracts are wiped. The backend tried to call a non-existent contract.

**Solution:** Redeploy contracts after every Hardhat node restart, and fix the backend code to extract tokenId from events instead of using staticCall.

---

## Documents Overview

### 1. EMERGENCY_FIX_INSTRUCTIONS.md
**Purpose:** Step-by-step user instructions to fix the problem

**Contents:**
- Problem explanation
- 5-step fix process (restart node, redeploy, restart server, test)
- Verification checklist
- Troubleshooting (7 common errors)
- Quick recovery commands
- Maintenance tips

**When to use:** When you encounter the "not a contract" error and need to fix it NOW.

---

### 2. EMERGENCY_FIX_SUMMARY.md
**Purpose:** Technical documentation of what was changed and why

**Contents:**
- Root cause analysis
- Code changes (backend event parsing, frontend defensive coding)
- Contract structure verification
- Testing strategy
- Success criteria
- Mental verification (logic checks)

**When to use:** When you want to understand what the fix does and why it works.

---

### 3. VERIFICATION_OUTPUTS.md
**Purpose:** Reference guide showing expected terminal outputs at each step

**Contents:**
- Terminal 1 expected output (Hardhat node)
- Terminal 2 expected output (Contract deployment)
- Terminal 3 expected output (Backoffice server)
- Browser expected output (UI and console)
- Verification checklist
- Diagnostic commands
- Common mistakes

**When to use:** When following the fix instructions and unsure if your terminal output is correct.

---

### 4. README_SHIP_MINTING_FIX.md (this file)
**Purpose:** Overview and navigation guide for all fix documentation

**Contents:**
- Quick start instructions
- Document summaries
- Recommended reading order
- FAQ

**When to use:** As your starting point to understand the fix and find the right document.

---

## Recommended Reading Order

### If you just want it to work:
1. `EMERGENCY_FIX_INSTRUCTIONS.md` → Follow step-by-step
2. `VERIFICATION_OUTPUTS.md` → Refer to while following steps

### If you want to understand the fix:
1. `EMERGENCY_FIX_SUMMARY.md` → Understand the problem and solution
2. `EMERGENCY_FIX_INSTRUCTIONS.md` → Apply the solution
3. `VERIFICATION_OUTPUTS.md` → Verify it worked

### If you're debugging a failed fix:
1. `VERIFICATION_OUTPUTS.md` → Compare your outputs to expected
2. `EMERGENCY_FIX_INSTRUCTIONS.md` → "What If It Still Fails?" section
3. `EMERGENCY_FIX_SUMMARY.md` → "Rollback Plan" section

---

## FAQ

### Q: Why does this happen every time I restart Hardhat node?

**A:** Hardhat node is an in-memory blockchain. When you restart it, everything is wiped (like RAM). You must redeploy contracts after every restart.

**Alternative:** Use a persistent blockchain like Ganache or a testnet, but Hardhat node is faster for development.

---

### Q: Can I automate this?

**A:** Yes! See the "Maintenance Tip" in `EMERGENCY_FIX_INSTRUCTIONS.md` for a startup script that:
1. Starts Hardhat node
2. Waits 5 seconds
3. Deploys contracts
4. Starts backoffice server

---

### Q: What if I don't want to use 3 terminals?

**A:** You can use terminal multiplexers like `tmux` or `screen`, or use the startup script mentioned above with background processes.

---

### Q: Why did the previous fix (staticCall) fail?

**A:** `staticCall` simulates a transaction to get the return value, but it tried to call a non-existent contract (stale address). Even if the contract existed, `staticCall` would fail because:
1. It doesn't work reliably for state-changing functions
2. ethers.js v6 has different syntax that wasn't used correctly

**Correct approach:** Extract tokenId from the `ShipMinted` event emitted during the transaction.

---

### Q: What are the code changes?

**A:** Two main changes:

1. **Backend (`server/routes/ships.js`):**
   - Removed staticCall approach
   - Added event parsing loop using `shipNFT.interface.parseLog(log)`
   - Extracts tokenId from `ShipMinted` event

2. **Frontend (`public/js/ui/ships.js`):**
   - Added null checks for shipData and tbaData
   - Displays user-friendly error messages instead of crashing

---

### Q: How do I know if the fix worked?

**A:** You'll see:
1. Green success toast: "Ship minted successfully! Token ID: 1"
2. Ship details panel appears with stats and TBA info
3. No "not a contract" errors in console

See `VERIFICATION_OUTPUTS.md` for detailed success indicators.

---

### Q: What if I'm still getting errors after following all steps?

**A:** Check these in order:

1. **Verify Hardhat node is running** (Terminal 1 shows RPC server message)
2. **Verify contracts are deployed** (Terminal 2 shows "Deployment complete!")
3. **Verify deployment.json has recent timestamp** (last few minutes)
4. **Verify backoffice server is restarted** (Terminal 3 shows contract addresses)
5. **Verify browser page is refreshed** (Ctrl+R or Cmd+R)

If all verified and still failing, check the "What If It Still Fails?" section in `EMERGENCY_FIX_INSTRUCTIONS.md`.

---

### Q: Can I skip the documentation and just fix the code?

**A:** The code is already fixed! The issue is that your contracts are not deployed. You MUST follow the deployment steps in `EMERGENCY_FIX_INSTRUCTIONS.md`.

**Code changes are already in place:**
- ✓ Backend uses event parsing (not staticCall)
- ✓ Frontend has defensive null checks
- ✓ ethers.js v6 syntax is correct

**What you need to do:**
1. Restart Hardhat node
2. Redeploy contracts
3. Restart backoffice server
4. Test

---

### Q: Why is the ShipNFT address `0xb7f8bc63bbcad18155201308c8f3540b07f84f5e` bad?

**A:** That's the address from an old Hardhat session. After restarting the node, that address points to an empty account (not a contract). That's why you get "not a contract" error.

**Solution:** Redeploy contracts to get a NEW address that points to an actual deployed contract.

---

### Q: How do I check if contracts are actually deployed?

**A:** Use the diagnostic commands in `VERIFICATION_OUTPUTS.md` (Quick Diagnostic Commands section):

```bash
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat console --network localhost

> const ShipNFT = await ethers.getContractFactory("ShipNFT");
> const shipNFT = ShipNFT.attach("0x<your-address>");
> await shipNFT.name();
// Should return "SpaceShip" without error
```

If this reverts or shows "not a contract", contracts are not deployed.

---

## File Locations

All fix documentation is in the project root:

```
/Users/mattcameron/Projects/sailship/
├── EMERGENCY_FIX_INSTRUCTIONS.md       # Step-by-step fix guide
├── EMERGENCY_FIX_SUMMARY.md            # Technical documentation
├── VERIFICATION_OUTPUTS.md             # Expected terminal outputs
└── README_SHIP_MINTING_FIX.md          # This file
```

---

## Quick Reference Commands

### Start fresh (full reset)
```bash
# Terminal 1
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat node

# Terminal 2
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3
cd /Users/mattcameron/Projects/sailship/backoffice
npm start
```

### Verify deployment
```bash
cat /Users/mattcameron/Projects/sailship/contracts/deployment.json | grep timestamp
# Should show recent time (last few minutes)
```

### Test in browser
1. Open http://localhost:3000
2. Go to Ships section
3. Click "Mint Test Ship"
4. Verify green success toast appears

---

## Success Criteria

You'll know everything is working when:

- [x] No "not a contract" errors
- [x] Ship mints successfully (green toast)
- [x] Token ID is displayed (e.g., "Token ID: 1")
- [x] Ship details panel shows stats
- [x] TBA address is displayed
- [x] Resource balances table is shown
- [x] All terminal outputs match expected (see VERIFICATION_OUTPUTS.md)

---

## Need Help?

1. **First:** Check `EMERGENCY_FIX_INSTRUCTIONS.md` "What If It Still Fails?" section
2. **Second:** Compare your terminal outputs to `VERIFICATION_OUTPUTS.md`
3. **Third:** Review `EMERGENCY_FIX_SUMMARY.md` "Rollback Plan" section
4. **Last resort:** Check browser console (F12) and server logs for exact error messages

---

## Maintenance

After successfully fixing ship minting:

1. **Remember:** Redeploy contracts after every Hardhat node restart
2. **Consider:** Using the startup script (see EMERGENCY_FIX_INSTRUCTIONS.md)
3. **Bookmark:** This README and VERIFICATION_OUTPUTS.md for quick reference

---

## Document Change Log

- **2026-02-12:** Initial creation of all fix documentation
  - EMERGENCY_FIX_INSTRUCTIONS.md created
  - EMERGENCY_FIX_SUMMARY.md created
  - VERIFICATION_OUTPUTS.md created
  - README_SHIP_MINTING_FIX.md created
  - Backend code fixed (event parsing)
  - Frontend code enhanced (defensive coding)
