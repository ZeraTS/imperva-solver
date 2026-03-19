# imperva-solver

Imperva/Incapsula challenge solver supporting both legacy `___utmvc` and modern `reese84` bot protection.

## Supported Challenge Types

| Challenge | Cookie | Sites |
|-----------|--------|-------|
| `utmvc` | `___utmvc` | Legacy Incapsula (Corteva, Pioneer, Aetna, etc.) |
| `reese84` | `reese84` | Modern Imperva BON (Cox, etc.) |

## Install

```bash
npm install
npx playwright install chromium  # required for reese84
```

## Usage

```bash
# Solve utmvc challenge (legacy Incapsula)
node main.js --target https://www.corteva.com --json

# Solve reese84 challenge (modern Imperva)
node main.js --target https://www.cox.com --json

# Make a request after solving
node main.js --target https://www.corteva.com --call https://www.corteva.com/some/page
```

## How It Works

### utmvc (legacy)
1. Fetch the target page to get Imperva session cookies
2. Locate the `SWJIYLWA` token in HTML (or try known tokens)
3. Fetch the challenge script from `/_Incapsula_Resource?SWJIYLWA=<token>`
4. Run the challenge script in Node.js `vm` sandbox
5. Return generated `___utmvc` cookie + session cookies

### reese84 (modern)
1. Launch headless Chromium via Playwright
2. Navigate to the target URL
3. Imperva's sensor script runs natively, collects fingerprint + solves WASM PoW
4. Intercept the POST response to capture the returned token
5. Return `reese84` token + all session cookies

## Architecture

```
src/
  session.js    — page fetch, challenge detection, SWJIYLWA discovery
  generator.js  — utmvc cookie generation (vm sandbox)
  reese84.js    — reese84 token solver (Playwright)
  caller.js     — HTTP client for post-solve requests
  stubs.js      — browser stubs for vm sandbox
main.js         — CLI entrypoint, challenge routing
```

## Output (--json)

```json
{
  "reese84": "<token>",
  "visid_incap_1334424": "...",
  "incap_ses_540_1334424": "..."
}
```
