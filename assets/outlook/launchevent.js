/*
 * Imagina Signatures — Outlook add-in runtime (event-based activation).
 *
 * Loaded by assets/outlook/commands.html (Outlook on the web, new Outlook
 * for Windows, Outlook for Mac, Outlook mobile) and directly as the
 * JavaScript-only runtime of classic Outlook on Windows (manifest
 * <Override type="javascript">). Plain ES2017, one file, no imports, no
 * DOM: the JavaScript-only runtime supports none of those.
 *
 * On OnNewMessageCompose / OnNewAppointmentOrganizer (and the
 * "Insert signature" button) it:
 *   1. reads the deployment key + signature endpoint from the runtime URL
 *      (`?key=…&api=…`): `location.search` in the HTML runtime,
 *      `Office.context.urls.javascriptRuntimeUrl` in the JavaScript-only
 *      one, else the copy saved in roaming settings by an earlier run;
 *   2. asks `${api}?email=<userProfile.emailAddress>` with header
 *      X-Imgsig-Deploy-Key, caching the answer for one hour
 *      (localStorage, else OfficeRuntime.storage, else roaming settings)
 *      and falling back to the last good copy when the site is down;
 *   3. optionally turns off the user's own Outlook signature
 *      (disableClientSignatureAsync) when the admin asked for it, then
 *      item.body.setSignatureAsync(html, { coercionType: Html });
 *   4. ALWAYS calls event.completed() — every failure is silent and never
 *      blocks composing.
 *
 * Office.js itself is loaded by commands.html from Microsoft's CDN
 * (https://appsforoffice.microsoft.com/lib/1/hosted/office.js) — the one
 * documented exception to the plugin's no-CDN rule, because Office
 * requires add-ins to reference the hosted library (CLAUDE.md §0.1).
 * Classic Outlook injects its own local copy into the JavaScript runtime.
 */
(function () {
  'use strict';

  var root =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof self !== 'undefined'
        ? self
        : typeof window !== 'undefined'
          ? window
          : {};

  var CACHE_TTL_MS = 60 * 60 * 1000;
  var STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
  var FETCH_TIMEOUT_MS = 15000;
  var SAFETY_TIMEOUT_MS = 45000;
  var MAX_SIGNATURE_CHARS = 30000;
  /** Roaming settings hold 32 KB in total: only small signatures are cached there. */
  var MAX_ROAMING_CACHE_CHARS = 20000;
  var CACHE_KEY = 'imgsig_outlook_signature';
  var CONFIG_KEY = 'imgsig_outlook_config';
  var KEY_PATTERN = /^[a-f0-9]{64}$/;

  function getOffice() {
    return typeof root.Office !== 'undefined' ? root.Office : null;
  }

  function mailbox() {
    var office = getOffice();
    return office && office.context && office.context.mailbox ? office.context.mailbox : null;
  }

  function roaming() {
    var office = getOffice();
    return office && office.context && office.context.roamingSettings
      ? office.context.roamingSettings
      : null;
  }

  // ---------------------------------------------------------------------
  // Configuration (key + endpoint)
  // ---------------------------------------------------------------------

  function parseQuery(url) {
    var out = {};
    if (typeof url !== 'string') return out;
    var q = url.indexOf('?');
    if (q === -1) return out;
    var hash = url.indexOf('#', q);
    var query = url.slice(q + 1, hash === -1 ? undefined : hash);
    query.split('&').forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf('=');
      var name = eq === -1 ? pair : pair.slice(0, eq);
      var value = eq === -1 ? '' : pair.slice(eq + 1);
      try {
        out[decodeURIComponent(name)] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch (e) {
        // Malformed escape: ignore this pair.
      }
    });
    return out;
  }

  function validConfig(params) {
    if (!params) return null;
    var key = String(params.key || '').toLowerCase();
    var api = String(params.api || '');
    if (!KEY_PATTERN.test(key) || !/^https:\/\//i.test(api)) return null;
    return { key: key, api: api };
  }

  function runtimeUrls() {
    var urls = [];
    try {
      if (typeof root.location !== 'undefined' && root.location && root.location.href) {
        urls.push(String(root.location.href));
      }
    } catch (e) {
      // No location in the JavaScript-only runtime.
    }
    try {
      var office = getOffice();
      var js = office && office.context && office.context.urls && office.context.urls.javascriptRuntimeUrl;
      if (js) urls.push(String(js));
    } catch (e) {
      // Mailbox < 1.14.
    }
    return urls;
  }

  function readConfig() {
    var urls = runtimeUrls();
    for (var i = 0; i < urls.length; i++) {
      var found = validConfig(parseQuery(urls[i]));
      if (found) {
        rememberConfig(found);
        return found;
      }
    }
    var settings = roaming();
    if (settings) {
      try {
        return validConfig(settings.get(CONFIG_KEY));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /** Saves the config in roaming settings so runtimes without a readable URL can find it. */
  function rememberConfig(config) {
    var settings = roaming();
    if (!settings) return;
    try {
      var stored = settings.get(CONFIG_KEY);
      if (stored && stored.key === config.key && stored.api === config.api) return;
      settings.set(CONFIG_KEY, { key: config.key, api: config.api });
      settings.saveAsync(function () {});
    } catch (e) {
      // Best effort.
    }
  }

  // ---------------------------------------------------------------------
  // Cache (localStorage → OfficeRuntime.storage → roaming settings)
  // ---------------------------------------------------------------------

  function localStore() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      var probe = '__imgsig_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  function runtimeStore() {
    try {
      var rt = root.OfficeRuntime;
      return rt && rt.storage && typeof rt.storage.getItem === 'function' ? rt.storage : null;
    } catch (e) {
      return null;
    }
  }

  function cacheRead() {
    var ls = localStore();
    if (ls) {
      try {
        return Promise.resolve(JSON.parse(ls.getItem(CACHE_KEY) || 'null'));
      } catch (e) {
        return Promise.resolve(null);
      }
    }
    var rs = runtimeStore();
    if (rs) {
      return Promise.resolve()
        .then(function () {
          return rs.getItem(CACHE_KEY);
        })
        .then(function (raw) {
          return raw ? JSON.parse(raw) : null;
        })
        .catch(function () {
          return null;
        });
    }
    var settings = roaming();
    if (settings) {
      try {
        return Promise.resolve(settings.get(CACHE_KEY) || null);
      } catch (e) {
        return Promise.resolve(null);
      }
    }
    return Promise.resolve(null);
  }

  function cacheWrite(entry) {
    var ls = localStore();
    if (ls) {
      try {
        ls.setItem(CACHE_KEY, JSON.stringify(entry));
      } catch (e) {
        // Quota: ignore.
      }
      return;
    }
    var rs = runtimeStore();
    if (rs) {
      try {
        Promise.resolve(rs.setItem(CACHE_KEY, JSON.stringify(entry))).catch(function () {});
      } catch (e) {
        // Ignore.
      }
      return;
    }
    var settings = roaming();
    if (settings && entry.html.length <= MAX_ROAMING_CACHE_CHARS) {
      try {
        settings.set(CACHE_KEY, entry);
        settings.saveAsync(function () {});
      } catch (e) {
        // Ignore.
      }
    }
  }

  function usable(entry, email, maxAge) {
    return (
      !!entry &&
      typeof entry.html === 'string' &&
      entry.html !== '' &&
      entry.email === email &&
      typeof entry.at === 'number' &&
      Date.now() - entry.at < maxAge
    );
  }

  // ---------------------------------------------------------------------
  // Network
  // ---------------------------------------------------------------------

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('timeout'));
      }, ms);
      promise.then(
        function (value) {
          clearTimeout(timer);
          resolve(value);
        },
        function (error) {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  /** Resolves the signature entry, null when the site has none for this user (404). Rejects on network errors. */
  function fetchSignature(config, email) {
    if (typeof root.fetch !== 'function') return Promise.reject(new Error('no fetch'));
    var url =
      config.api + (config.api.indexOf('?') === -1 ? '?' : '&') + 'email=' + encodeURIComponent(email);
    var request = root.fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'X-Imgsig-Deploy-Key': config.key, Accept: 'application/json' },
    });
    return withTimeout(request, FETCH_TIMEOUT_MS).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json().then(function (body) {
        if (!body || typeof body.html !== 'string' || body.html === '') return null;
        return {
          email: email,
          html: body.html,
          hash: typeof body.hash === 'string' ? body.hash : '',
          replace: body.replace_client_signature === true,
          at: Date.now(),
        };
      });
    });
  }

  function getSignature(config, email) {
    return cacheRead().then(function (cached) {
      if (usable(cached, email, CACHE_TTL_MS)) return cached;
      return fetchSignature(config, email).then(
        function (fresh) {
          if (fresh) cacheWrite(fresh);
          return fresh;
        },
        function () {
          // Site unreachable: the last good copy beats no signature.
          return usable(cached, email, STALE_MAX_MS) ? cached : null;
        }
      );
    });
  }

  // ---------------------------------------------------------------------
  // Outlook calls
  // ---------------------------------------------------------------------

  function htmlCoercion() {
    var office = getOffice();
    return office && office.CoercionType && office.CoercionType.Html ? office.CoercionType.Html : 'html';
  }

  function callAsync(target, method, args) {
    return new Promise(function (resolve) {
      if (!target || typeof target[method] !== 'function') {
        resolve(false);
        return;
      }
      try {
        target[method].apply(
          target,
          args.concat(function (result) {
            resolve(!result || result.status !== 'failed');
          })
        );
      } catch (e) {
        resolve(false);
      }
    });
  }

  function applySignature(item, entry) {
    var options = { coercionType: htmlCoercion() };
    var before = entry.replace
      ? callAsync(item, 'disableClientSignatureAsync', [{}])
      : Promise.resolve(true);
    return before.then(function () {
      if (item.body && typeof item.body.setSignatureAsync === 'function') {
        return callAsync(item.body, 'setSignatureAsync', [entry.html, options]);
      }
      // Clients without the signature API (button only): insert at the cursor.
      return callAsync(item.body, 'setSelectedDataAsync', [entry.html, options]);
    });
  }

  function emailAddress() {
    var mb = mailbox();
    var profile = mb && mb.userProfile;
    return profile && typeof profile.emailAddress === 'string'
      ? profile.emailAddress.trim().toLowerCase()
      : '';
  }

  function insertSignature() {
    var mb = mailbox();
    var item = mb && mb.item;
    var config = readConfig();
    var email = emailAddress();
    if (!item || !item.body || !config || !email) return Promise.resolve(false);
    return getSignature(config, email).then(function (entry) {
      if (!entry || entry.html.length > MAX_SIGNATURE_CHARS) return false;
      return applySignature(item, entry);
    });
  }

  /** Runs the insert and calls event.completed() exactly once, whatever happens. */
  function handle(event) {
    var done = false;
    var timer = null;
    function complete() {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      try {
        if (event && typeof event.completed === 'function') event.completed();
      } catch (e) {
        // Nothing left to do.
      }
    }
    timer = setTimeout(complete, SAFETY_TIMEOUT_MS);
    try {
      insertSignature().then(complete, complete);
    } catch (e) {
      complete();
    }
  }

  function onNewMessageComposeHandler(event) {
    handle(event);
  }

  function onNewAppointmentOrganizerHandler(event) {
    handle(event);
  }

  function insertImaginaSignature(event) {
    handle(event);
  }

  // Global names: older clients look function commands up on the global object.
  root.onNewMessageComposeHandler = onNewMessageComposeHandler;
  root.onNewAppointmentOrganizerHandler = onNewAppointmentOrganizerHandler;
  root.insertImaginaSignature = insertImaginaSignature;

  var office = getOffice();
  if (office) {
    try {
      if (typeof office.onReady === 'function') office.onReady();
    } catch (e) {
      // Not needed by event handlers (onReady doesn't run there anyway).
    }
    try {
      if (office.actions && typeof office.actions.associate === 'function') {
        office.actions.associate('onNewMessageComposeHandler', onNewMessageComposeHandler);
        office.actions.associate('onNewAppointmentOrganizerHandler', onNewAppointmentOrganizerHandler);
        office.actions.associate('insertImaginaSignature', insertImaginaSignature);
      }
    } catch (e) {
      // Very old clients: the globals above are used instead.
    }
  }
})();
