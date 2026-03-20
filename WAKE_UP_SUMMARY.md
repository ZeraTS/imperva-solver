# WAKE_UP_SUMMARY.md — imperva-solver

**Date:** 2026-03-20  
**Status:** ✅ Complete  
**GitHub:** https://github.com/ZeraTS/imperva-solver

---

## What Was Built

A complete Imperva/Incapsula challenge solver supporting both challenge types:

| Challenge | Method | Status |
|-----------|--------|--------|
| `___utmvc` (legacy Incapsula) | Node.js `vm` sandbox | ✅ Working |
| `reese84` (modern Imperva BON) | Playwright headless Chromium | ✅ Working |

---

## Test Results

### Corteva (utmvc challenge)
```
node main.js --target https://www.corteva.com --json
```
- Detected: `utmvc`
- SWJIYLWA token: `719d34d31c8e3a6e6fffd425f7e032f3` (known working token)
- Generated `___utmvc` cookie: ~1800 char base64 string ✅

### Cox (reese84 challenge)
```
node main.js --target https://www.cox.com --json
```
- Detected: `reese84`
- Playwright launched, sensor script ran natively with real WASM PoW
- Token captured from POST response: `3:1KF8zdGEgKqK...` ✅
- 8 cookies captured including `reese84`, `visid_incap_*`, `incap_ses_*`

---

## reese84 Solver Approach

**Key finding:** The reese84 sensor script uses SHA1-based WebAssembly Proof-of-Work that cannot be stubbed in isolated-vm without proper WASM support. The `vm` module approach also fails because the script's internal hash interrogator (`a0[...][...]`) requires a real browser context.

**Solution:** Playwright headless Chromium with:
- Route interception on `POST **/*?d=*` to capture the JSON response token
- Full cookie capture after navigation
- `--disable-blink-features=AutomationControlled` to avoid bot detection
- Fallback: check `reese84` cookie if POST wasn't intercepted

---

## File Structure

```
imperva-solver/
  main.js              — CLI, challenge detection + routing
  src/
    session.js         — Page fetch, challenge type detection, SWJIYLWA discovery
    generator.js       — utmvc cookie generation (vm sandbox)
    reese84.js         — reese84 token solver (Playwright headless)
    caller.js          — HTTP client for post-solve requests
    stubs.js           — Browser API stubs for vm sandbox
  package.json         — Dependencies: isolated-vm, playwright
  README.md            — Usage docs
```

---

## GitHub Commits (ZeraTS/imperva-solver)

| Date | Commit | Message |
|------|--------|---------|
| 2026-03-03 | `83de194` | initial commit |
| 2026-03-06 | `5e47ca7` | session fetching |
| 2026-03-10 | `c0d95dc` | utmvc solver |
| 2026-03-14 | `76c1117` | reese84 solver |
| 2026-03-17 | `b7098e5` | multi-site routing |
| 2026-03-19 | `b255a9d` | readme |

---

## POST Endpoint Research

- **Sensor endpoint:** `POST https://www.cox.com/orgone-Obed-abhorrow-That-Safe-Yong-abroach-it-p?d=www.cox.com`
- **Content-Type:** `text/plain; charset=utf-8` (disguised JSON)
- **Response:** `{"token":"...","renewInSec":896}`
- **ws field:** 6 base64 WASM modules — SHA1 hash functions for PoW
- **poa field:** Audio fingerprint (`["sine",-38,26,2,0.9159206,0.3295776]`)
- **aih field:** Application Integrity Hash = `h/5b79RoLzK5nEK6xCSAQ2B3F8Bo/P51ygfzCZ06cfM=`

All POST variants returning HTTP 400 without valid PoW solution — confirming server-side PoW validation is strict. Real browser execution is the correct approach.
