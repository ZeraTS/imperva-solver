'use strict';

const ivm = require('isolated-vm');
const fs = require('fs');

const isolate = new ivm.Isolate({ memoryLimit: 128 });
const context = isolate.createContextSync();
const jail = context.global;

// Set up browser environment
jail.setSync('global', jail.derefInto());

// === NAVIGATOR ===
// Must NOT have connection (undefined), must have userAgentData, plugins, mimeTypes
context.evalSync(`
  var navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    appName: 'Netscape',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    platform: 'Win32',
    language: 'en-US',
    languages: ['en-US', 'en'],
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    doNotTrack: null,
    vendor: 'Google Inc.',
    vendorSub: '',
    productSub: '20030107',
    onLine: true,
    webdriver: false,
    // No cpuClass (undefined) — IE only
    // No oscpu (undefined) — Firefox only
    // connection is undefined in Chrome on desktop (offline or not set)
    connection: undefined,
    // brave is undefined
    brave: undefined,
    // plugins with 5 entries (Chrome default)
    plugins: (function() {
      var plugins = [
        {name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1},
        {name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1},
        {name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2},
        {name: 'Microsoft Edge PDF Plugin', filename: 'edge-pdf-viewer', description: '', length: 1},
        {name: 'WebKit built-in PDF', filename: 'webkit-pdf-viewer', description: '', length: 1}
      ];
      plugins.length = 5;
      plugins['Microsoft Edge PDF Plugin'] = plugins[3];
      return plugins;
    })(),
    // mimeTypes with 4 entries
    mimeTypes: (function() {
      var mt = [
        {type: 'application/pdf', suffixes: 'pdf', description: ''},
        {type: 'text/pdf', suffixes: 'pdf', description: ''},
        {type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: ''},
        {type: 'application/x-nacl', suffixes: '', description: ''}
      ];
      mt.length = 4;
      return mt;
    })(),
    // userAgentData for Chromium UA hints
    userAgentData: {
      brands: [
        {brand: 'Chromium', version: '124'},
        {brand: 'Google Chrome', version: '124'},
        {brand: 'Not-A.Brand', version: '99'}
      ],
      mobile: false,
      platform: 'Windows'
    }
  };
`);

// === SCREEN ===
context.evalSync(`
  var screen = {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    colorDepth: 24,
    pixelDepth: 24
  };
`);

// === WINDOW DIMENSIONS ===
context.evalSync(`
  var innerWidth = 1920;
  var innerHeight = 1080;
  var outerWidth = 1920;
  var outerHeight = 1080;
  var devicePixelRatio = 1;
`);

// === DOCUMENT with cookie store ===
context.evalSync(`
  var _cookieStore = '';
  var document = {
    createElement: function(tag) {
      var el = {
        style: {},
        setAttribute: function(){},
        getAttribute: function(){ return null; },
        src: ''
      };
      return el;
    },
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    documentMode: undefined,
    __webdriver_script_fn: undefined,
    '$cdc_asdjflasutopfhvcZLmcfl_': undefined
  };
  Object.defineProperty(document, 'cookie', {
    get: function() { return _cookieStore; },
    set: function(v) {
      // Parse out just name=value (ignore path/expires in storage but keep track)
      var parts = v.split(';');
      var nameVal = parts[0].trim();
      // Replace existing cookie with same name or append
      var name = nameVal.split('=')[0];
      if (_cookieStore) {
        var existing = _cookieStore.split('; ');
        var found = false;
        for (var i = 0; i < existing.length; i++) {
          if (existing[i].trim().split('=')[0] === name) {
            existing[i] = nameVal;
            found = true;
            break;
          }
        }
        if (!found) existing.push(nameVal);
        _cookieStore = existing.join('; ');
      } else {
        _cookieStore = nameVal;
      }
    },
    configurable: true
  });
`);

// === BOT DETECTION GLOBALS — all undefined ===
context.evalSync(`
  var _phantom = undefined;
  var __phantom = undefined;
  var __nightmare = undefined;
  var domAutomation = undefined;
  var domAutomationController = undefined;
  var _Selenium_IDE_Recorder = undefined;
  var callSelenium = undefined;
  var _selenium = undefined;
  var __webdriver_script_fn = undefined;
  var __driver_evaluate = undefined;
  var __webdriver_evaluate = undefined;
  var __selenium_evaluate = undefined;
  var __fxdriver_evaluate = undefined;
  var __driver_unwrapped = undefined;
  var __webdriver_unwrapped = undefined;
  var __selenium_unwrapped = undefined;
  var __fxdriver_unwrapped = undefined;
  var __webdriver_script_func = undefined;
  var eoapi = undefined;
  var eoapi_VerifyThis = undefined;
  var eoapi_extInvoke = undefined;
  var eoWebBrowserDispatcher = undefined;
  var _WEBDRIVER_ELEM_CACHE = undefined;
  var ChromeDriverw = undefined;
  var awesomium = undefined;
  var puffinDevice = undefined;
  var callPhantom = undefined;
  var yandex = undefined;
  var opera = undefined;
  var opr = undefined;
  var safari = undefined;
  var ActiveXObject = undefined;
  var webkitURL = undefined;
  var HIDDEN_CLASS = undefined;
  // Node.js detection — must be absent/undefined  
  var process = undefined;
  var require = undefined;
`);

// === CHROME OBJECT (required — absence flags headless) ===
context.evalSync(`
  var chrome = {
    runtime: {
      id: undefined,
      connect: function(){},
      sendMessage: function(){}
    },
    loadTimes: function() { return {}; },
    csi: function() { return {}; },
    app: {}
  };
`);

// === WINDOW / GLOBAL OBJECT ===
// In isolated-vm, "this" is already the global. Set window = this.
context.evalSync(`
  var window = this;
  var self = this;
  var globalThis = this;
  // window.constructor.toString() should look like a real browser Window
  // We need to override constructor.toString
`);

// === LOCATION ===
context.evalSync(`
  var location = {
    href: 'https://www.corteva.com/',
    hostname: 'www.corteva.com',
    host: 'www.corteva.com',
    protocol: 'https:',
    pathname: '/',
    search: '',
    hash: '',
    origin: 'https://www.corteva.com',
    toString: function() { return this.href; }
  };
`);

// === HISTORY ===
context.evalSync(`
  var history = { length: 1, state: null };
`);

// === PERFORMANCE ===
context.evalSync(`
  var _perfStart = Date.now() - 1000;
  var performance = {
    now: function() { return Date.now() - _perfStart; },
    timing: {
      navigationStart: Date.now() - 1000,
      loadEventEnd: 0,
      domContentLoadedEventEnd: 0
    },
    memory: {
      jsHeapSizeLimit: 2330000000,
      totalJSHeapSize: 10000000,
      usedJSHeapSize: 5000000
    },
    getEntriesByType: function() { return []; },
    getEntriesByName: function() { return []; }
  };
`);

// === TIMING FUNCTIONS ===
// Imperva uses setTimeout for anti-debug timer.
// We need to call them synchronously so the script can complete.
context.evalSync(`
  var _timers = [];
  var setTimeout = function(fn, delay) {
    var id = _timers.length;
    _timers.push({fn: fn, delay: delay || 0});
    return id;
  };
  var setInterval = function(fn, delay) { return 0; };
  var clearTimeout = function(id) {};
  var clearInterval = function() {};
  
  var _runTimers = function() {
    // Run all pending timers (up to 100 iterations to prevent infinite loops)
    var maxRuns = 100;
    var runs = 0;
    while (_timers.length > 0 && runs < maxRuns) {
      var timer = _timers.shift();
      try { timer.fn(); } catch(e) {}
      runs++;
    }
  };
`);

// === XHR STUB ===
context.evalSync(`
  var XMLHttpRequest = function() {
    this.open = function() {};
    this.send = function() {};
    this.setRequestHeader = function() {};
    this.readyState = 4;
    this.status = 200;
    this.responseText = '';
  };
`);

// === IMAGE STUB ===
context.evalSync(`
  var Image = function() {
    this.src = '';
    this.width = 0;
    this.height = 0;
  };
`);

// === CONSOLE ===
context.evalSync(`
  var console = {
    log: function() {},
    warn: function() {},
    error: function() {},
    debug: function() {}
  };
`);

// === ATOB / BTOA ===
// Use a proper implementation
context.evalSync(`
  var btoa = function(str) {
    var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var result = '';
    var i = 0;
    str = String(str);
    while (i < str.length) {
      var c1 = str.charCodeAt(i++) & 0xFF;
      var c2 = str.charCodeAt(i++) & 0xFF;
      var c3 = str.charCodeAt(i++) & 0xFF;
      var e1 = c1 >> 2;
      var e2 = ((c1 & 3) << 4) | (c2 >> 4);
      var e3 = ((c2 & 15) << 2) | (c3 >> 6);
      var e4 = c3 & 63;
      if (isNaN(str.charCodeAt(i - 2))) { e3 = e4 = 64; }
      else if (isNaN(str.charCodeAt(i - 1))) { e4 = 64; }
      result += b64.charAt(e1) + b64.charAt(e2) + b64.charAt(e3) + b64.charAt(e4);
    }
    return result;
  };
  var atob = function(str) {
    var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var result = '';
    var i = 0;
    str = String(str).replace(/[^A-Za-z0-9+\\/=]/g, '');
    while (i < str.length) {
      var e1 = b64.indexOf(str.charAt(i++));
      var e2 = b64.indexOf(str.charAt(i++));
      var e3 = b64.indexOf(str.charAt(i++));
      var e4 = b64.indexOf(str.charAt(i++));
      var c1 = (e1 << 2) | (e2 >> 4);
      var c2 = ((e2 & 15) << 4) | (e3 >> 2);
      var c3 = ((e3 & 3) << 6) | e4;
      result += String.fromCharCode(c1);
      if (e3 !== 64) result += String.fromCharCode(c2);
      if (e4 !== 64) result += String.fromCharCode(c3);
    }
    return result;
  };
`);

// === ENCODE/DECODE URI ===
// These are built-in in isolated-vm's V8, but just ensure they're accessible
context.evalSync(`
  if (typeof encodeURIComponent === 'undefined') {
    var encodeURIComponent = function(s) {
      return encodeURI(s).replace(/[!'()*]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16);
      });
    };
  }
`);

// === WEBGL STUB ===
context.evalSync(`
  var WebGLRenderingContext = function() {};
  window.WebGLRenderingContext = WebGLRenderingContext;
  window.WebAssembly = undefined;
`);

// === INTL ===
// V8 has Intl built-in, so this should be fine. Just verify:
context.evalSync(`
  if (typeof Intl === 'undefined') {
    var Intl = { DateTimeFormat: function() { return { resolvedOptions: function() { return { timeZone: 'America/New_York' }; } }; } };
  }
`);

// === WINDOW NUMBER OF KEYS CHECK ===
// The script does: Object.keys(window).length  
// We need window to have reasonable number of keys (not suspicious)
// Already set up via the globals above — they'll be enumerable

// === ANTI-DEBUG BYPASS ===
// The script has: _0x2906b9 which calls debugger in a loop
// It's triggered by _0x5e3b36 when elapsed time > 0x1f4 (500ms)
// Our setTimeout is a no-op so _0x5e3b36 won't be called via timer
// But _0x5e3b36 IS called directly during data collection (_0x56e9d0)
// We need to ensure Date.now() - _0x2a60ce (start time) <= 500ms
// Since we're running synchronously and fast, this should be fine
// BUT the script also has a recursive debugger trigger — let's patch eval/Function
context.evalSync(`
  // Override Function constructor to prevent debugger injection
  var _origFunction = Function;
  var Function = function() {
    var args = Array.prototype.slice.call(arguments);
    // Replace debugger calls with no-ops
    if (args.length > 0) {
      var last = args[args.length - 1];
      if (typeof last === 'string' && last.indexOf('debugger') !== -1) {
        args[args.length - 1] = last.replace(/debugger/g, '(function(){})()');
      }
    }
    return _origFunction.apply(this, args);
  };
  Function.prototype = _origFunction.prototype;
  Function.constructor = _origFunction;
`);

// Now run the challenge script
const challengeScript = fs.readFileSync('/root/.openclaw/workspace/imperva-research/challenge-script-raw.js', 'utf8');

console.log('Running challenge script...');
let scriptError = null;
try {
  context.evalSync(challengeScript, { timeout: 10000 });
  console.log('Script executed without error');
} catch(e) {
  scriptError = e.message;
  console.error('Script error:', e.message);
}

// Run any pending timers
try {
  context.evalSync('_runTimers();');
} catch(e) {
  // ignore
}

// Extract the cookie
let cookie = '';
try {
  cookie = context.evalSync('_cookieStore');
  console.log('Cookie store:', cookie);
} catch(e) {
  console.error('Cookie extraction error:', e.message);
}

// Also check document.cookie directly
let docCookie = '';
try {
  docCookie = context.evalSync('document.cookie');
  console.log('document.cookie:', docCookie);
} catch(e) {
  console.error('document.cookie error:', e.message);
}

// Extract ___utmvc value
const match = (cookie || docCookie).match(/___utmvc=([^;]+)/);
if (match) {
  console.log('\n✅ SUCCESS! ___utmvc value:', match[1]);
  fs.writeFileSync('/root/.openclaw/workspace/imperva-solver/utmvc_value.txt', match[1]);
  console.log('Written to utmvc_value.txt');
} else {
  console.error('\n❌ FAILED to extract ___utmvc cookie');
  if (scriptError) console.error('Script error was:', scriptError);
  // Try to list what was in the cookie store
  console.log('Full cookie store:', cookie || docCookie);
  
  // Try to see what _0x45e752 (the fingerprint string) looks like
  try {
    const fp = context.evalSync('_0x45e752 || "not found"');
    console.log('Fingerprint string (_0x45e752):', fp ? fp.substring(0, 200) : 'empty');
  } catch(e) {}
}

isolate.dispose();
