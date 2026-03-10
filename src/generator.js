'use strict';

const ivm = require('isolated-vm');
const fs = require('fs');
const { injectStubs, injectCookies } = require('./stubs');

async function generateCookie(scriptPath, targetUrl, sessionCookies) {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = await isolate.createContext();

  try {
    injectStubs(context, targetUrl);

    // seed the session cookies so the digest binds to this session
    if (sessionCookies) {
      injectCookies(context, sessionCookies);
    }

    const challengeScript = fs.readFileSync(scriptPath, 'utf8');

    try {
      await context.eval(challengeScript, { timeout: 10000 });
    } catch (e) {
      // script errors are common (image src setting, etc.) — keep going
      // what matters is whether ___utmvc got written before the throw
    }

    // flush any queued timers (anti-debug timer lives here)
    try {
      await context.eval('_runTimers();');
    } catch (e) {}

    const cookieStore = await context.eval('_cookieStore');
    const match = (cookieStore || '').match(/___utmvc=([^;]+)/);

    if (!match) {
      throw new Error(`___utmvc not found in cookie store. Store: ${cookieStore}`);
    }

    return match[1];
  } finally {
    isolate.dispose();
  }
}

module.exports = { generateCookie };
