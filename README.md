# imperva-solver

A Node.js toolkit for working with Imperva/Incapsula bot protection on web targets. No browser required for either challenge type.

## Table of Contents

- [How It Works](#how-it-works)
- [Components](#components)
- [Setup](#setup)
- [Usage](#usage)
  - [Solve a utmvc Challenge](#solve-a-utmvc-challenge)
  - [Solve a reese84 Challenge](#solve-a-reese84-challenge)
  - [Make an API Call](#make-an-api-call)
- [Flags](#flags)
- [Technical Details](#technical-details)
  - [Challenge Type Detection](#challenge-type-detection)
  - [utmvc — Legacy Incapsula](#utmvc--legacy-incapsula)
  - [reese84 — Imperva ABP](#reese84--imperva-abp)
  - [reese84 Sensor POST Structure](#reese84-sensor-post-structure)
  - [SWJIYLWA Token Discovery](#swjiylwa-token-discovery)
- [Tested Sites](#tested-sites)
- [Contact](#contact)

## How It Works

Imperva/Incapsula runs a JavaScript challenge on protected pages. The result is stored in the `___utmvc` cookie (legacy) or the `reese84` cookie (modern ABP). Subsequent requests need these cookies alongside Imperva's session tracking cookies (`visid_incap_*`, `nlbi_*`, `incap_ses_*`) to pass.

Both challenge types are solved natively in Node.js — no Chromium, no Playwright, no WebAssembly execution.

```
target page --> challenge type detection --> solver --> valid cookies --> API calls
```

**utmvc:** Challenge script is fetched from `/_Incapsula_Resource?SWJIYLWA=<token>`, executed in a Node.js `vm` sandbox with browser API stubs, and the resulting `___utmvc` cookie is extracted directly.

**reese84:** The sensor endpoint accepts a minimal POST body and issues a token without validating the WebAssembly Proof-of-Work in degraded mode. No fingerprinting, no WASM execution needed.

## Components

**src/session.js** — Fetches the target page, parses Imperva session cookies, detects challenge type (`utmvc`, `reese84`, `block`, or `none`), and discovers the challenge script URL dynamically.

**src/generator.js** — Runs the utmvc challenge script in an isolated Node.js `vm` context with 60+ browser API stubs. Extracts the `___utmvc` value from `document.cookie` after execution.

**src/stubs.js** — Browser environment stubs injected before challenge script execution. Covers navigator, screen, window dimensions, 20+ bot detection globals, Chrome object, anti-debug bypass, and Node.js self-detection shimming.

**src/reese84.js** — Fetches session cookies, locates the sensor endpoint, and POSTs the minimal body to obtain a `reese84` token. Pure Node.js `https` module — no dependencies beyond what's in the repo.

**src/caller.js** — Makes authenticated HTTP requests to protected endpoints using the full resolved cookie set.

**main.js** — CLI entrypoint. Auto-detects challenge type and routes to the correct solver.

## Setup

Requirements: Node.js 18+.

```bash
npm install
```

No browser install. No Chromium binary. One dependency: `isolated-vm` (used for utmvc sandbox).

## Usage

### Solve a utmvc Challenge

```bash
node main.js --target https://www.corteva.com --json
```

Output:
```json
{
  "___utmvc": "dW5kZWZpbmVkLHVuZGVmaW5lZCwx...",
  "visid_incap_3175930": "...",
  "incap_ses_524_3175930": "..."
}
```

### Solve a reese84 Challenge

```bash
node main.js --target https://www.cox.com --json
```

Output:
```json
{
  "reese84": "3:1KF8zdGE...",
  "visid_incap_1334424": "...",
  "incap_ses_540_1334424": "..."
}
```

### Make an API Call

```bash
node main.js --target https://www.cox.com --call https://www.cox.com/residential/internet.html
```

Output:
```
HTTP 200

<!DOCTYPE html>...
```

Add `--json` for structured cookie output instead of response body. Add `--out <file>` to write response to disk.

## Flags

```
--target <url>   Target URL to solve the challenge against (required)
--call <url>     URL to request after solving (defaults to --target if omitted)
--out <file>     Write response body to file
--json           Print cookie state as JSON instead of response body
--help           Show usage
```

## Technical Details

### Challenge Type Detection

On the first GET to the target, `session.js` inspects the response cookies and HTML body:

| Signal | Challenge type |
|--------|---------------|
| `___utmvc` cookie or `SWJIYLWA` in HTML | `utmvc` |
| `reese84` cookie or random-path script from `server: bon` | `reese84` |
| "Pardon Our Interruption" in body | `block` |
| `visid_incap_*` present, no challenge script | `none` (session already valid) |

The site ID is parsed dynamically from cookie names (`visid_incap_<ID>`) — no hardcoded values.

### utmvc — Legacy Incapsula

The `___utmvc` cookie is written entirely client-side by the Imperva challenge script. No server validation of the cookie value occurs — the script computes a fingerprint, RC4+XOR encodes it, and sets the cookie directly via `document.cookie`.

The cookie expires after 20 seconds. After that, the challenge script must be re-executed to get a fresh value. For long-running sessions, re-call the solver before expiry.

**What the challenge script collects (~63 fields):**
- Navigator properties (UA, platform, language, plugins, hardwareConcurrency, vendor)
- Screen dimensions and window size
- Bot detection globals: `_phantom`, `__nightmare`, `domAutomation`, `_Selenium_IDE_Recorder`, Node.js env (`process.versions`, `global.Buffer`)
- `eval.toString().length` — JavaScript engine fingerprinting
- WebGL support flags

The stubs in `src/stubs.js` cover all of these. The challenge script runs cleanly in isolated-vm with no errors on the first attempt.

### reese84 — Imperva ABP

reese84 is Imperva's modern Advanced Bot Protection challenge. It uses a large (~292KB) obfuscated script served from a random path per site (e.g. `/orgone-Obed-abhorrow-That-Safe-Yong-abroach-it-p`). Unlike utmvc, it requires a server round-trip: the script POSTs fingerprint data to the sensor endpoint (same URL as the script), and the server returns a signed token.

The script embeds a WebAssembly Proof-of-Work system with two PoW modes:

- **SHA-1 partial preimage:** Given a challenge `{s, d}`, brute-force a 32-bit nonce such that SHA1 output == 0.
- **BBS discrete log:** Given `{i, a, m}`, find `x` such that `x² ≡ a (mod m)`.

Six WASM modules are included for post-solve hash verification. Three are functional (one returns `2*x`, two return constants); three are intentional broken decoys to complicate reverse engineering.

However, none of this needs to be implemented. The sensor endpoint operates in a degraded validation mode — it accepts `solution.interrogation=null` and returns a valid token without checking the PoW result.

### reese84 Sensor POST Structure

```
POST /<random-sensor-path>?d=<hostname>
Content-Type: text/plain; charset=utf-8   (disguised — body is JSON)
Accept: application/json; charset=utf-8
```

**Minimal working body (84 bytes):**
```json
{"solution":{"interrogation":null},"old_token":null,"error":null,"performance":null}
```

**Response:**
```json
{"token":"3:...","renewInSec":816,"cookieDomain":".cox.com","serverTimestamp":1234567890}
```

What causes HTTP 400: `solution: null`, `solution: {}` (empty object without the `interrogation` key), missing `solution` wrapper entirely.

Token lifetime is set by `renewInSec` (typically 710–896 seconds). Use `old_token` with the previous token value to renew without a new session cookie GET.

### SWJIYLWA Token Discovery

The `SWJIYLWA` token identifies the Imperva account and appears in the challenge script URL. It's present in the page HTML as a `<script src="/_Incapsula_Resource?SWJIYLWA=...">` tag when the challenge is active.

The same token (`719d34d31c8e3a6e6fffd425f7e032f3`) appears across sites on the same Imperva infrastructure cluster regardless of domain — it's per-account, not per-site. The `cb=` query parameter is a random nonce regenerated on each script fetch.

`session.js` scans HTML for the token across all redirect steps. If not found, it probes `/_Incapsula_Resource` with known tokens. For sites where it can't be discovered automatically, the endpoint table in `session.js` can be extended with known values.

## Tested Sites

| Site | Challenge | Result |
|------|-----------|--------|
| corteva.com | `utmvc` | ✅ HTTP 200 |
| pioneer.com | `utmvc` | ✅ HTTP 200 |
| aetna.com | `utmvc` | ✅ HTTP 200 |
| salliemae.com | `utmvc` | ✅ HTTP 200 |
| experian.com | `utmvc` | ✅ HTTP 200 |
| prudential.com | `utmvc` | ✅ HTTP 200 |
| hertz.com | `utmvc` | ✅ HTTP 200 |
| landolakesinc.com | `utmvc` | ✅ HTTP 200 |
| cox.com | `reese84` | ✅ HTTP 200 |

## Contact

For questions, reach out via GitHub issues.
