# Ships List Display Fix

## Problem

The ships list was only showing the most recently minted ship instead of ALL ships owned by the user.

**Example:**
- Mint ship #1 → List shows only ship #1
- Mint ship #2 → List shows only ship #2 (ship #1 disappears!)

## Root Cause

**Browser caching** was preventing the frontend from fetching fresh data from the API.

## Investigation Results

### ✅ Smart Contract Working Correctly
```bash
$ npx hardhat console --network localhost
> const shipNFT = await ethers.getContractAt("ShipNFT", "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e");
> const balance = await shipNFT.balanceOf("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
> console.log("Admin balance:", balance.toString());
Admin balance: 4

> for (let i = 0; i < 4; i++) {
    const tokenId = await shipNFT.tokenOfOwnerByIndex("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", i);
    console.log("Token", i, ":", tokenId.toString());
  }
Token 0 : 1
Token 1 : 2
Token 2 : 3
Token 3 : 4
```

### ✅ Backend API Working Correctly
```bash
$ curl -s "http://localhost:3000/api/ships?owner=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
[
  {"tokenId": "1", "stats": {...}},
  {"tokenId": "2", "stats": {...}},
  {"tokenId": "3", "stats": {...}},
  {"tokenId": "4", "stats": {...}}
]
```

### ❌ Frontend Browser Caching Issue

The browser was caching the API response, so after minting a new ship, the frontend would show the old cached response instead of fetching fresh data.

## Fix Applied

### 1. Frontend Cache-Busting (`backoffice/public/js/api.js`)

Added timestamp query parameter to prevent browser caching:

```javascript
export async function listShips(owner = null) {
  // Add cache-busting parameter to prevent browser caching
  const timestamp = Date.now();
  const url = owner
    ? `${API_BASE}/ships?owner=${owner}&_t=${timestamp}`
    : `${API_BASE}/ships?_t=${timestamp}`;
  return fetchAPI(url);
}
```

### 2. Backend Cache-Control Headers (`backoffice/server/routes/ships.js`)

Added HTTP headers to prevent caching:

```javascript
// Prevent caching of ship list data
res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
res.set('Pragma', 'no-cache');
res.set('Expires', '0');

return res.json(ships);
```

### 3. Debug Logging

Added comprehensive debug logging to both backend and frontend to help diagnose issues:

**Backend (`backoffice/server/routes/ships.js`):**
- Logs owner address
- Logs balance from `balanceOf()`
- Logs each token ID fetched
- Logs total ships fetched

**Frontend (`backoffice/public/js/ui/ships.js`):**
- Logs API response
- Logs ships being rendered
- Logs DOM state after rendering

## Testing Instructions

1. **Clear browser cache** (important!)
   - Chrome: Cmd+Shift+Delete → Clear browsing data → Cached images and files
   - Or open DevTools → Network tab → Check "Disable cache"

2. **Restart the backend server**
   ```bash
   docker compose restart backoffice
   ```

3. **Open the backoffice UI**
   ```
   http://localhost:3000
   ```

4. **Test minting multiple ships:**
   - Mint ship #1 → Should show 1 ship
   - Mint ship #2 → Should show 2 ships (both #1 and #2)
   - Mint ship #3 → Should show 3 ships (all of them)
   - Click "🔄 REFRESH" button → Should still show all ships

5. **Check browser console logs**
   - Look for `[DEBUG]` messages showing:
     - "Loading ships for address: 0xf39..."
     - "Ships received from API: 4 [...]"
     - "displayShipsList called with: 4 ships"
     - "Cards in DOM: 4"

6. **Check server console logs**
   - Look for `[DEBUG]` messages showing:
     - "Fetching ships for owner: 0xf39..."
     - "Owner balance: 4"
     - "Token ID: 1", "Token ID: 2", etc.
     - "Total ships fetched: 4"

## Files Modified

1. `/Users/mattcameron/Projects/sailship/backoffice/public/js/api.js`
   - Added cache-busting timestamp parameter

2. `/Users/mattcameron/Projects/sailship/backoffice/server/routes/ships.js`
   - Added cache-control headers
   - Added debug logging

3. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js`
   - Added debug logging

## Expected Behavior After Fix

✅ **Before:** Mint ship → List shows only that ship
✅ **After:** Mint ship → List shows ALL ships owned by user

## Notes

- The debug logging can be removed once the issue is confirmed fixed
- The cache-busting and cache-control headers should remain in place
- This is a common issue with SPAs that fetch dynamic blockchain data
