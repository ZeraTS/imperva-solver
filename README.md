# imperva-solver

Imperva/Incapsula challenge solver supporting both legacy `___utmvc` and modern `reese84` bot protection.

**100% pure Node.js — no browser, no Playwright, no WebAssembly execution required.**

## Supported Challenge Types

| Challenge | Cookie | Sites |
|-----------|--------|-------|
| `utmvc` | `___utmvc` | Legacy Incapsula (Corteva, Pioneer, Aetna, etc.) |
| `reese84` | `reese84` | Modern Imperva BON (Cox, etc.) |

## Install

```bash
npm install
```

No browser install needed. Both challenge types run natively in Node.js.

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

### reese84 (modern) — pure Node.js, no browser
1. GET the target homepage to collect Imperva session cookies (`visid_incap_*`, `nlbi_*`, `incap_ses_*`)
2. Locate the sensor script path from page HTML (or use known endpoint table)
3. POST a minimal sensor body — **the server accepts `solution.interrogation=null` and issues a token in degraded mode without validating Proof-of-Work**
4. Return `reese84` token + all session cookies

**reese84 tokens are obtained via a minimal sensor POST — no WebAssembly execution, no browser fingerprinting required.**

#### Winning POST body (84 bytes):
```json
{"solution":{"interrogation":null},"old_token":null,"error":null,"performance":null}
```

Response: `{"token":"3:...","renewInSec":710,"cookieDomain":"cox.com"}`

## Architecture

```
src/
  session.js    — page fetch, challenge detection, SWJIYLWA discovery
  generator.js  — utmvc cookie generation (vm sandbox)
  reese84.js    — reese84 token solver (pure Node.js https, no browser)
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
