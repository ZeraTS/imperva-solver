'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// follows redirects, returns { body, headers, statusCode }
// collectRedirectBodies: if true, return bodies from ALL steps (for SWJIYLWA hunting)
// maxHops: maximum number of redirects to follow before throwing
function get(urlStr, headers, collectRedirectBodies, maxHops = 10) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      }
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).toString();

          // SSRF protection: validate redirect destination
          const nextUrl = new URL(next);
          if (nextUrl.protocol !== 'https:') {
            return reject(new Error('SSRF protection: redirect must use https, got: ' + nextUrl.protocol));
          }
          const h = nextUrl.hostname;
          if (
            h === '127.0.0.1' ||
            h === 'localhost' ||
            /^10\./.test(h) ||
            /^192\.168\./.test(h) ||
            /^169\.254\./.test(h)
          ) {
            return reject(new Error('SSRF protection: redirect to private/internal host blocked: ' + h));
          }

          // Hop limit check
          if (maxHops <= 0) {
            return reject(new Error('Too many redirects (maxHops exceeded)'));
          }

          if (collectRedirectBodies) {
            // include bodies from intermediate redirects (for SWJIYLWA discovery)
            return get(next, headers, true, maxHops - 1).then((result) => {
              resolve({
                body: result.body,
                headers: result.headers,
                statusCode: result.statusCode,
                allBodies: [body, ...(result.allBodies || [result.body])]
              });
            }).catch(reject);
          }
          return get(next, headers, false, maxHops - 1).then(resolve).catch(reject);
        }
        resolve({ body, headers: res.headers, statusCode: res.statusCode });
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function parseCookies(setCookieHeaders) {
  const cookies = {};
  if (!setCookieHeaders) return cookies;
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const header of list) {
    const nameVal = header.split(';')[0].trim();
    const eq = nameVal.indexOf('=');
    if (eq > 0) {
      cookies[nameVal.slice(0, eq).trim()] = nameVal.slice(eq + 1).trim();
    }
  }
  return cookies;
}

// Parse the Imperva site ID from Set-Cookie headers dynamically
// cookie names look like: visid_incap_3175930, nlbi_3175930, incap_ses_524_3175930
function parseSiteId(setCookieHeaders) {
  if (!setCookieHeaders) return null;
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const header of list) {
    const match = header.match(/(?:visid_incap|nlbi)_(\d+)/);
    if (match) return match[1];
  }
  return null;
}

// find SWJIYLWA token in page HTML — it's in the challenge script src attribute
// Imperva injects: <script src="/_Incapsula_Resource?SWJIYLWA=<token>&ns=N&cb=RANDOM">
function extractSwjiylwaToken(html) {
  if (!html) return null;
  const match = html.match(/SWJIYLWA=([a-f0-9]{32})/);
  return match ? match[1] : null;
}

// Detect which Imperva challenge type the site is presenting
// - 'utmvc': legacy Incapsula — challenge script at /_Incapsula_Resource?SWJIYLWA=..., result cookie is ___utmvc
// - 'reese84': modern Imperva — challenge script at random path, uses reese84 token
// - 'block': hard block page ("Pardon Our Interruption" / "Access Denied")
// - 'none': site has Imperva but no challenge currently active (or not Imperva at all)
function detectChallengeType(html, cookies) {
  if (!html) html = '';
  if (!cookies) cookies = {};

  // Modern reese84 challenge — check FIRST before block detection.
  // The reese84 page injects a <script src="/<word-salad-slug>"> tag for the sensor.
  // The page may also contain an iframe with "Request unsuccessful" — that's the
  // Imperva challenge iframe, not a hard block, so we must not misclassify it.
  if (cookies.reese84 || html.includes('reese84')) {
    return 'reese84';
  }

  // Detect reese84 by the script tag pattern: a long hyphen-separated word slug
  // that is NOT the /_Incapsula_Resource path.
  // Pattern: <script src="/word-word-word-...-word-p"> (3+ hyphenated segments, ends with letter)
  if (/src="\/[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+"/.test(html)) {
    return 'reese84';
  }

  // Hard block — cannot proceed (only after reese84 check)
  if (
    html.includes('Pardon Our Interruption') ||
    (html.includes('Request unsuccessful') && !html.includes('reese84') && !/src="\/[a-zA-Z]+-[a-zA-Z]+-[a-zA-Z]+/.test(html)) ||
    html.includes('Incapsula incident ID')
  ) {
    return 'block';
  }

  // Legacy utmvc challenge — SWJIYLWA in HTML or ___utmvc cookie set
  if (
    html.includes('SWJIYLWA') ||
    html.includes('_Incapsula_Resource') ||
    cookies.___utmvc !== undefined
  ) {
    return 'utmvc';
  }

  // Imperva session cookies present but no active challenge visible
  if (
    cookies.visid_incap ||
    Object.keys(cookies).some((k) => k.startsWith('visid_incap'))
  ) {
    return 'utmvc'; // default for Incapsula-session sites (try utmvc path)
  }

  return 'none';
}

// Attempt to fetch the Imperva challenge script
// Tries ns=1,2,3,8 in sequence; returns the first script body > 1000 bytes
async function fetchChallengeScript(baseUrl, token, cookieHeader) {
  const origin = new URL(baseUrl).origin;
  const nsValues = [1, 2, 3, 8];

  for (const ns of nsValues) {
    const cb = Math.floor(Math.random() * 2000000000);
    const scriptUrl = `${origin}/_Incapsula_Resource?SWJIYLWA=${token}&ns=${ns}&cb=${cb}`;

    try {
      const res = await get(scriptUrl, {
        'Cookie': cookieHeader,
        'Referer': baseUrl
      });

      if (res.statusCode === 200 && res.body && res.body.length > 1000) {
        return { body: res.body, ns, cb };
      }
    } catch (e) {
      // try next ns
    }
  }

  return null;
}

// Known SWJIYLWA tokens that work across many Imperva deployments.
// The token is tied to the Imperva account/cluster, not individual sites.
// 719d34d31c8e3a6e6fffd425f7e032f3 has been confirmed working on:
//   corteva.com, pioneer.com, landolakesinc.com, aetna.com, and others.
const KNOWN_SWJIYLWA_TOKENS = [
  '719d34d31c8e3a6e6fffd425f7e032f3'
];

async function initSession(targetUrl, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Fetch the target URL, collecting bodies from all redirect steps
  const res = await get(targetUrl, {}, true);
  const cookies = parseCookies(res.headers['set-cookie']);

  // Parse site ID dynamically from Set-Cookie headers
  const siteId = parseSiteId(res.headers['set-cookie']);
  if (siteId) {
    process.stderr.write(`[*] Detected Imperva site ID: ${siteId}\n`);
  }

  // session cookies imperva needs to bind the challenge to this visitor
  const sessionCookies = {};
  for (const [name, value] of Object.entries(cookies)) {
    if (/^(visid_incap_|nlbi_|incap_ses_)/.test(name)) {
      sessionCookies[name] = value;
    }
  }

  // Determine challenge type from HTML + cookies
  const challengeType = detectChallengeType(res.body, cookies);
  process.stderr.write(`[*] Challenge type detected: ${challengeType}\n`);

  if (challengeType === 'block') {
    throw new Error('Site returned a hard block page — IP or session is blocked. Try a different IP.');
  }

  if (challengeType === 'reese84') {
    // Return early — main.js will route to the Playwright-based reese84 solver
    return { cookies: sessionCookies, scriptPath: null, allCookies: cookies, siteId, challengeType };
  }

  if (challengeType === 'none') {
    process.stderr.write('[!] Warning: no Imperva challenge detected — site may not require solving, or it uses an unknown challenge type\n');
  }

  // Step 2: Discover the SWJIYLWA token
  // First look in the HTML from all redirect steps
  let token = null;

  // Search the final body
  token = extractSwjiylwaToken(res.body);

  // Search intermediate redirect bodies too
  if (!token && res.allBodies) {
    for (const body of res.allBodies) {
      token = extractSwjiylwaToken(body);
      if (token) {
        process.stderr.write(`[*] Found SWJIYLWA token in redirect chain body: ${token}\n`);
        break;
      }
    }
  }

  if (token) {
    process.stderr.write(`[*] Found SWJIYLWA token in HTML: ${token}\n`);
  }

  // Step 3: If no token in HTML, try known tokens against the /_Incapsula_Resource endpoint
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

  if (!token) {
    process.stderr.write('[*] SWJIYLWA not in HTML — trying known tokens against /_Incapsula_Resource...\n');

    for (const candidate of KNOWN_SWJIYLWA_TOKENS) {
      const result = await fetchChallengeScript(targetUrl, candidate, cookieHeader);
      if (result) {
        token = candidate;
        process.stderr.write(`[*] Token ${candidate} verified (ns=${result.ns}, script size=${result.body.length})\n`);

        // Save and return directly since we already have the script
        const scriptPath = path.join(outputDir, 'challenge-script.js');
        fs.writeFileSync(scriptPath, result.body);
        return { cookies: sessionCookies, scriptPath, allCookies: cookies, siteId, challengeType };
      }
    }

    // Last resort: fail with a clear message
    throw new Error(
      `SWJIYLWA token not found in HTML for ${new URL(targetUrl).hostname} ` +
      `and no known token worked. ` +
      `To find the token manually: open the site in Chrome DevTools → Network → look for ` +
      `/_Incapsula_Resource?SWJIYLWA=<token> requests.`
    );
  }

  // Step 4: Fetch the challenge script using the discovered token
  const scriptResult = await fetchChallengeScript(targetUrl, token, cookieHeader);
  if (!scriptResult) {
    throw new Error(`Challenge script fetch failed for token ${token} — tried ns=1,2,3,8, all returned empty or errored`);
  }

  const scriptPath = path.join(outputDir, 'challenge-script.js');
  fs.writeFileSync(scriptPath, scriptResult.body);

  process.stderr.write(`[*] Challenge script saved (${scriptResult.body.length} bytes, ns=${scriptResult.ns})\n`);

  return { cookies: sessionCookies, scriptPath, allCookies: cookies, siteId, challengeType };
}

module.exports = { initSession, detectChallengeType, parseSiteId, extractSwjiylwaToken };
