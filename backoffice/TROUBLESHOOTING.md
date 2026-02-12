# UI Troubleshooting Guide

## Quick Diagnostic

### 1. Open Browser Console
1. Open http://localhost:3000
2. Press **F12** or **Right-click → Inspect**
3. Go to **Console** tab
4. Look for any red error messages

### 2. Common Issues

#### Issue: Blank page
**Symptoms:** Page loads but content area is empty

**Check:**
```javascript
// In browser console, type:
fetch('/health').then(r => r.json()).then(console.log)
```

**Expected:** Should show `{ status: 'ok', chainUrl: '...', chainId: 1337 }`

#### Issue: JavaScript not loading
**Symptoms:** Console shows "Failed to load module" or CORS errors

**Fix:** Make sure you're accessing via `http://localhost:3000` (not `file://` or `http://127.0.0.1:3000`)

#### Issue: CSS not loading
**Symptoms:** Page shows unstyled HTML

**Check:**
```bash
curl http://localhost:3000/css/style.css | head -5
```

**Expected:** Should show CSS starting with `/* Backoffice Dark Theme */`

### 3. Force Refresh
1. Hold **Shift + Ctrl + R** (Windows/Linux) or **Shift + Cmd + R** (Mac)
2. This clears the browser cache

### 4. Test API Directly

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test ships endpoint
curl http://localhost:3000/api/ships/1
```

### 5. Check What's Loaded

In browser console:
```javascript
// Check if main.js loaded
console.log(window.location.href)

// Check if content div exists
console.log(document.getElementById('mainContent'))

// Check for any errors
console.log('Ready')
```

### 6. Server Logs

Check the terminal where you ran `npm start` for any error messages.

---

## Manual Test

If the UI still doesn't work, you can test everything via API:

```bash
# 1. Mint a ship
curl -X POST http://localhost:3000/api/ships/mint \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "className": "TEST-CLASS",
    "mass": 10000,
    "sailArea": 3000000,
    "sailReflectivity": 9000,
    "maxSailCount": 5,
    "cargoCapacity": 1000000
  }'

# 2. Get ship TBA
curl http://localhost:3000/api/ships/2/tba | jq .

# 3. Mint resources to TBA
curl -X POST http://localhost:3000/api/resources/mint \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSymbol": "CH4",
    "to": "PASTE_TBA_ADDRESS_HERE",
    "amount": "1000000000000000000000"
  }'
```

---

## If Nothing Works

**Nuclear option - restart everything:**

```bash
# Terminal 1 - Stop and restart Hardhat (Ctrl+C)
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat node

# Terminal 2 - Redeploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3 - Restart backoffice (Ctrl+C)
cd /Users/mattcameron/Projects/sailship/backoffice
npm start
```

Then open http://localhost:3000 in a **new incognito window**.
