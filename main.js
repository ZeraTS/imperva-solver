#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { initSession, detectChallengeType } = require('./src/session');
const { generateCookie } = require('./src/generator');
const { call } = require('./src/caller');
const { solveReese84 } = require('./src/reese84');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target') args.target = argv[++i];
    else if (argv[i] === '--call') args.call = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.error([
        'Usage: node main.js --target <url> [options]',
        '',
        'Options:',
        '  --target <url>   Target Imperva-protected URL (required)',
        '  --call <url>     URL to request after solving (default: same as --target)',
        '  --out <file>     Save response body to file',
        '  --json           Output solved cookies as JSON to stdout',
        '',
        'Supports:',
        '  utmvc  — legacy Incapsula ___utmvc cookie challenge',
        '  reese84 — modern Imperva BON reese84 token challenge (pure Node.js, no browser)',
      ].join('\n'));
      process.exit(0);
    }
  }
  return args;
}

// ─────────────────────────────────────────────
//  reese84 path
// ─────────────────────────────────────────────
async function handleReese84(args) {
  console.error('[*] Challenge type: reese84 — pure Node.js minimal sensor POST');

  const { token, cookies, cookieHeader } = await solveReese84(args.target, { verbose: true });

  // cookies is a plain object {name: value, ...}
  const cookieMap = cookies;

  console.error(`[*] reese84 token: ${token.slice(0, 60)}...`);
  console.error(`[*] Session cookies: ${Object.keys(cookieMap).join(', ')}`);

  if (args.json) {
    console.log(JSON.stringify({
      reese84: token,
      ...cookieMap
    }, null, 2));
    return;
  }

  const callUrl = args.call || args.target;
  console.error(`[*] Making request to ${callUrl}`);

  const response = await call(callUrl, { Cookie: cookieHeader });
  console.error(`[*] HTTP ${response.status}`);

  const body = response.body;
  if (args.out) {
    fs.writeFileSync(args.out, body);
    console.error(`[*] Body saved to ${args.out}`);
  } else {
    console.log(body);
  }
}

// ─────────────────────────────────────────────
//  utmvc path
// ─────────────────────────────────────────────
async function handleUtmvc(args, sessionData) {
  const { cookies: sessionCookies, scriptPath, allCookies, siteId, challengeType } = sessionData;

  if (siteId) {
    console.error(`[*] Imperva site ID: ${siteId}`);
  }
  console.error(`[*] Challenge type: ${challengeType}`);

  const cookieNames = Object.keys(sessionCookies);
  if (cookieNames.length === 0) {
    console.error('[!] Warning: no incap_ses_*/visid_incap_*/nlbi_* cookies received — challenge may fail');
  } else {
    console.error(`[*] Got session cookies: ${cookieNames.join(', ')}`);
  }

  console.error(`[*] Running challenge script: ${scriptPath}`);
  const utmvc = await generateCookie(scriptPath, args.target, sessionCookies);
  console.error(`[*] Generated ___utmvc: ${utmvc.substring(0, 40)}...`);

  const allRequestCookies = { ...allCookies, '___utmvc': utmvc };

  if (args.json) {
    console.log(JSON.stringify({
      ___utmvc: utmvc,
      ...allRequestCookies
    }, null, 2));
    return;
  }

  const callUrl = args.call || args.target;
  console.error(`[*] Making request to ${callUrl}`);
  const response = await call(callUrl, allRequestCookies);
  console.error(`[*] HTTP ${response.status}`);

  const body = response.body;
  if (args.out) {
    fs.writeFileSync(args.out, body);
    console.error(`[*] Body saved to ${args.out}`);
  } else {
    console.log(body);
  }
}

// ─────────────────────────────────────────────
//  main
// ─────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  if (!args.target) {
    console.error('Usage: node main.js --target <url> [--call <url>] [--out <file>] [--json]');
    process.exit(1);
  }

  // Quick reese84 detection: fetch the page and check for reese84 indicators
  // before doing the full initSession (which would throw on reese84)
  console.error(`[*] Detecting challenge type for ${args.target}`);

  let challengeType;
  let sessionData;

  try {
    const outputDir = path.join(__dirname, '.cache');
    console.error(`[*] Fetching session cookies from ${args.target}`);
    sessionData = await initSession(args.target, outputDir);
    challengeType = sessionData.challengeType;
  } catch (err) {
    // initSession throws on reese84 — catch it and route accordingly
    if (err.message && err.message.includes('reese84')) {
      challengeType = 'reese84';
    } else {
      throw err;
    }
  }

  if (challengeType === 'reese84') {
    await handleReese84(args);
  } else {
    // utmvc or 'none' — fall through to utmvc solver
    await handleUtmvc(args, sessionData);
  }
}

main().catch((err) => {
  console.error(`[!] Error: ${err.message}`);
  process.exit(1);
});
