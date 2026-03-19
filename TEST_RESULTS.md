# Imperva Solver — Multi-Site Test Results

**Date:** 2026-03-20  
**Solver version:** generalized (post-hardcoded-token fix)

---

## Summary of Changes

The solver was generalized from a corteva.com-only tool to work on **any Imperva/Incapsula-protected site** using the legacy `___utmvc` challenge mechanism.

### Key Fixes Applied

| Problem | Fix |
|---------|-----|
| Hardcoded SWJIYLWA token | Dynamic discovery: scan HTML for token, then try known-working tokens against `/_Incapsula_Resource` with size validation |
| Hardcoded site ID (`3175930`) | Parse dynamically from `Set-Cookie` headers (`visid_incap_<ID>`, `nlbi_<ID>`) |
| No challenge type detection | Added `detectChallengeType(html, cookies)` → returns `utmvc`, `reese84`, `block`, or `none` |
| Fixed `cb` parameter | Always random per-request (`Math.random() * 2e9`) |
| Fixed `ns` probing | Tries `ns=1,2,3,8` in sequence; accepts first response > 1000 bytes |
| Location stubs | Already used `targetUrl` correctly; no changes needed to `stubs.js` |
| Redirect body scanning | Collects ALL intermediate redirect bodies when hunting for SWJIYLWA token |

---

## SWJIYLWA Token Discovery

The `SWJIYLWA` token is a **per-Imperva-account/cluster constant** — not per-domain. The same token `719d34d31c8e3a6e6fffd425f7e032f3` was confirmed to work across multiple completely unrelated sites (agriculture, healthcare, etc.).

Discovery strategy (in order):
1. Check the final HTML response body for `SWJIYLWA=<hex32>`
2. Check all intermediate redirect bodies
3. Try known tokens against `/_Incapsula_Resource?SWJIYLWA=<token>&ns=<N>&cb=<random>` — validate by checking response size > 1000 bytes
4. Fail with actionable error message if all attempts fail

---

## Test Results

### Site 1: www.corteva.com (original target)
- **Imperva Site ID:** `3175930`
- **Challenge type:** `utmvc`
- **SWJIYLWA discovery:** Not in HTML → found via known-token probe (ns=1, 86–89KB script)
- **___utmvc generated:** ✅ Yes
- **Final HTTP response:** `200 OK` — `191,412 bytes`
- **Page title:** `Corteva Agriscience™ | Global`
- **Block page detected:** No
- **Notes:** CDN-cached response doesn't include the Imperva script injection. Known token resolves this.

---

### Site 2: www.pioneer.com
- **Imperva Site ID:** `3193328` (different from corteva)
- **Challenge type:** `utmvc`
- **SWJIYLWA discovery:** Not in HTML → found via known-token probe (ns=1, 84–90KB script)
- **___utmvc generated:** ✅ Yes
- **Final HTTP response:** `302` (root `/` redirects to `/landing`) → `200 OK` on `/landing` — `47,416 bytes`
- **Page title:** `Pioneer® Seeds | Global`
- **Block page detected:** No
- **Notes:** Site root returns 302. Used `--call https://www.pioneer.com/landing` for full page test.
  Site also injects SWJIYLWA into `/landing` HTML on some requests (observed during reconnaissance).

---

### Site 3: www.aetna.com
- **Imperva Site ID:** `2783402` (completely different industry — healthcare)
- **Challenge type:** `utmvc`
- **SWJIYLWA discovery:** Not in HTML → found via known-token probe (ns=1, 88–92KB script)
- **___utmvc generated:** ✅ Yes
- **Final HTTP response:** `200 OK` — `131,356 bytes`
- **Page title:** `Health Insurance Plans | Aetna`
- **Block page detected:** No
- **Notes:** Confirmed the SWJIYLWA token is cross-industry — same token works for healthcare giant Aetna as for agriculture companies.

---

### Site 4: www.landolakesinc.com
- **Imperva Site ID:** `642769`
- **Challenge type:** `utmvc`
- **SWJIYLWA discovery:** **Found in HTML body** (inline script injection observed) → no probe needed
- **___utmvc generated:** ✅ Yes
- **Final HTTP response:** `200 OK` — solved successfully
- **Block page detected:** No
- **Notes:** This site actively injects the SWJIYLWA token inline into HTML — the primary discovery path worked directly.

---

## Failure Cases & Limitations

| Scenario | Behavior |
|----------|----------|
| **reese84 challenge** | Detected; throws descriptive error. Requires separate solver (browser automation). |
| **Hard block page** ("Pardon Our Interruption") | Detected; throws descriptive error. IP-level block — cannot be solved programmatically. |
| **No Imperva challenge** | Detected (`none`); warning issued; solver exits gracefully. |
| **Unknown SWJIYLWA token** | All known tokens exhausted → descriptive error with manual discovery instructions. |

---

## Architecture Notes

- The `KNOWN_SWJIYLWA_TOKENS` array in `session.js` can be extended with additional discovered tokens for new Imperva clusters.
- Site ID is parsed dynamically from `Set-Cookie` headers — no hardcoding.
- `ns` values tried: `1, 2, 3, 8` (covers all known Imperva deployment variants).
- `cb` (cache-buster) is always a fresh random integer per request.
- The `detectChallengeType()` and `parseSiteId()` functions are exported for use in higher-level scripts.
