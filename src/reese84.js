'use strict';

/**
 * reese84.js — Imperva reese84 token solver (pure Node.js)
 *
 * Finding: Imperva ABP server accepts solution.interrogation=null — degraded
 * mode issues tokens without validating Proof-of-Work. A minimal 84-byte POST
 * body is sufficient to obtain a valid reese84 token. No WASM execution, no
 * browser fingerprinting, no Playwright required.
 *
 * Winning POST body:
 *   {"solution":{"interrogation":null},"old_token":null,"error":null,"performance":null}
 *
 * Returns: {"token":"3:...","renewInSec":710,"cookieDomain":"cox.com"}
 *
 * Live-tested 2026-03-20: cox.com → HTTP 200, renewInSec: 703, token: 3:EhB/s+cux3nc...
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Known sensor endpoint fallback table (per hostname)
const ENDPOINTS = {
  'www.cox.com': '/orgone-Obed-abhorrow-That-Safe-Yong-abroach-it-p'
};

// Patterns for finding reese84 sensor script tag in page HTML.
// Imperva injects a <script src="/long-hyphenated-path"></script> with no other attributes.
const SENSOR_PATTERNS = [
  // Classic pattern: script with long hyphenated path, no other attrs
  /src=["'](\/[a-zA-Z0-9][a-zA-Z0-9_-]{15,80})["'][^>]*><\/script>/g,
  // Alternate: async/defer script with long path
  /src=["'](\/[a-zA-Z0-9][a-zA-Z0-9_-]{15,80})["'][^>]*(async|defer)[^>]*>/g,
  // Fallback: any long path starting with /word-word-word pattern
  /src=["'](\/[a-z][a-z0-9]+-[a-z][a-z0-9]+-[a-z][a-z0-9]+(?:-[a-z][a-z0-9]+){3,})["']/g
];

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an HTTPS/HTTP request and return { status, headers, body }.
 */
function request(opts, body) {
  const mod = (opts.port === 80 || opts.protocol === 'http:') ? http : https;
  return new Promise((resolve, reject) => {
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Fetch the homepage HTML and extract the reese84 sensor script path.
 * Falls back to ENDPOINTS table if no match found.
 */
async function getSensorPath(hostname, cookieStr) {
  let html = '';
  try {
    const res = await request({
      hostname,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookieStr || ''
      }
    });
    html = res.body;
  } catch (_) {
    return ENDPOINTS[hostname] || null;
  }

  // Try each pattern, collect all candidates, pick the longest (most likely sensor path)
  const candidates = new Set();
  for (const pattern of SENSOR_PATTERNS) {
    let m;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(html)) !== null) {
      const p = m[1];
      // Exclude obvious static assets (js/css/img extensions, short paths, known CDNs)
      if (/\.(js|css|png|jpg|gif|svg|ico|woff|ttf)$/i.test(p)) continue;
      if (p.length < 20) continue;
      candidates.add(p);
    }
  }

  if (candidates.size > 0) {
    // Pick the longest candidate (sensor paths tend to be long compound words)
    const sorted = [...candidates].sort((a, b) => b.length - a.length);
    return sorted[0];
  }

  return ENDPOINTS[hostname] || null;
}

/**
 * GET the target homepage to collect Imperva session cookies
 * (visid_incap_*, nlbi_*, incap_ses_*).
 */
async function getSessionCookies(hostname) {
  try {
    const res = await request({
      hostname,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    const cookies = {};
    (res.headers['set-cookie'] || []).forEach(c => {
      const [kv] = c.split(';');
      const eq = kv.indexOf('=');
      if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
    });
    return cookies;
  } catch (_) {
    return {};
  }
}

/**
 * Build the minimal sensor POST body.
 * The server accepts interrogation=null and issues a token in degraded mode.
 */
function buildSensorBody(oldToken) {
  return JSON.stringify({
    solution: { interrogation: null },
    old_token: oldToken || null,
    error: null,
    performance: null
  });
}

/**
 * POST the sensor body to the sensor endpoint with retry on 403/429.
 * @param {string} hostname
 * @param {string} sensorPath
 * @param {string} cookieStr
 * @param {string} body
 * @param {number} [retries=1]
 */
async function postSensor(hostname, sensorPath, cookieStr, body, retries) {
  retries = (retries === undefined) ? 1 : retries;

  const doPost = () => request({
    hostname,
    path: sensorPath + '?d=' + hostname,
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json; charset=utf-8',
      'Content-Type': 'text/plain; charset=utf-8',
      'Referer': 'https://' + hostname + '/',
      'Origin': 'https://' + hostname,
      'Cookie': cookieStr || '',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  let res = await doPost();

  // Retry once on 403/429 after 2s delay
  if ((res.status === 403 || res.status === 429) && retries > 0) {
    await sleep(2000);
    res = await postSensor(hostname, sensorPath, cookieStr, body, retries - 1);
  }

  return res;
}

/**
 * Solve the reese84 challenge for a target URL.
 *
 * @param {string} targetUrl - The URL of the Imperva-protected page
 * @param {object} [opts]
 * @param {boolean} [opts.verbose] - Log debug info to stderr
 * @param {string} [opts.oldToken] - Previous reese84 token to renew
 * @returns {Promise<{token: string, renewInSec: number, cookieDomain: string, cookies: object, cookieHeader: string}>}
 */
async function solveReese84(targetUrl, opts) {
  opts = opts || {};
  const verbose = !!opts.verbose;
  const log = verbose
    ? (msg) => process.stderr.write('[reese84] ' + msg + '\n')
    : () => {};

  const url = new URL(targetUrl);
  const hostname = url.hostname;

  log('Fetching session cookies for: ' + hostname);
  const sessionCookies = await getSessionCookies(hostname);
  const cookieStr = Object.entries(sessionCookies).map(([k, v]) => `${k}=${v}`).join('; ');
  log('Session cookies: ' + (Object.keys(sessionCookies).join(', ') || '(none)'));

  log('Locating sensor endpoint...');
  const sensorPath = await getSensorPath(hostname, cookieStr);
  if (!sensorPath) throw new Error('Could not find reese84 sensor path for ' + hostname);
  log('Sensor path: ' + sensorPath);

  // POST minimal sensor body — server issues token regardless of interrogation contents
  const body = buildSensorBody(opts.oldToken || null);
  log('POSTing ' + Buffer.byteLength(body) + '-byte sensor body...');
  const res = await postSensor(hostname, sensorPath, cookieStr, body);

  if (res.status !== 200) {
    throw new Error('Sensor POST failed: HTTP ' + res.status + ' — ' + res.body.slice(0, 200));
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (e) {
    throw new Error('Invalid sensor response (not JSON): ' + res.body.slice(0, 200));
  }

  if (!parsed.token) throw new Error('No token in response: ' + res.body.slice(0, 200));

  log('Token obtained: ' + parsed.token.slice(0, 40) + '... (renewInSec: ' + parsed.renewInSec + ')');

  // Merge token into cookies
  const allCookies = {
    ...sessionCookies,
    reese84: parsed.token
  };

  return {
    token: parsed.token,
    renewInSec: parsed.renewInSec,
    cookieDomain: parsed.cookieDomain,
    cookies: allCookies,
    cookieHeader: Object.entries(allCookies).map(([k, v]) => `${k}=${v}`).join('; ')
  };
}

module.exports = { solveReese84, getSensorPath, getSessionCookies, postSensor, buildSensorBody };
