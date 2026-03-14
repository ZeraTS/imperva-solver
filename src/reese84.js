'use strict';

/**
 * reese84.js — Imperva reese84 token solver
 *
 * Uses Playwright headless Chromium to execute the Imperva sensor script in a
 * real browser environment, intercept the POST to the sensor endpoint, and
 * capture the returned reese84 token + all session cookies.
 *
 * Supports any site using the modern Imperva/BON reese84 challenge.
 */

const { chromium } = require('playwright');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 30000;
const TOKEN_WAIT_MS = 20000;

/**
 * Solve the reese84 challenge for a target URL.
 *
 * @param {string} targetUrl - The URL of the Imperva-protected page
 * @param {object} [opts]
 * @param {number} [opts.timeout] - Total timeout in ms (default: 30000)
 * @param {boolean} [opts.verbose] - Log debug info to stderr
 * @returns {Promise<{token: string, cookies: Array, cookieHeader: string}>}
 */
async function solveReese84(targetUrl, opts) {
  opts = opts || {};
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  const verbose = !!opts.verbose;

  const log = verbose
    ? (msg) => process.stderr.write('[reese84] ' + msg + '\n')
    : () => {};

  const parsed = new URL(targetUrl);
  const hostname = parsed.hostname;

  log('Launching browser for: ' + targetUrl);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  let token = null;
  let allCookies = [];

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    // Intercept the reese84 sensor POST to capture token from response
    await context.route('**/*', async (route) => {
      const req = route.request();
      const url = req.url();

      // Identify the sensor POST by method + ?d= query param
      if (req.method() === 'POST' && url.includes('?d=')) {
        log('Sensor POST intercepted: ' + url.slice(0, 80));
        try {
          const resp = await route.fetch();
          let body = null;
          try {
            body = await resp.json();
          } catch (_) {
            // non-JSON response (e.g. 400 error)
          }
          if (body && body.token) {
            token = body.token;
            log('Token captured from POST response: ' + token.slice(0, 40) + '...');
          }
          await route.fulfill({ response: resp });
        } catch (e) {
          log('Route intercept error: ' + e.message);
          await route.continue();
        }
        return;
      }

      await route.continue();
    });

    const page = await context.newPage();

    log('Navigating to: ' + targetUrl);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeout
    });

    // Wait for token to appear — either from POST intercept or reese84 cookie
    const deadline = Date.now() + TOKEN_WAIT_MS;
    while (!token && Date.now() < deadline) {
      await page.waitForTimeout(400);

      // Check if reese84 cookie was set by the script
      const cookies = await context.cookies();
      const reese84Cookie = cookies.find((c) => c.name === 'reese84');
      if (reese84Cookie && reese84Cookie.value) {
        token = reese84Cookie.value;
        log('Token from cookie: ' + token.slice(0, 40) + '...');
        break;
      }
    }

    allCookies = await context.cookies();
  } finally {
    await browser.close();
  }

  if (!token) {
    throw new Error(
      'reese84 token not obtained for ' + hostname + ' within ' + TOKEN_WAIT_MS + 'ms. ' +
      'Site may not use reese84, or the challenge changed.'
    );
  }

  // Build a cookie header string from all captured cookies (domain-filtered)
  const cookieHeader = allCookies
    .filter((c) => hostname.endsWith(c.domain.replace(/^\./, '')))
    .map((c) => c.name + '=' + c.value)
    .join('; ');

  log('Done. ' + allCookies.length + ' cookies captured.');

  return {
    token,
    cookies: allCookies,
    cookieHeader
  };
}

module.exports = { solveReese84 };
