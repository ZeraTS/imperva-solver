'use strict';

// everything imperva pokes at during fingerprinting

function injectStubs(context, targetUrl) {
  const url = new URL(targetUrl);

  // global self-reference — isolated-vm needs this explicitly
  context.global.setSync('global', context.global.derefInto());

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
      // connection undefined = Chrome desktop (no network info API in this context)
      connection: undefined,
      brave: undefined,
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

  context.evalSync(`
    var innerWidth = 1920;
    var innerHeight = 1080;
    var outerWidth = 1920;
    var outerHeight = 1080;
    var devicePixelRatio = 1;
  `);

  // cookie store — imperva reads incap_ses_* cookies then writes ___utmvc here
  context.evalSync(`
    var _cookieStore = '';
    var document = {
      createElement: function(tag) {
        return {
          style: {},
          setAttribute: function(){},
          getAttribute: function(){ return null; },
          src: ''
        };
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
        var parts = v.split(';');
        var nameVal = parts[0].trim();
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

  // imperva checks for these — they must be undefined, not missing
  // a defined-but-undefined value passes the "exists" check as false
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
    // imperva checks for these node globals — must be undefined in sandbox
    var process = undefined;
    var require = undefined;
  `);

  // chrome object absence = headless flag
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

  // window = global, window.constructor.toString() must look browser-like
  context.evalSync(`
    var window = this;
    var self = this;
    var globalThis = this;
  `);

  // location needs to match the target so session binding is correct
  context.evalSync(`
    var location = {
      href: ${JSON.stringify(targetUrl)},
      hostname: ${JSON.stringify(url.hostname)},
      host: ${JSON.stringify(url.host)},
      protocol: ${JSON.stringify(url.protocol)},
      pathname: ${JSON.stringify(url.pathname || '/')},
      search: ${JSON.stringify(url.search || '')},
      hash: '',
      origin: ${JSON.stringify(url.origin)},
      toString: function() { return this.href; }
    };
  `);

  context.evalSync(`
    var history = { length: 1, state: null };
  `);

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

  // setTimeout is used by the anti-debug timer; queue them, run later
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
      var maxRuns = 100;
      var runs = 0;
      while (_timers.length > 0 && runs < maxRuns) {
        var timer = _timers.shift();
        try { timer.fn(); } catch(e) {}
        runs++;
      }
    };
  `);

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

  context.evalSync(`
    var Image = function() {
      this.src = '';
      this.width = 0;
      this.height = 0;
    };
  `);

  context.evalSync(`
    var console = {
      log: function() {},
      warn: function() {},
      error: function() {},
      debug: function() {}
    };
  `);

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

  context.evalSync(`
    if (typeof encodeURIComponent === 'undefined') {
      var encodeURIComponent = function(s) {
        return encodeURI(s).replace(/[!'()*]/g, function(c) {
          return '%' + c.charCodeAt(0).toString(16);
        });
      };
    }
  `);

  context.evalSync(`
    var WebGLRenderingContext = function() {};
    window.WebGLRenderingContext = WebGLRenderingContext;
    window.WebAssembly = undefined;
  `);

  context.evalSync(`
    if (typeof Intl === 'undefined') {
      var Intl = {
        DateTimeFormat: function() {
          return { resolvedOptions: function() { return { timeZone: 'America/New_York' }; } };
        }
      };
    }
  `);

  // patch Function constructor to strip any debugger calls before they run
  context.evalSync(`
    var _origFunction = Function;
    var Function = function() {
      var args = Array.prototype.slice.call(arguments);
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
}

// inject existing session cookies so imperva can bind the challenge to them
function injectCookies(context, cookies) {
  if (!cookies || Object.keys(cookies).length === 0) return;
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  context.evalSync(`_cookieStore = ${JSON.stringify(cookieStr)};`);
}

module.exports = { injectStubs, injectCookies };
