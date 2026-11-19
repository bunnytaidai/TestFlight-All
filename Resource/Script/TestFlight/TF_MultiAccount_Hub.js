/**
 * TF_MultiAccount_Hub.js — Trung Tâm All-in-One 4 Tab (NobyDa + iRingo + API Replay Engine + StoreKit 1/2 RO + Telemetry Log)
 * Phiên bản: 2.2.1.0 — Tối ưu mạnh cho Loon 3.5.3 (.plugin + [Argument]) & Shadowrocket (.sgmodule) trên A9 iOS 15.8.8 (SSL Kill Switch 3)
 * Giao diện Web 4 Tab: http://tf-hub.test/ | Đồng bộ BoxJs: TF_HUB_*
 * - Tab 1: Quản lý Link TestFlight (Thêm lẻ/hàng loạt, Sửa, Xóa, Tự kiểm tra trạng thái OPEN/FULL/CLOSED, Bắn toàn bộ nick tham gia)
 * - Tab 2: Kho Apple ID & API Replay Core (Bắt tối đa tham số phiên: UUID, X-Session-*, X-Dsid, X-Apple-I-MD*, DeviceId, Storefront, UA; chống mất phiên/2FA lại; Quét cập nhật & tự gửi POST /install phá vùng; MERGE/PIN; Lách iOS cũ modBuild)
 * - Tab 3: Gói Đăng Ký Kiểm Thử Sandbox IAP (StoreKit 1 verifyReceipt & StoreKit 2 JWS — Chỉ đọc $done({})) theo từng nick + Watchlist nhắc gia hạn
 * - Tab 4: Bảng Log Kiểm Tra Trạng Thái Hoạt Động & Từng Hành Động (lọc OK/WARN/ERR, mã HTTP, độ trễ ms)
 */
'use strict';

const HUB_VERSION = '2.2.1.0';
const HUB_HOST = 'tf-hub.test';
const TF_ORIGIN = 'https://testflight.apple.com';

const KEYS = {
  ACCOUNTS: 'TF_HUB_ACCOUNTS',             // { [uuid]: { id, alias, emailHint, xSessionId, xRequestId, xSessionDigest, xDsid, xAppleStoreFront, xAppleIMd, xAppleIMdM, xAppleIMdRinfo, deviceId, storefrontId, cookie, ua, status, fail401, lastSeen, lastPing, appCount, apps: [...] } }
  APPLIST: 'TF_HUB_APPLIST',               // { [appAdamId]: uuid }
  APP_BUILDS: 'TF_HUB_APP_BUILDS',         // { [uuid::adamId]: buildId } — phát hiện build mới để tự gửi /install
  LINKS: 'TF_HUB_LINKS',                   // { [code]: { code, name, note, status, lastCheck, joinedBy: [] } }
  SUBS: 'TF_HUB_SUBS',                     // { [ownerKey]: { [productId]: {...} } }
  WATCHLIST: 'TF_HUB_WATCHLIST',           // Array of "ownerKey::productId"
  MODE: 'TF_HUB_MODE',                     // 'MERGE' | 'PIN'
  ACTIVE_ID: 'TF_HUB_ACTIVE_ID',           // UUID đang ghim
  COUNTRY: 'TF_HUB_COUNTRY',               // 'US' | 'VN' | 'JP' | ... | 'AUTO'
  UNIVERSAL: 'TF_HUB_UNIVERSAL',           // 'true' | 'false'
  ALWAYS_INSTALL: 'TF_HUB_ALWAYS_INSTALL', // 'true' | 'false'
  AUTO_JOIN: 'TF_HUB_AUTO_JOIN',           // 'true' | 'false'
  AUTO_INSTALL: 'TF_HUB_AUTO_INSTALL',     // 'true' | 'false'
  AUTO_UPDATE: 'TF_HUB_AUTO_UPDATE',       // 'true' | 'false' — phát hiện build mới tự gửi /install
  KEEPALIVE_MIN: 'TF_HUB_KEEPALIVE_MIN',   // Phút (mặc định 30)
  JOIN_CODES: 'TF_HUB_JOIN_CODES',         // Chuỗi mã đồng bộ BoxJs
  ACTION_LOGS: 'TF_HUB_ACTION_LOGS',       // Mảng JSON telemetry tối đa 60 dòng
};

const STOREFRONT_MAP = {
  US: '143441', VN: '143471', JP: '143462', SG: '143464',
  TW: '143470', HK: '143463', CN: '143465', GB: '143444',
  KR: '143466', AU: '143460', CA: '143455', DE: '143443',
  FR: '143442', TH: '143475', ID: '143476', MY: '143473',
  PH: '143474', IN: '143467', IE: '143449', NL: '143452',
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SANDBOX_HOST_RE = /^https?:\/\/(sandbox\.itunes|mzstorekit-sb\.itunes|api\.storekit-sandbox\.itunes)\.apple\.com\//i;

const isLoon = typeof $loon !== 'undefined';
const isReq = typeof $request !== 'undefined';
const isResp = typeof $response !== 'undefined';

// ============================================================================
// 1. LỚP LƯU TRỮ, ĐỌC $argument LOON, TELEMETRY LOG & HTTP REPLAY
// ============================================================================
function parseScriptArgs() {
  const out = {};
  const isPlaceholder = (v) => {
    const s = String(v ?? '').trim();
    return !s || s.startsWith('{') || s.startsWith('[');
  };
  try {
    if (typeof $argument === 'object' && $argument !== null) {
      for (const k of Object.keys($argument)) {
        if (!isPlaceholder($argument[k])) out[k] = $argument[k];
      }
      return out;
    }
    if (typeof $argument === 'string' && $argument.trim()) {
      for (const part of $argument.split('&')) {
        const idx = part.indexOf('=');
        if (idx > 0) {
          const k = decodeURIComponent(part.slice(0, idx).trim());
          const v = decodeURIComponent(part.slice(idx + 1).trim());
          if (k && !isPlaceholder(v)) out[k] = v;
        }
      }
    }
  } catch (_) {}
  return out;
}

const SCRIPT_ARGS = parseScriptArgs();

function storeRead(key, fallback = '') {
  try {
    if (typeof $persistentStore !== 'undefined') {
      const v = $persistentStore.read(key);
      if (v !== null && v !== undefined && v !== '') return v;
    }
  } catch (_) {}
  return fallback;
}

function storeWrite(key, val) {
  try {
    if (typeof $persistentStore !== 'undefined') {
      return $persistentStore.write(typeof val === 'string' ? val : JSON.stringify(val), key);
    }
  } catch (_) {}
  return false;
}

function readJson(key, fallback) {
  const raw = storeRead(key, '');
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : fallback;
  } catch (_) {
    return fallback;
  }
}

function readBool(key, argKey, def) {
  const raw = storeRead(key, '');
  const val = raw !== '' ? raw : (argKey && SCRIPT_ARGS[argKey] !== undefined ? String(SCRIPT_ARGS[argKey]) : '');
  const s = String(val).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return def;
}

function notify(title, subtitle, body, openUrl) {
  try {
    if (typeof $notification !== 'undefined') {
      if (isLoon) {
        if (openUrl) $notification.post(title, subtitle || '', body || '', { openUrl });
        else $notification.post(title, subtitle || '', body || '');
      } else {
        if (openUrl) $notification.post(title, subtitle || '', body || '', { url: openUrl });
        else $notification.post(title, subtitle || '', body || '');
      }
    }
  } catch (_) {}
}

function recordAction(status, action, target, detail, httpStatus = 0, durationMs = 0) {
  const entry = {
    ts: new Date().toISOString().slice(11, 19),
    status: status || 'INFO', // OK | WARN | ERR | SKIP | INFO
    action: action || 'SYS',
    target: String(target || '-').slice(0, 48),
    httpStatus: Number(httpStatus || 0),
    durationMs: Number(durationMs || 0),
    detail: String(detail || '').slice(0, 140),
  };
  try {
    console.log(`[TF-Hub ${entry.status}] ${entry.action} | ${entry.target} | HTTP ${entry.httpStatus} (${entry.durationMs}ms) | ${entry.detail}`);
  } catch (_) {}
  const logs = readJson(KEYS.ACTION_LOGS, []);
  if (!Array.isArray(logs)) return;
  logs.unshift(entry);
  if (logs.length > 60) logs.length = 60;
  storeWrite(KEYS.ACTION_LOGS, logs);
}

function lowerHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const k of Object.keys(headers)) out[k.toLowerCase()] = headers[k];
  return out;
}

function httpCall(method, opts) {
  const started = Date.now();
  return new Promise((resolve) => {
    if (typeof $httpClient === 'undefined') {
      return resolve({ error: 'No $httpClient', status: 0, headers: {}, body: '', durationMs: 0 });
    }
    const sec = opts.timeout || 15;
    const reqOpts = {
      url: opts.url,
      headers: Object.assign({}, opts.headers || {}),
      // Loon dùng mili-giây (15000ms), Shadowrocket/Surge dùng giây (15s)
      timeout: isLoon ? (sec * 1000) : sec,
    };
    if (opts.body !== undefined) reqOpts.body = opts.body;
    reqOpts['X-Surge-Skip-Scripting'] = true;
    reqOpts.headers['X-TF-Hub-Internal'] = '1';

    const fn = $httpClient[method.toLowerCase()];
    if (!fn) return resolve({ error: `Unsupported ${method}`, status: 0, headers: {}, body: '', durationMs: 0 });
    fn(reqOpts, (err, resp, data) => {
      const durationMs = Date.now() - started;
      if (err) return resolve({ error: String(err), status: 0, headers: {}, body: '', durationMs });
      resolve({
        error: null,
        status: (resp && (resp.status || resp.statusCode)) || 0,
        headers: (resp && resp.headers) || {},
        body: data || '',
        durationMs,
      });
    });
  });
}

function extractCodes(raw) {
  if (!raw) return [];
  return Array.from(
    new Set(
      String(raw)
        .split(/[\s,;|\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/i);
          return m ? m[1] : s.replace(/[^A-Za-z0-9]/g, '');
        })
        .filter((s) => s.length >= 6 && s.length <= 16)
    )
  );
}

function decodeBase64UrlJson(b64Url) {
  try {
    if (!b64Url || typeof b64Url !== 'string') return null;
    let b64 = b64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    let i = 0;
    while (i < b64.length) {
      const e1 = chars.indexOf(b64.charAt(i++));
      const e2 = chars.indexOf(b64.charAt(i++));
      const e3 = chars.indexOf(b64.charAt(i++));
      const e4 = chars.indexOf(b64.charAt(i++));
      const c1 = (e1 << 2) | (e2 >> 4);
      const c2 = ((e2 & 15) << 4) | (e3 >> 2);
      const c3 = ((e3 & 3) << 6) | e4;
      str += String.fromCharCode(c1);
      if (e3 !== 64 && e3 !== -1) str += String.fromCharCode(c2);
      if (e4 !== 64 && e4 !== -1) str += String.fromCharCode(c3);
    }
    return JSON.parse(decodeURIComponent(escape(str)));
  } catch (_) {
    return null;
  }
}

function decodeJwsPayload(jws) {
  if (!jws || typeof jws !== 'string') return null;
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  return decodeBase64UrlJson(parts[1]);
}

function getLinksMap() {
  const map = readJson(KEYS.LINKS, {});
  const boxCodes = extractCodes(storeRead(KEYS.JOIN_CODES, ''));
  let changed = false;
  for (const code of boxCodes) {
    if (!map[code]) {
      map[code] = { code, name: `Beta ${code}`, note: '', status: 'UNKNOWN', lastCheck: 0, joinedBy: [] };
      changed = true;
    }
  }
  if (changed) storeWrite(KEYS.LINKS, map);
  return map;
}

function saveLinksMap(map) {
  storeWrite(KEYS.LINKS, map);
  storeWrite(KEYS.JOIN_CODES, Object.keys(map).join(','));
}

function getConfig() {
  const rawMode = storeRead(KEYS.MODE, SCRIPT_ARGS.HUB_MODE || 'MERGE');
  const rawCountry = storeRead(KEYS.COUNTRY, SCRIPT_ARGS.HUB_COUNTRY || 'US');
  const rawKeep = storeRead(KEYS.KEEPALIVE_MIN, SCRIPT_ARGS.HUB_KEEPALIVE || '30');
  return {
    mode: String(rawMode).toUpperCase() === 'PIN' ? 'PIN' : 'MERGE',
    activeId: storeRead(KEYS.ACTIVE_ID, '').trim().toLowerCase(),
    country: String(rawCountry || 'US').toUpperCase(),
    universal: readBool(KEYS.UNIVERSAL, 'HUB_UNIVERSAL', true),
    alwaysInstall: readBool(KEYS.ALWAYS_INSTALL, 'HUB_ALWAYS_INSTALL', true),
    autoJoin: readBool(KEYS.AUTO_JOIN, 'HUB_AUTO_JOIN', true),
    autoInstall: readBool(KEYS.AUTO_INSTALL, 'HUB_AUTO_INSTALL', true),
    autoUpdate: readBool(KEYS.AUTO_UPDATE, 'HUB_AUTO_UPDATE', true),
    keepAliveMin: Math.max(5, Number(rawKeep) || 30),
  };
}

// ============================================================================
// 2. LOGIC CORE BẮT TỐI ĐA THAM SỐ PHIÊN APPLE ID (ANTI-2FA FINGERPRINT)
// ============================================================================
function upsertAccount(uuid, headersObj, extra = {}) {
  if (!uuid || !UUID_RE.test(uuid)) return null;
  const id = uuid.toLowerCase();
  const h = lowerHeaders(headersObj);

  const xSessionId = h['x-session-id'] || extra.xSessionId || '';
  const xRequestId = h['x-request-id'] || extra.xRequestId || '';
  const xSessionDigest = h['x-session-digest'] || extra.xSessionDigest || '';
  if (!xSessionId || !xSessionDigest) return null;

  const accounts = readJson(KEYS.ACCOUNTS, {});
  const isNew = !accounts[id];
  const prev = accounts[id] || {};
  const count = Object.keys(accounts).length + (isNew ? 1 : 0);

  const emailHint = extra.emailHint || prev.emailHint || '';
  const defaultAlias = emailHint || prev.alias || `Apple ID #${count}`;

  accounts[id] = {
    id,
    alias: extra.alias || defaultAlias,
    emailHint,
    xSessionId,
    xRequestId: xRequestId || prev.xRequestId || '',
    xSessionDigest,
    // Bắt tối đa tham số nhận diện thiết bị & phiên để replay nhất quán, hạn chế bị đá phiên/2FA lại
    xDsid: h['x-dsid'] || h['x-apple-dsid'] || extra.xDsid || prev.xDsid || '',
    xAppleStoreFront: h['x-apple-store-front'] || extra.xAppleStoreFront || prev.xAppleStoreFront || '',
    xAppleIMd: h['x-apple-i-md'] || extra.xAppleIMd || prev.xAppleIMd || '',
    xAppleIMdM: h['x-apple-i-md-m'] || extra.xAppleIMdM || prev.xAppleIMdM || '',
    xAppleIMdRinfo: h['x-apple-i-md-rinfo'] || extra.xAppleIMdRinfo || prev.xAppleIMdRinfo || '',
    deviceId: extra.deviceId || prev.deviceId || '',
    storefrontId: extra.storefrontId || prev.storefrontId || '',
    cookie: h['cookie'] || extra.cookie || prev.cookie || '',
    ua: h['user-agent'] || extra.ua || prev.ua || 'TestFlight/3.5.1 (iPhone; iOS 15.8.8; Scale/2.00)',
    acceptLang: h['accept-language'] || prev.acceptLang || 'vi-VN,vi;q=0.9,en-US;q=0.8',
    status: 'ALIVE',
    fail401: 0,
    lastSeen: Date.now(),
    lastPing: prev.lastPing || Date.now(),
    appCount: typeof extra.appCount === 'number' ? extra.appCount : (prev.appCount || 0),
    apps: Array.isArray(extra.apps) ? extra.apps : (prev.apps || []),
  };

  storeWrite(KEYS.ACCOUNTS, accounts);
  if (isNew) {
    recordAction('OK', 'AUTH_CAPTURE', accounts[id].alias, `Đã chụp nick mới (${id.slice(0, 8)}...) + bộ fingerprint đầy đủ`, 200, 0);
    notify('TF Hub v2.1 — Đã Chụp Nick Mới', accounts[id].alias, `UUID: ${id}\nĐã lưu đủ Token & Device Fingerprint.`, `http://${HUB_HOST}/`);
  }
  return accounts[id];
}

function buildReplayHeaders(acc, baseHeaders = {}) {
  const h = lowerHeaders(baseHeaders);
  const out = {};
  for (const k of Object.keys(h)) {
    if (k === 'if-none-match' || k === 'content-length' || k === 'host') continue;
    out[k] = h[k];
  }
  out['x-session-id'] = acc.xSessionId;
  if (acc.xRequestId) out['x-request-id'] = acc.xRequestId;
  out['x-session-digest'] = acc.xSessionDigest;
  if (acc.xDsid) out['x-dsid'] = acc.xDsid;
  if (acc.xAppleStoreFront) out['x-apple-store-front'] = acc.xAppleStoreFront;
  if (acc.xAppleIMd) out['x-apple-i-md'] = acc.xAppleIMd;
  if (acc.xAppleIMdM) out['x-apple-i-md-m'] = acc.xAppleIMdM;
  if (acc.xAppleIMdRinfo) out['x-apple-i-md-rinfo'] = acc.xAppleIMdRinfo;
  if (acc.cookie && !out['cookie']) out['cookie'] = acc.cookie;
  out['user-agent'] = acc.ua || out['user-agent'] || 'TestFlight/3.5.1 (iPhone; iOS 15.8.8; Scale/2.00)';
  if (!out['accept-language']) out['accept-language'] = acc.acceptLang || 'vi-VN,vi;q=0.9,en-US;q=0.8';
  if (!out['accept']) out['accept'] = 'application/json';
  return out;
}

function patchStorefrontInBody(bodyStr, countryCode) {
  if (!bodyStr || !countryCode || countryCode === 'AUTO') return bodyStr;
  const sf = STOREFRONT_MAP[countryCode];
  if (!sf) return bodyStr;
  try {
    const obj = JSON.parse(bodyStr);
    let changed = false;
    if (typeof obj.storeFrontIdentifier === 'string') {
      obj.storeFrontIdentifier = obj.storeFrontIdentifier.replace(/\d{6}/, sf);
      changed = true;
    }
    if (typeof obj.storefrontId === 'string') {
      obj.storefrontId = obj.storefrontId.replace(/\d{6}/, sf);
      changed = true;
    }
    return changed ? JSON.stringify(obj) : bodyStr;
  } catch (_) {
    return bodyStr;
  }
}

function modBuild(build) {
  if (!build || typeof build !== 'object') return build;
  const p = build.platform || build.name;
  if (p === 'ios' || p === 'osx' || !p) {
    build.compatible = true;
    build.platformCompatible = true;
    build.hardwareCompatible = true;
    build.osCompatible = true;
    if (build.permission !== undefined) build.permission = 'install';
    if (build.deviceFamilyInfo) {
      build.deviceFamilyInfo = [
        { number: 1, name: 'iOS', iconUrl: 'https://itunesconnect-mr.itunes.apple.com/itc/img/device-icons/device_family_icon_1.png' },
        { number: 2, name: 'iPad', iconUrl: 'https://itunesconnect-mr.itunes.apple.com/itc/img/device-icons/device_family_icon_2.png' },
        { number: 3, name: 'Apple TV', iconUrl: 'https://itunesconnect-mr.itunes.apple.com/itc/img/device-icons/device_family_icon_3.png' },
      ];
    }
    if (build.compatibilityData && build.compatibilityData.compatibleDeviceFamilies) {
      build.compatibilityData.compatibleDeviceFamilies = [
        { name: 'iPhone', minimumSupportedDevice: null, unsupportedDevices: [] },
        { name: 'iPad', minimumSupportedDevice: null, unsupportedDevices: [] },
        { name: 'iPod', minimumSupportedDevice: null, unsupportedDevices: [] },
        { name: 'Mac', minimumSupportedDevice: null, unsupportedDevices: [] },
      ];
    }
    if (build.macBuildCompatibility) {
      build.macBuildCompatibility.runsOnIntel = true;
      build.macBuildCompatibility.runsOnAppleSilicon = true;
    }
  }
  return build;
}

function patchAppsListUniversal(appsArr) {
  if (!Array.isArray(appsArr)) return appsArr;
  return appsArr.map((app) => {
    if (app && app.previouslyTested !== true && Array.isArray(app.platforms)) {
      app.platforms = app.platforms.map((pl) => {
        if (pl && pl.build) pl.build = modBuild(pl.build);
        return pl;
      });
    }
    return app;
  });
}

// ============================================================================
// 3. API REPLAY ENGINE: PING NUÔI TOKEN, TỰ CHECK BUILD MỚI, TỰ JOIN & INSTALL
// ============================================================================
async function sendInstallApi(acc, appId, buildId, countryCode) {
  const sf = STOREFRONT_MAP[countryCode] || '143441';
  const url = `${TF_ORIGIN}/v3/accounts/${acc.id}/apps/${appId}/builds/${buildId}/install`;
  const payload = { storefrontId: `${sf}-19,29` };
  if (acc.deviceId) payload.deviceId = acc.deviceId;
  const r = await httpCall('POST', {
    url,
    headers: Object.assign(buildReplayHeaders(acc), { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
    timeout: 12,
  });
  const ok = r.status === 200;
  recordAction(ok ? 'OK' : 'WARN', 'INSTALL_API', `${acc.alias} ➔ app ${appId}`, `build=${buildId}, SF=${sf}${r.error ? ' ' + r.error : ''}`, r.status, r.durationMs);
  return { ok, status: r.status, appId, buildId, account: acc.alias, durationMs: r.durationMs };
}

async function pingAndSyncAccount(acc, cfg, autoTriggerUpdates = false) {
  const url = `${TF_ORIGIN}/v3/accounts/${acc.id}/apps`;
  const r = await httpCall('GET', { url, headers: buildReplayHeaders(acc), timeout: 12 });
  const accounts = readJson(KEYS.ACCOUNTS, {});
  const cur = accounts[acc.id] || acc;

  if (r.status === 200 && r.body) {
    let appsSummary = cur.apps || [];
    const buildMap = readJson(KEYS.APP_BUILDS, {});
    const updatedApps = [];
    try {
      const parsed = JSON.parse(r.body);
      if (Array.isArray(parsed.data)) {
        appsSummary = parsed.data
          .filter((a) => a && a.previouslyTested !== true)
          .slice(0, 30)
          .map((a) => {
            const iosPlat = Array.isArray(a.platforms) ? a.platforms.find((p) => p.name === 'ios') || a.platforms[0] : null;
            const b = iosPlat && iosPlat.build ? iosPlat.build : {};
            const item = {
              adamId: String(a.appAdamId || ''),
              name: a.name || 'Unknown',
              buildId: String(b.id || ''),
              version: b.cfBundleShortVersion || b.version || '',
              buildVer: b.cfBundleVersion || '',
            };
            if (item.adamId && item.buildId) {
              const bKey = `${acc.id}::${item.adamId}`;
              if (buildMap[bKey] && buildMap[bKey] !== item.buildId) {
                updatedApps.push(item);
              }
              buildMap[bKey] = item.buildId;
            }
            return item;
          });
        storeWrite(KEYS.APP_BUILDS, buildMap);
      }
    } catch (_) {}

    cur.status = 'ALIVE';
    cur.fail401 = 0;
    cur.lastPing = Date.now();
    cur.appCount = appsSummary.length;
    cur.apps = appsSummary;
    accounts[acc.id] = cur;
    storeWrite(KEYS.ACCOUNTS, accounts);
    recordAction('OK', 'PING_SYNC', cur.alias, `Sống (${appsSummary.length} apps, ${updatedApps.length} bản mới)`, 200, r.durationMs);

    // Tự động gửi lệnh /install nếu phát hiện bản build cập nhật mới
    if (autoTriggerUpdates && cfg.autoUpdate && updatedApps.length > 0) {
      for (const up of updatedApps) {
        await sendInstallApi(cur, up.adamId, up.buildId, cfg.country);
        notify('TF Hub — Bản Cập Nhật Mới 🔄', `${up.name} v${up.version}`, `${cur.alias}: đã gửi lệnh /install (build ${up.buildId}).`, 'itms-beta://');
      }
    }
    return { id: acc.id, alias: cur.alias, ok: true, status: 200, appCount: appsSummary.length, updates: updatedApps.length };
  }

  if (r.status === 401) {
    cur.fail401 = (cur.fail401 || 0) + 1;
    cur.lastPing = Date.now();
    if (cur.fail401 >= 2) {
      cur.status = 'EXPIRED_401';
      notify('TF Hub — Token Hết Hạn (401)', cur.alias, `Mở app TestFlight bằng nick này 1 lần để Hub tự nạp lại token mới.`, `http://${HUB_HOST}/`);
    }
    accounts[acc.id] = cur;
    storeWrite(KEYS.ACCOUNTS, accounts);
    recordAction('ERR', 'PING_SYNC', cur.alias, `Token 401 (${cur.fail401}/2) — cần nạp lại phiên`, 401, r.durationMs);
    return { id: acc.id, alias: cur.alias, ok: false, status: 401 };
  }

  recordAction('WARN', 'PING_SYNC', cur.alias, `Lỗi kết nối: ${r.error || 'HTTP ' + r.status}`, r.status, r.durationMs);
  return { id: acc.id, alias: cur.alias, ok: false, status: r.status || 0 };
}

async function pingAccounts(targetIds = null, force = false, autoTriggerUpdates = true) {
  const cfg = getConfig();
  const accounts = readJson(KEYS.ACCOUNTS, {});
  const ids = Array.isArray(targetIds) && targetIds.length ? targetIds : Object.keys(accounts);
  const results = [];
  const now = Date.now();
  const intervalMs = cfg.keepAliveMin * 60 * 1000;

  for (const id of ids) {
    const acc = accounts[id];
    if (!acc) continue;
    if (!force && acc.status === 'ALIVE' && now - (acc.lastPing || 0) < intervalMs) {
      results.push({ id, alias: acc.alias, skipped: true, status: 200 });
      continue;
    }
    results.push(await pingAndSyncAccount(acc, cfg, autoTriggerUpdates));
  }
  return results;
}

async function checkPublicSlot(tfCode) {
  const r = await httpCall('GET', {
    url: `${TF_ORIGIN}/join/${tfCode}`,
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iOS 15_8_8 like Mac OS X)' },
    timeout: 8,
  });
  let state = 'UNKNOWN';
  let title = '';
  if (r.error || r.status !== 200 || !r.body) {
    state = 'ERROR';
  } else {
    const tm = r.body.match(/<title>([^<]+)<\/title>/i);
    if (tm) title = tm[1].replace(/\s*-\s*TestFlight.*$/i, '').replace(/^Join the\s+/i, '').trim();
    if (/This beta is full|không nhận thêm người kiểm tra|已满/i.test(r.body)) state = 'FULL';
    else if (/isn't accepting any new testers|không chấp nhận|不接受任何新测试员/i.test(r.body)) state = 'CLOSED';
    else if (/Start Testing|To join the .* beta|Bắt đầu kiểm tra|开始测试/i.test(r.body)) state = 'OPEN';
  }
  recordAction(state === 'OPEN' ? 'OK' : (state === 'ERROR' ? 'ERR' : 'INFO'), 'CHECK_LINK', tfCode, `Trạng thái: ${state}${title ? ' (' + title + ')' : ''}`, r.status, r.durationMs);
  return { state, title, httpStatus: r.status, durationMs: r.durationMs };
}

async function checkLinksStatus(targetCodes = null) {
  const links = getLinksMap();
  const codes = Array.isArray(targetCodes) && targetCodes.length ? targetCodes : Object.keys(links);
  const out = [];
  for (const code of codes) {
    if (!links[code]) continue;
    const res = await checkPublicSlot(code);
    links[code].status = res.state;
    links[code].lastCheck = Date.now();
    if (res.title && (!links[code].name || links[code].name === `Beta ${code}`)) {
      links[code].name = res.title;
    }
    out.push({ code, name: links[code].name, status: res.state, httpStatus: res.httpStatus });
  }
  saveLinksMap(links);
  return out;
}

async function tryAcceptForAccount(acc, tfCode, cfg) {
  const acceptUrl = `${TF_ORIGIN}/v3/accounts/${acc.id}/ru/${tfCode}/accept`;
  const r = await httpCall('POST', {
    url: acceptUrl,
    headers: Object.assign(buildReplayHeaders(acc), { 'content-type': 'application/json' }),
    body: '{}',
    timeout: 12,
  });
  if (r.status === 200) {
    recordAction('OK', 'ACCEPT_API', `${acc.alias} ➔ ${tfCode}`, 'Tham gia thành công!', 200, r.durationMs);
    notify('TF Hub — Tham Gia Thành Công 🎉', `${acc.alias} ➔ ${tfCode}`, 'Bấm để mở TestFlight tải/cập nhật.', `itms-beta://testflight.apple.com/join/${tfCode}`);
    const links = getLinksMap();
    if (links[tfCode]) {
      if (!Array.isArray(links[tfCode].joinedBy)) links[tfCode].joinedBy = [];
      if (!links[tfCode].joinedBy.includes(acc.alias)) links[tfCode].joinedBy.push(acc.alias);
      saveLinksMap(links);
    }
    if (cfg.autoInstall && r.body) {
      try {
        const j = JSON.parse(r.body);
        const appId = j?.data?.appAdamId || j?.data?.app?.adamId;
        const buildId = j?.data?.buildId || j?.data?.currentBuild?.id;
        if (appId && buildId) await sendInstallApi(acc, appId, buildId, cfg.country);
      } catch (_) {}
    }
    return { ok: true, status: 200, code: tfCode, account: acc.alias };
  }
  recordAction(r.status === 401 ? 'ERR' : 'WARN', 'ACCEPT_API', `${acc.alias} ➔ ${tfCode}`, `Thất bại (${r.error || 'HTTP ' + r.status})`, r.status, r.durationMs);
  return { ok: false, status: r.status, code: tfCode, account: acc.alias };
}

async function batchJoinLinks({ codes = null, accountIds = null, skipPublicCheck = false, stopOnFirst = false } = {}) {
  const cfg = getConfig();
  const links = getLinksMap();
  const targetCodes = Array.isArray(codes) && codes.length ? codes : Object.keys(links);
  const accounts = readJson(KEYS.ACCOUNTS, {});
  let targetAccs = Array.isArray(accountIds) && accountIds.length
    ? accountIds.map((id) => accounts[id]).filter(Boolean)
    : Object.values(accounts).filter((a) => a.status === 'ALIVE');
  if (!accountIds && cfg.mode === 'PIN' && cfg.activeId && accounts[cfg.activeId]) {
    targetAccs = [accounts[cfg.activeId]];
  }

  const results = [];
  for (const code of targetCodes) {
    let slotState = 'FORCED';
    if (!skipPublicCheck) {
      const chk = await checkPublicSlot(code);
      slotState = chk.state;
      if (links[code]) {
        links[code].status = slotState;
        links[code].lastCheck = Date.now();
        if (chk.title && (!links[code].name || links[code].name === `Beta ${code}`)) links[code].name = chk.title;
      }
      if (slotState !== 'OPEN') {
        results.push({ code, slotState, action: 'SKIP' });
        continue;
      }
    }
    if (!targetAccs.length) {
      results.push({ code, slotState, action: 'NO_ALIVE_ACCOUNT' });
      continue;
    }
    for (const acc of targetAccs) {
      // Bỏ qua nếu nick này đã từng tham gia thành công mã này
      if (!skipPublicCheck && links[code] && Array.isArray(links[code].joinedBy) && links[code].joinedBy.includes(acc.alias)) {
        results.push({ code, slotState, account: acc.alias, action: 'ALREADY_JOINED' });
        continue;
      }
      const res = await tryAcceptForAccount(acc, code, cfg);
      results.push({ code, slotState, account: acc.alias, status: res.status, ok: res.ok });
      if (res.ok && stopOnFirst) break;
    }
  }
  saveLinksMap(links);
  return results;
}

// ============================================================================
// 4. STOREKIT 1 & 2 SANDBOX SUBSCRIPTION MONITOR (CHỈ ĐỌC — KHÔNG SỬA BIÊN LAI)
// ============================================================================
function resolveSandboxOwner(reqHeaders, appAccountToken) {
  const h = lowerHeaders(reqHeaders);
  const dsid = h['x-dsid'] || h['x-apple-dsid'] || '';
  const cfg = getConfig();
  const accounts = readJson(KEYS.ACCOUNTS, {});
  if (appAccountToken && UUID_RE.test(appAccountToken)) {
    const id = appAccountToken.toLowerCase();
    return { ownerKey: id, ownerLabel: (accounts[id] && accounts[id].alias) || `Token ${id.slice(0, 8)}` };
  }
  if (dsid) {
    const matched = Object.values(accounts).find((a) => a.xDsid === dsid);
    if (matched) return { ownerKey: matched.id, ownerLabel: `${matched.alias} (DSID ${dsid})` };
    return { ownerKey: `dsid:${dsid}`, ownerLabel: `DSID ${dsid}` };
  }
  if (cfg.activeId && accounts[cfg.activeId]) {
    return { ownerKey: cfg.activeId, ownerLabel: accounts[cfg.activeId].alias };
  }
  const firstAcc = Object.values(accounts)[0];
  if (firstAcc) return { ownerKey: firstAcc.id, ownerLabel: firstAcc.alias };
  return { ownerKey: 'default_sandbox', ownerLabel: 'Sandbox Mặc Định' };
}

function upsertSubRecord(ownerKey, ownerLabel, rec) {
  if (!rec || !rec.productId) return false;
  const subs = readJson(KEYS.SUBS, {});
  if (!subs[ownerKey]) subs[ownerKey] = {};
  const prev = subs[ownerKey][rec.productId] || {};
  const newExp = Number(rec.expiresMs || 0);
  const prevExp = Number(prev.expiresMs || 0);
  subs[ownerKey][rec.productId] = {
    ownerKey,
    ownerLabel: ownerLabel || prev.ownerLabel || ownerKey,
    productId: String(rec.productId),
    originalTxId: String(rec.originalTxId || prev.originalTxId || ''),
    expiresMs: newExp >= prevExp ? newExp : prevExp,
    autoRenewStatus: rec.autoRenewStatus !== undefined ? String(rec.autoRenewStatus) : (prev.autoRenewStatus || '0'),
    environment: rec.environment || 'Sandbox',
    source: rec.source || prev.source || 'StoreKit',
    updatedAt: Date.now(),
  };
  storeWrite(KEYS.SUBS, subs);
  return true;
}

function parseSandboxSubscriptionsReadOnly(bodyStr, reqHeaders) {
  if (!bodyStr || typeof bodyStr !== 'string') return 0;
  let count = 0;
  let obj;
  try { obj = JSON.parse(bodyStr); } catch (_) { obj = null; }

  if (obj && typeof obj === 'object') {
    const renewMap = {};
    if (Array.isArray(obj.pending_renewal_info)) {
      for (const r of obj.pending_renewal_info) {
        if (r && r.product_id) renewMap[r.product_id] = String(r.auto_renew_status ?? '0');
      }
    }
    const items = Array.isArray(obj.latest_receipt_info) ? obj.latest_receipt_info : [];
    const owner = resolveSandboxOwner(reqHeaders, '');
    for (const it of items) {
      if (!it || !it.product_id) continue;
      if (upsertSubRecord(owner.ownerKey, owner.ownerLabel, {
        productId: it.product_id,
        originalTxId: it.original_transaction_id || it.transaction_id || '',
        expiresMs: Number(it.expires_date_ms || 0),
        autoRenewStatus: renewMap[it.product_id] ?? '1',
        environment: obj.environment || 'Sandbox',
        source: 'StoreKit1',
      })) count++;
    }
  }

  const jwsList = bodyStr.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  for (const token of jwsList.slice(0, 30)) {
    const payload = decodeJwsPayload(token);
    if (!payload || !payload.productId) continue;
    const owner = resolveSandboxOwner(reqHeaders, payload.appAccountToken || '');
    if (upsertSubRecord(owner.ownerKey, owner.ownerLabel, {
      productId: payload.productId,
      originalTxId: payload.originalTransactionId || payload.transactionId || '',
      expiresMs: Number(payload.expiresDate || 0),
      autoRenewStatus: payload.autoRenewStatus !== undefined ? String(payload.autoRenewStatus) : '1',
      environment: payload.environment || 'Sandbox',
      source: 'StoreKit2-JWS',
    })) count++;
  }

  if (count > 0) recordAction('OK', 'SANDBOX_RO', 'StoreKit 1/2', `Ghi nhận chỉ đọc ${count} gói đăng ký Sandbox`, 200, 0);
  return count;
}

function checkWatchlistRenewals() {
  const subs = readJson(KEYS.SUBS, {});
  const watch = readJson(KEYS.WATCHLIST, []);
  if (!Array.isArray(watch) || !watch.length) return [];
  const now = Date.now();
  const alerted = [];

  for (const key of watch) {
    const [ownerKey, productId] = String(key).split('::');
    const rec = subs[ownerKey] && subs[ownerKey][productId];
    if (!rec) continue;
    const remainMin = Math.round((rec.expiresMs - now) / 60000);
    if (rec.autoRenewStatus === '0' || remainMin <= 5) {
      const msg = remainMin <= 0
        ? `Đã hết hạn (${rec.ownerLabel}) — autoRenew=${rec.autoRenewStatus}. Bấm mở trang quản lý để gia hạn.`
        : `Còn ~${remainMin} phút (${rec.ownerLabel}) — autoRenew=${rec.autoRenewStatus}.`;
      notify('TF Hub — Nhắc Gia Hạn Sandbox 💳', rec.productId, msg, 'itms-apps://apps.apple.com/account/subscriptions');
      recordAction('WARN', 'RENEW_ALERT', rec.productId, msg, 0, 0);
      alerted.push({ ownerKey, productId, remainMin, autoRenewStatus: rec.autoRenewStatus });
    }
  }
  return alerted;
}

// ============================================================================
// 5. MITM REQUEST & RESPONSE INTERCEPTORS (HEADER/BODY INJECTION)
// ============================================================================
async function handleTestFlightRequest() {
  const req = $request;
  const reqHeaders = lowerHeaders(req.headers);
  if (reqHeaders['x-tf-hub-internal'] === '1') return $done({});

  const cfg = getConfig();
  const url = req.url;
  const uuidMatch = url.match(/\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  const reqUuid = uuidMatch ? uuidMatch[1].toLowerCase() : '';

  // Trích xuất thêm deviceId & storefrontId từ request body (nếu có)
  let extraMeta = {};
  if (req.body && req.body[0] === '{') {
    try {
      const bObj = JSON.parse(req.body);
      if (bObj.deviceId) extraMeta.deviceId = String(bObj.deviceId);
      if (bObj.storefrontId || bObj.storeFrontIdentifier) {
        extraMeta.storefrontId = String(bObj.storefrontId || bObj.storeFrontIdentifier);
      }
    } catch (_) {}
  }

  if (reqUuid && reqHeaders['x-session-id'] && reqHeaders['x-session-digest']) {
    upsertAccount(reqUuid, req.headers, extraMeta);
  }

  let modBody = req.body;
  if (modBody && (/\/v1\/session\/authenticate/.test(url) || /\/install$/.test(url))) {
    modBody = patchStorefrontInBody(modBody, cfg.country);
  }

  const accounts = readJson(KEYS.ACCOUNTS, {});
  const accountIds = Object.keys(accounts);

  // Chế độ PIN (kiểu iRingo — tiêm trọn bộ fingerprint nick đang ghim)
  if (cfg.mode === 'PIN' && cfg.activeId && accounts[cfg.activeId]) {
    const pinned = accounts[cfg.activeId];
    const newHeaders = Object.assign({}, req.headers);
    let newUrl = url;
    if (reqUuid && reqUuid !== pinned.id) newUrl = url.replace(UUID_RE, pinned.id);
    if (reqHeaders['x-session-id'] !== pinned.xSessionId) {
      delete newHeaders['If-None-Match'];
      delete newHeaders['if-none-match'];
      newHeaders['X-Session-Id'] = pinned.xSessionId;
      newHeaders['x-session-id'] = pinned.xSessionId;
      if (pinned.xRequestId) { newHeaders['X-Request-Id'] = pinned.xRequestId; newHeaders['x-request-id'] = pinned.xRequestId; }
      newHeaders['X-Session-Digest'] = pinned.xSessionDigest;
      newHeaders['x-session-digest'] = pinned.xSessionDigest;
      if (pinned.xAppleIMd) newHeaders['X-Apple-I-MD'] = pinned.xAppleIMd;
      if (pinned.xAppleIMdM) newHeaders['X-Apple-I-MD-M'] = pinned.xAppleIMdM;
    }
    const out = { url: newUrl, headers: newHeaders };
    if (modBody !== undefined) out.body = modBody;
    return $done(out);
  }

  // Chế độ MERGE (kiểu NobyDa — chạy tuần tự an toàn RAM A9)
  if (cfg.mode === 'MERGE' && req.method === 'GET' && /\/accounts\/[0-9a-f-]{36}\/apps$/i.test(url) && accountIds.length > 1) {
    const aliveIds = accountIds.filter((id) => accounts[id].status !== 'EXPIRED_401');
    const mergedApps = [];
    const seenAdam = new Set();
    const appOwnerMap = readJson(KEYS.APPLIST, {});
    let primaryStatus = 200;

    for (const id of aliveIds) {
      const acc = accounts[id];
      const r = await httpCall('GET', { url: url.replace(UUID_RE, id), headers: buildReplayHeaders(acc, req.headers), timeout: 12 });
      if (r.status === 200 && r.body) {
        try {
          const parsed = JSON.parse(r.body);
          let list = Array.isArray(parsed.data) ? parsed.data : [];
          if (cfg.universal) list = patchAppsListUniversal(list);
          accounts[id].appCount = list.length;
          accounts[id].lastPing = Date.now();
          accounts[id].status = 'ALIVE';
          accounts[id].fail401 = 0;

          for (const item of list) {
            if (!item || item.previouslyTested === true) continue;
            const adamId = String(item.appAdamId || '');
            if (!adamId || seenAdam.has(adamId)) continue;
            seenAdam.add(adamId);
            appOwnerMap[adamId] = id;
            if (id === reqUuid) mergedApps.unshift(item);
            else mergedApps.push(item);
          }
        } catch (_) {}
      } else if (r.status === 401) {
        accounts[id].fail401 = (accounts[id].fail401 || 0) + 1;
        if (accounts[id].fail401 >= 2) accounts[id].status = 'EXPIRED_401';
      }
      if (id === reqUuid && r.status) primaryStatus = r.status;
    }

    storeWrite(KEYS.ACCOUNTS, accounts);
    storeWrite(KEYS.APPLIST, appOwnerMap);
    recordAction('OK', 'MERGE_LIST', `${aliveIds.length} nick`, `Gộp thành công ${mergedApps.length} app Beta`, primaryStatus, 0);
    return $done({
      response: { status: primaryStatus, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: mergedApps, error: null }) },
    });
  }

  // MERGE — tự tráo nick chủ sở hữu khi mở/cài app cụ thể
  if (cfg.mode === 'MERGE') {
    const appMatch = url.match(/\/apps\/(\d+)/);
    const isSpecial = /\/(accept|withdraw|devices|session|notifications|status)/.test(url);
    if (appMatch && !isSpecial) {
      const appOwnerMap = readJson(KEYS.APPLIST, {});
      const ownerId = appOwnerMap[appMatch[1]];
      if (ownerId && accounts[ownerId] && ownerId !== reqUuid) {
        const owner = accounts[ownerId];
        const newHeaders = Object.assign({}, req.headers);
        delete newHeaders['If-None-Match'];
        delete newHeaders['if-none-match'];
        newHeaders['X-Session-Id'] = owner.xSessionId;
        newHeaders['x-session-id'] = owner.xSessionId;
        if (owner.xRequestId) { newHeaders['X-Request-Id'] = owner.xRequestId; newHeaders['x-request-id'] = owner.xRequestId; }
        newHeaders['X-Session-Digest'] = owner.xSessionDigest;
        newHeaders['x-session-digest'] = owner.xSessionDigest;
        if (owner.xAppleIMd) newHeaders['X-Apple-I-MD'] = owner.xAppleIMd;
        if (owner.xAppleIMdM) newHeaders['X-Apple-I-MD-M'] = owner.xAppleIMdM;
        const out = { url: reqUuid ? url.replace(UUID_RE, owner.id) : url, headers: newHeaders };
        if (modBody !== undefined) out.body = modBody;
        return $done(out);
      }
    }
  }

  if (modBody !== req.body) return $done({ body: modBody });
  return $done({});
}

function handleHttpResponse() {
  const url = ($request && $request.url) || '';
  const bodyStr = ($response && $response.body) || '';

  if (SANDBOX_HOST_RE.test(url)) {
    parseSandboxSubscriptionsReadOnly(bodyStr, $request && $request.headers);
    return $done({});
  }

  if (!bodyStr || bodyStr[0] !== '{') return $done({});
  const cfg = getConfig();
  let obj;
  try { obj = JSON.parse(bodyStr); } catch (_) { return $done({}); }
  let modified = false;

  if (/\/v1\/session\/authenticate/.test(url) && obj?.data?.accountId && $request?.headers) {
    const hint = obj.data.email || [obj.data.firstName, obj.data.lastName].filter(Boolean).join(' ') || '';
    upsertAccount(obj.data.accountId, $request.headers, { emailHint: hint });
  }
  if (cfg.universal && obj.error === null && obj.data) {
    if (/\/accounts\/[0-9a-f-]{36}\/apps$/i.test(url) && Array.isArray(obj.data)) {
      obj.data = patchAppsListUniversal(obj.data);
      modified = true;
    } else if (/\/apps\/\d+\/builds(\/\d+)?$/i.test(url)) {
      if (obj.data.currentBuild) { obj.data.currentBuild = modBuild(obj.data.currentBuild); modified = true; }
      if (Array.isArray(obj.data.builds)) { obj.data.builds = obj.data.builds.map(modBuild); modified = true; }
    } else if (/\/platforms\/.+\/trains\/.+\/builds$/i.test(url) && Array.isArray(obj.data)) {
      obj.data = obj.data.map(modBuild);
      modified = true;
    }
  }
  if (cfg.alwaysInstall && /\/accounts\/[0-9a-f-]{36}\/ru\//i.test(url) && obj?.data?.status === 'FULL') {
    obj.data.status = 'OPEN';
    if (obj.data.app) obj.data.app.eligibility = { status: 'NO_CRITERIA', criteria: null };
    modified = true;
  }

  return modified ? $done({ body: JSON.stringify(obj) }) : $done({});
}

// ============================================================================
// 6. WEB UI 4 TAB CHUẨN UI/UX PRO MAX (http://tf-hub.test/)
// ============================================================================
function jsonResp(data, status = 200) {
  return $done({
    response: { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) },
  });
}

function renderHtmlDashboard() {
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>TF Multi-Account Hub v${HUB_VERSION}</title>
<style>
  :root{--bg:#0b1120;--card:#151f32;--panel:#0f172a;--border:#26344d;--text:#f8fafc;--muted:#94a3b8;--accent:#38bdf8;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444;}
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;}
  body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-size:13.5px;line-height:1.45;}
  .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
  h1{font-size:17px;margin:0;color:var(--accent);letter-spacing:-0.2px;}
  .sub{font-size:11.5px;color:var(--muted);margin-bottom:10px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;}
  .kpi{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:8px 6px;text-align:center;}
  .kpi b{display:block;font-size:15px;color:var(--text);}
  .kpi span{font-size:10.5px;color:var(--muted);}
  .tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:12px;}
  .tab{padding:8px 4px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--muted);font-weight:700;font-size:11.5px;text-align:center;cursor:pointer;}
  .tab.active{background:var(--accent);color:#062033;border-color:var(--accent);}
  .panel{display:none;}.panel.active{display:block;}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;}
  .card h2{font-size:14.5px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;}
  .row{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
  label{font-size:11.5px;color:var(--muted);display:block;margin-bottom:3px;}
  input,select,textarea{width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--text);font-size:13px;}
  textarea{min-height:66px;font-family:ui-monospace,monospace;font-size:12px;}
  button{padding:7px 10px;border:0;border-radius:8px;background:var(--accent);color:#062033;font-weight:700;font-size:12px;cursor:pointer;}
  button.sec{background:#26344d;color:var(--text);}
  button.ok{background:var(--ok);color:#052e16;}
  button.warn{background:var(--warn);color:#451a03;}
  button.err{background:var(--err);color:#fff;}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:700;}
  .b-ok{background:#14532d;color:#86efac;}
  .b-warn{background:#78350f;color:#fde68a;}
  .b-err{background:#7f1d1d;color:#fca5a5;}
  .b-pin{background:#0c4a6e;color:#7dd3fc;}
  .item{border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:9px;background:var(--panel);}
  .kv{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all;background:#132038;padding:4px 7px;border-radius:6px;margin:3px 0;color:#cbd5e1;}
  .kv b{color:var(--accent);}
  table.logtbl{width:100%;border-collapse:collapse;font-size:11px;font-family:ui-monospace,monospace;}
  table.logtbl th,table.logtbl td{border-bottom:1px solid var(--border);padding:5px 4px;text-align:left;vertical-align:top;}
  table.logtbl th{color:var(--muted);font-family:inherit;font-size:11px;}
</style>
</head>
<body>
  <div class="hdr">
    <h1>✈️ TF Multi-Account Hub</h1>
    <span id="syncStat" class="badge b-ok">v${HUB_VERSION}</span>
  </div>
  <div class="sub">API Replay & Injection Core • Loon & Shadowrocket (A9 iOS 15.8.8) • Đồng bộ BoxJs</div>

  <div class="kpis">
    <div class="kpi"><b id="kAccs">0/0</b><span>Nick ALIVE</span></div>
    <div class="kpi"><b id="kLinks">0/0</b><span>Link OPEN</span></div>
    <div class="kpi"><b id="kSubs">0</b><span>Gói Sandbox</span></div>
    <div class="kpi"><b id="kMode">MERGE</b><span id="kCountry">US</span></div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="showTab(0)">🔗 Link TF</div>
    <div class="tab" onclick="showTab(1)">👥 Nick & API</div>
    <div class="tab" onclick="showTab(2)">💳 Sandbox</div>
    <div class="tab" onclick="showTab(3)">📊 Log (<span id="cntLogs">0</span>)</div>
  </div>

  <!-- TAB 1: LINK TESTFLIGHT CRUD + BULK ADD + AUTO CHECK + BATCH JOIN -->
  <div class="panel active" id="p0">
    <div class="card">
      <h2>➕ Thêm Link TestFlight (Lẻ hoặc Hàng Loạt)</h2>
      <label>Dán 1 hoặc nhiều Link / Mã 8 ký tự (cách nhau dấu phẩy hoặc xuống dòng)</label>
      <textarea id="lCode" placeholder="https://testflight.apple.com/join/LPQmtkUs&#10;Xh9VNQoA, 2mcx1R3I"></textarea>
      <div class="row" style="margin-top:6px">
        <div style="flex:1;min-width:140px"><input id="lName" placeholder="Tên gợi nhớ (tùy chọn khi thêm 1 link)"></div>
      </div>
      <div class="row" style="margin-bottom:0">
        <button class="ok" onclick="saveLink()">💾 Thêm & Lưu Link</button>
        <button onclick="runAct('checkLinks')">🔍 Quét Trạng Thái Tất Cả</button>
        <button class="warn" onclick="runAct('batchJoinOpen')">🎯 Tự Tham Gia Toàn Bộ Link OPEN</button>
      </div>
    </div>
    <div class="card">
      <h2>📋 Danh Sách Link Đang Theo Dõi</h2>
      <div id="linksList">Đang tải...</div>
    </div>
  </div>

  <!-- TAB 2: KHO APPLE ID, ANTI-2FA FINGERPRINT & API REPLAY -->
  <div class="panel" id="p1">
    <div class="card">
      <h2>⚙️ Cấu Hình API Replay, Lách iOS Cũ & Phá Vùng</h2>
      <div class="row">
        <div style="flex:1;min-width:130px">
          <label>Chế độ tráo nick</label>
          <select id="mode">
            <option value="MERGE">MERGE (Gộp mọi nick)</option>
            <option value="PIN">PIN (Khóa 1 nick)</option>
          </select>
        </div>
        <div style="flex:1;min-width:115px">
          <label>Vùng Storefront</label>
          <select id="country">
            <option value="US">🇺🇸 Mỹ (143441)</option>
            <option value="VN">🇻🇳 VN (143471)</option>
            <option value="JP">🇯🇵 Nhật (143462)</option>
            <option value="SG">🇸🇬 SG (143464)</option>
            <option value="TW">🇹🇼 Đài Loan (143470)</option>
            <option value="HK">🇭🇰 HK (143463)</option>
            <option value="GB">🇬🇧 Anh (143444)</option>
            <option value="AUTO">🇺🇳 Tự động</option>
          </select>
        </div>
        <div style="flex:0.6;min-width:85px">
          <label>Ping (phút)</label>
          <input id="keepAliveMin" type="number" min="5" value="30">
        </div>
      </div>
      <div class="row">
        <label style="display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="universal" style="width:auto"> Lách iOS cũ</label>
        <label style="display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="alwaysInstall" style="width:auto"> Ép nút Cài</label>
        <label style="display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="autoJoin" style="width:auto"> Auto-Join</label>
        <label style="display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="autoInstall" style="width:auto"> Auto /install</label>
        <label style="display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" id="autoUpdate" style="width:auto"> Auto Cập nhật</label>
      </div>
      <div class="row" style="margin-bottom:0">
        <button class="ok" onclick="saveCfg()">💾 Lưu Cấu Hình</button>
        <button onclick="runAct('pingAll')">💓 Ping Nuôi & Quét Cập Nhật Toàn Bộ</button>
      </div>
    </div>

    <div class="card">
      <h2>👥 Kho Apple ID & Tham Số Phiên (Anti-2FA)</h2>
      <div id="accList">Đang tải...</div>
      <details style="margin-top:8px">
        <summary style="cursor:pointer;color:var(--accent);font-weight:700">➕ Nạp tay Nick Apple ID</summary>
        <div style="margin-top:8px">
          <label>Tên gợi nhớ</label><input id="mAlias" placeholder="VD: Nick US Chính">
          <label>Account ID (UUID 36 ký tự)</label><input id="mId">
          <label>x-session-id</label><input id="mSid">
          <label>x-request-id</label><input id="mRid">
          <label>x-session-digest</label><input id="mDig">
          <button style="margin-top:8px" onclick="addManual()">➕ Lưu vào kho</button>
        </div>
      </details>
    </div>
  </div>

  <!-- TAB 3: SANDBOX SUBSCRIPTIONS -->
  <div class="panel" id="p2">
    <div class="card">
      <h2>💳 Gói Đăng Ký Kiểm Thử (StoreKit 1 & 2 — Chỉ Đọc)</h2>
      <div class="row">
        <button onclick="runAct('checkWatchlist')">🔔 Kiểm Tra Hạn Watchlist</button>
        <a href="itms-apps://apps.apple.com/account/subscriptions" style="text-decoration:none"><button class="sec" type="button">⚙️ Trang Thuê Bao iOS</button></a>
      </div>
      <div id="subsList">Đang tải...</div>
    </div>
  </div>

  <!-- TAB 4: TELEMETRY & ACTION LOGS -->
  <div class="panel" id="p3">
    <div class="card">
      <h2>📊 Bảng Log Trạng Thái Hoạt Động & Hành Động</h2>
      <div class="row">
        <select id="logFilter" onchange="renderLogs()" style="width:auto;min-width:130px">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="OK">✅ Chỉ OK</option>
          <option value="WARN">🟡 Chỉ WARN</option>
          <option value="ERR">🔴 Chỉ ERR</option>
        </select>
        <button class="sec" onclick="loadState()">🔄 Làm mới</button>
        <button class="err" onclick="clearLogs()">🗑️ Xóa Log</button>
      </div>
      <div style="overflow-x:auto">
        <table class="logtbl">
          <thead><tr><th>Giờ</th><th>TT</th><th>Hành động</th><th>Đối tượng</th><th>HTTP / ms</th><th>Chi tiết</th></tr></thead>
          <tbody id="logBody"></tbody>
        </table>
      </div>
    </div>
  </div>

<script>
const api = (p, b) => fetch(p, b ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)} : {}).then(r=>r.json());
let LAST_LOGS = [];
function setStat(t, ok=true){const e=document.getElementById('syncStat');e.textContent=t;e.className='badge '+(ok?'b-ok':'b-err');}
function showTab(i){document.querySelectorAll('.tab').forEach((t,idx)=>t.classList.toggle('active',idx===i));document.querySelectorAll('.panel').forEach((p,idx)=>p.classList.toggle('active',idx===i));}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function renderLogs(){
  const f = document.getElementById('logFilter').value;
  const rows = LAST_LOGS.filter(x => f==='ALL' || x.status===f);
  document.getElementById('logBody').innerHTML = !rows.length
    ? '<tr><td colspan="6" style="color:#94a3b8">Chưa có bản ghi log nào.</td></tr>'
    : rows.map(l => {
        const bc = l.status==='OK'?'b-ok':(l.status==='ERR'?'b-err':(l.status==='WARN'?'b-warn':'b-pin'));
        return '<tr><td>'+esc(l.ts)+'</td><td><span class="badge '+bc+'">'+esc(l.status)+'</span></td><td><b>'+esc(l.action)+'</b></td><td>'+esc(l.target)+'</td><td>'+(l.httpStatus||'-')+' / '+l.durationMs+'ms</td><td>'+esc(l.detail)+'</td></tr>';
      }).join('');
}

async function loadState(){
  setStat('Đang tải...');
  const s = await api('/api/state');
  document.getElementById('mode').value = s.config.mode;
  document.getElementById('country').value = s.config.country;
  document.getElementById('universal').checked = s.config.universal;
  document.getElementById('alwaysInstall').checked = s.config.alwaysInstall;
  document.getElementById('autoJoin').checked = s.config.autoJoin;
  document.getElementById('autoInstall').checked = s.config.autoInstall;
  document.getElementById('autoUpdate').checked = s.config.autoUpdate;
  document.getElementById('keepAliveMin').value = s.config.keepAliveMin;

  const accs = Object.values(s.accounts || {});
  const links = Object.values(s.links || {});
  const aliveCnt = accs.filter(a => a.status !== 'EXPIRED_401').length;
  const openCnt = links.filter(l => l.status === 'OPEN').length;
  const subRows = [];
  for (const ok of Object.keys(s.subs || {})) for (const pid of Object.keys(s.subs[ok] || {})) subRows.push(s.subs[ok][pid]);

  document.getElementById('kAccs').textContent = aliveCnt + '/' + accs.length;
  document.getElementById('kLinks').textContent = openCnt + '/' + links.length;
  document.getElementById('kSubs').textContent = subRows.length;
  document.getElementById('kMode').textContent = s.config.mode;
  document.getElementById('kCountry').textContent = 'SF: ' + s.config.country;

  document.getElementById('linksList').innerHTML = !links.length
    ? '<div class="sub">Chưa có link nào. Dán link hoặc mã ở khung trên rồi bấm Lưu.</div>'
    : links.map(l => {
        const bc = l.status==='OPEN'?'b-ok':(l.status==='FULL'||l.status==='CLOSED'?'b-err':'b-warn');
        const t = l.lastCheck ? new Date(l.lastCheck).toLocaleTimeString('vi-VN') : '-';
        return '<div class="item">'
          + '<div class="row" style="justify-content:space-between"><div><b>'+esc(l.name)+'</b> (<code>'+esc(l.code)+'</code>) <span class="badge '+bc+'">'+esc(l.status)+'</span></div><span class="sub" style="margin:0">Quét: '+t+'</span></div>'
          + (l.joinedBy && l.joinedBy.length ? '<div class="sub">Đã tham gia: '+esc(l.joinedBy.join(', '))+'</div>' : '')
          + '<div class="row" style="margin-bottom:0">'
          + '<button onclick="runAct(\\'checkOne\\',{code:\\''+esc(l.code)+'\\'})">🔍 Check</button>'
          + '<button class="ok" onclick="runAct(\\'joinOne\\',{code:\\''+esc(l.code)+'\\'})">🎯 Bắn Tất Cả Nick Vào</button>'
          + '<a href="itms-beta://testflight.apple.com/join/'+esc(l.code)+'" style="text-decoration:none"><button class="sec" type="button">📲 Mở TF</button></a>'
          + '<button class="sec" onclick="editLink(\\''+esc(l.code)+'\\',\\''+esc(l.name).replace(/'/g,'')+'\\')">✏️</button>'
          + '<button class="err" onclick="delLink(\\''+esc(l.code)+'\\')">🗑️</button>'
          + '</div></div>';
      }).join('');

  document.getElementById('accList').innerHTML = !accs.length
    ? '<div class="sub">Chưa có nick nào. Mở app TestFlight để Hub tự chụp bộ tham số đầy đủ.</div>'
    : accs.map(a => {
        const isPin = s.config.activeId === a.id;
        const alive = a.status !== 'EXPIRED_401';
        const fpCount = [a.xSessionId, a.xRequestId, a.xSessionDigest, a.xDsid, a.xAppleIMd, a.deviceId, a.cookie].filter(Boolean).length;
        const appsHtml = (a.apps || []).slice(0, 10).map(ap =>
          '<div class="kv">📱 <b>'+esc(ap.name)+'</b> v'+esc(ap.version)+' ('+esc(ap.buildVer)+') '
          + (ap.adamId && ap.buildId ? '<button class="sec" style="padding:2px 6px;font-size:10px;margin-left:6px" onclick="runAct(\\'installApp\\',{accountId:\\''+a.id+'\\',appId:\\''+ap.adamId+'\\',buildId:\\''+ap.buildId+'\\'})">⬇️ Replay /install</button>' : '')
          + '</div>'
        ).join('');
        return '<div class="item">'
          + '<div class="row" style="justify-content:space-between"><div><b>'+esc(a.alias)+'</b> '+(isPin?'<span class="badge b-pin">PIN</span> ':'')
          + '<span class="badge '+(alive?'b-ok':'b-err')+'">'+(alive?'ALIVE':'401 HẾT HẠN')+'</span> <span class="badge b-pin">FP '+fpCount+'/7</span></div>'
          + '<span class="sub" style="margin:0">Apps: '+(a.appCount||0)+'</span></div>'
          + '<div class="kv"><b>accountId:</b> '+esc(a.id)+'</div>'
          + '<div class="kv"><b>x-session-id:</b> '+esc(a.xSessionId)+'</div>'
          + '<div class="kv"><b>x-request-id:</b> '+esc(a.xRequestId||'-')+'</div>'
          + '<div class="kv"><b>x-session-digest:</b> '+esc(a.xSessionDigest)+'</div>'
          + '<div class="kv"><b>DSID / Device / MD:</b> '+esc(a.xDsid||'-')+' | '+esc(a.deviceId||'-')+' | '+(a.xAppleIMd?'CÓ MD':'Chưa có MD')+'</div>'
          + appsHtml
          + '<div class="row" style="margin-top:6px;margin-bottom:0">'
          + '<button onclick="pinAcc(\\''+a.id+'\\')">📌 Ghim</button>'
          + '<button class="sec" onclick="runAct(\\'pingOne\\',{id:\\''+a.id+'\\'})">💓 Ping & Quét Cập Nhật</button>'
          + '<button class="sec" onclick="renameAcc(\\''+a.id+'\\',\\''+esc(a.alias).replace(/'/g,'')+'\\')">✏️</button>'
          + '<button class="err" onclick="delAcc(\\''+a.id+'\\')">🗑️</button>'
          + '</div></div>';
      }).join('');

  const watchSet = new Set(s.watchlist || []);
  document.getElementById('subsList').innerHTML = !subRows.length
    ? '<div class="sub">Chưa ghi nhận gói Sandbox nào. Mở app TestFlight có gói đăng ký kiểm thử để Hub tự đọc.</div>'
    : subRows.map(r => {
        const wKey = r.ownerKey + '::' + r.productId;
        const watched = watchSet.has(wKey);
        const remainMin = r.expiresMs ? Math.round((r.expiresMs - Date.now()) / 60000) : 0;
        const expTxt = r.expiresMs ? (remainMin > 0 ? 'Còn ~'+remainMin+'p' : 'Hết hạn') : 'Không rõ';
        const renewOn = r.autoRenewStatus === '1';
        return '<div class="item">'
          + '<div class="row" style="justify-content:space-between"><div><b>'+esc(r.productId)+'</b> <span class="badge '+(renewOn?'b-ok':'b-err')+'">'+(renewOn?'AutoRenew BẬT':'AutoRenew TẮT')+'</span></div>'
          + '<span class="badge '+(remainMin>5?'b-ok':'b-warn')+'">'+expTxt+'</span></div>'
          + '<div class="kv"><b>Nick:</b> '+esc(r.ownerLabel)+' ('+esc(r.source)+') • <b>origTx:</b> '+esc(r.originalTxId||'-')+'</div>'
          + '<div class="row" style="margin-bottom:0"><button class="'+(watched?'warn':'sec')+'" onclick="toggleWatch(\\''+esc(wKey)+'\\')">'+(watched?'⭐ Đang theo dõi gia hạn':'☆ Bật nhắc gia hạn')+'</button></div></div>';
      }).join('');

  LAST_LOGS = s.logs || [];
  document.getElementById('cntLogs').textContent = LAST_LOGS.length;
  renderLogs();
  setStat('v${HUB_VERSION}');
}

async function saveCfg(){
  await api('/api/config', {
    mode: document.getElementById('mode').value,
    country: document.getElementById('country').value,
    universal: document.getElementById('universal').checked,
    alwaysInstall: document.getElementById('alwaysInstall').checked,
    autoJoin: document.getElementById('autoJoin').checked,
    autoInstall: document.getElementById('autoInstall').checked,
    autoUpdate: document.getElementById('autoUpdate').checked,
    keepAliveMin: Number(document.getElementById('keepAliveMin').value) || 30,
  });
  await loadState();
}
async function saveLink(){
  const raw = document.getElementById('lCode').value.trim();
  const name = document.getElementById('lName').value.trim();
  if(!raw) return alert('Nhập ít nhất 1 link hoặc mã TestFlight');
  await api('/api/link/save', { raw, name });
  document.getElementById('lCode').value=''; document.getElementById('lName').value='';
  await loadState();
}
async function editLink(code, oldName){ const n = prompt('Sửa tên cho '+code+':', oldName); if(n&&n.trim()){ await api('/api/link/save',{raw:code,name:n.trim()}); await loadState(); } }
async function delLink(code){ if(confirm('Xóa link '+code+'?')){ await api('/api/link/delete',{code}); await loadState(); } }
async function pinAcc(id){ await api('/api/pin',{id}); await loadState(); }
async function renameAcc(id, oldName){ const a = prompt('Đổi tên nick:', oldName); if(a&&a.trim()){ await api('/api/rename',{id,alias:a.trim()}); await loadState(); } }
async function delAcc(id){ if(confirm('Xóa nick '+id+'?')){ await api('/api/delete',{id}); await loadState(); } }
async function toggleWatch(k){ await api('/api/sub/watch',{key:k}); await loadState(); }
async function clearLogs(){ await api('/api/logs/clear',{}); await loadState(); }
async function addManual(){
  const r = await api('/api/manual', {
    alias: document.getElementById('mAlias').value.trim(),
    id: document.getElementById('mId').value.trim(),
    xSessionId: document.getElementById('mSid').value.trim(),
    xRequestId: document.getElementById('mRid').value.trim(),
    xSessionDigest: document.getElementById('mDig').value.trim(),
  });
  if(!r.ok) alert(r.error || 'Thiếu UUID/Token');
  await loadState();
}
async function runAct(action, extra={}){
  setStat('Đang chạy...');
  const r = await api('/api/action', Object.assign({ action }, extra));
  await loadState();
  alert('Kết quả '+action+':\\n'+JSON.stringify(r.result, null, 2));
}
loadState();
</script>
</body>
</html>`;
  return $done({ response: { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: html } });
}

async function handleWebUiRequest() {
  const url = $request.url || '';
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0] || '/';
  let body = {};
  if ($request.body) { try { body = JSON.parse($request.body); } catch (_) {} }

  if (path === '/' || path === '/index.html') return renderHtmlDashboard();

  if (path === '/api/state') {
    return jsonResp({
      version: HUB_VERSION,
      config: getConfig(),
      links: getLinksMap(),
      accounts: readJson(KEYS.ACCOUNTS, {}),
      subs: readJson(KEYS.SUBS, {}),
      watchlist: readJson(KEYS.WATCHLIST, []),
      logs: readJson(KEYS.ACTION_LOGS, []),
    });
  }

  if (path === '/api/config') {
    if (body.mode) storeWrite(KEYS.MODE, body.mode === 'PIN' ? 'PIN' : 'MERGE');
    if (body.country) storeWrite(KEYS.COUNTRY, String(body.country).toUpperCase());
    if (typeof body.universal === 'boolean') storeWrite(KEYS.UNIVERSAL, String(body.universal));
    if (typeof body.alwaysInstall === 'boolean') storeWrite(KEYS.ALWAYS_INSTALL, String(body.alwaysInstall));
    if (typeof body.autoJoin === 'boolean') storeWrite(KEYS.AUTO_JOIN, String(body.autoJoin));
    if (typeof body.autoInstall === 'boolean') storeWrite(KEYS.AUTO_INSTALL, String(body.autoInstall));
    if (typeof body.autoUpdate === 'boolean') storeWrite(KEYS.AUTO_UPDATE, String(body.autoUpdate));
    if (body.keepAliveMin) storeWrite(KEYS.KEEPALIVE_MIN, String(Math.max(5, Number(body.keepAliveMin) || 30)));
    recordAction('OK', 'CONFIG_SAVE', 'Web UI', `mode=${body.mode}, country=${body.country}, keepAlive=${body.keepAliveMin}m`, 200, 0);
    return jsonResp({ ok: true });
  }

  if (path === '/api/link/save') {
    const codes = extractCodes(body.raw);
    if (!codes.length) return jsonResp({ ok: false, error: 'Mã link không hợp lệ' }, 400);
    const links = getLinksMap();
    for (const c of codes) {
      const prev = links[c] || { code: c, status: 'UNKNOWN', lastCheck: 0, joinedBy: [] };
      const customName = codes.length === 1 && body.name ? body.name : prev.name;
      links[c] = Object.assign(prev, { code: c, name: customName || `Beta ${c}`, note: body.note || prev.note || '' });
    }
    saveLinksMap(links);
    recordAction('OK', 'LINK_SAVE', `${codes.length} mã`, codes.join(', '), 200, 0);
    return jsonResp({ ok: true, codes });
  }

  if (path === '/api/link/delete' && body.code) {
    const links = getLinksMap();
    delete links[body.code];
    saveLinksMap(links);
    recordAction('WARN', 'LINK_DEL', body.code, 'Đã xóa khỏi danh sách theo dõi', 200, 0);
    return jsonResp({ ok: true });
  }

  if (path === '/api/pin' && body.id) {
    storeWrite(KEYS.ACTIVE_ID, String(body.id).toLowerCase());
    storeWrite(KEYS.MODE, 'PIN');
    recordAction('OK', 'PIN_ACC', String(body.id).slice(0, 8), 'Đã chuyển sang chế độ PIN', 200, 0);
    return jsonResp({ ok: true });
  }

  if (path === '/api/rename' && body.id && body.alias) {
    const accounts = readJson(KEYS.ACCOUNTS, {});
    if (accounts[body.id]) { accounts[body.id].alias = String(body.alias).slice(0, 40); storeWrite(KEYS.ACCOUNTS, accounts); }
    return jsonResp({ ok: true });
  }

  if (path === '/api/delete' && body.id) {
    const accounts = readJson(KEYS.ACCOUNTS, {});
    delete accounts[body.id];
    storeWrite(KEYS.ACCOUNTS, accounts);
    if (storeRead(KEYS.ACTIVE_ID, '') === body.id) storeWrite(KEYS.ACTIVE_ID, '');
    recordAction('WARN', 'ACC_DEL', String(body.id).slice(0, 8), 'Đã xóa nick khỏi kho', 200, 0);
    return jsonResp({ ok: true });
  }

  if (path === '/api/manual') {
    const saved = upsertAccount(body.id, {}, body);
    if (!saved) return jsonResp({ ok: false, error: 'Cần UUID 36 ký tự, x-session-id và x-session-digest.' }, 400);
    return jsonResp({ ok: true, account: saved });
  }

  if (path === '/api/sub/watch' && body.key) {
    const watch = readJson(KEYS.WATCHLIST, []);
    const idx = watch.indexOf(body.key);
    if (idx >= 0) watch.splice(idx, 1);
    else watch.push(body.key);
    storeWrite(KEYS.WATCHLIST, watch);
    return jsonResp({ ok: true, watched: idx < 0 });
  }

  if (path === '/api/logs/clear') {
    storeWrite(KEYS.ACTION_LOGS, []);
    return jsonResp({ ok: true });
  }

  if (path === '/api/action') {
    if (body.action === 'pingAll') return jsonResp({ ok: true, result: await pingAccounts(null, true, true) });
    if (body.action === 'pingOne' && body.id) return jsonResp({ ok: true, result: await pingAccounts([body.id], true, true) });
    if (body.action === 'checkLinks') return jsonResp({ ok: true, result: await checkLinksStatus(null) });
    if (body.action === 'checkOne' && body.code) return jsonResp({ ok: true, result: await checkLinksStatus([body.code]) });
    if (body.action === 'batchJoinOpen') return jsonResp({ ok: true, result: await batchJoinLinks({ skipPublicCheck: false, stopOnFirst: false }) });
    if (body.action === 'joinOne' && body.code) return jsonResp({ ok: true, result: await batchJoinLinks({ codes: [body.code], skipPublicCheck: true, stopOnFirst: false }) });
    if (body.action === 'installApp' && body.accountId && body.appId && body.buildId) {
      const accounts = readJson(KEYS.ACCOUNTS, {});
      const acc = accounts[body.accountId];
      if (!acc) return jsonResp({ ok: false, error: 'Không tìm thấy nick' }, 404);
      return jsonResp({ ok: true, result: await sendInstallApi(acc, body.appId, body.buildId, getConfig().country) });
    }
    if (body.action === 'checkWatchlist') return jsonResp({ ok: true, result: checkWatchlistRenewals() });
    return jsonResp({ ok: false, error: 'Unknown action' }, 400);
  }

  return jsonResp({ error: 'Not Found' }, 404);
}

// ============================================================================
// 7. ĐIỂM VÀO CHÍNH (WEB UI / MITM REQ / MITM RESP / CRON)
// ============================================================================
async function main() {
  if (isResp) return handleHttpResponse();
  if (isReq) {
    const url = ($request && $request.url) || '';
    if (url.includes(`://${HUB_HOST}`)) return await handleWebUiRequest();
    return await handleTestFlightRequest();
  }
  // Cron ngầm: Nuôi token + Quét cập nhật tự gửi /install + Săn & tham gia link + Kiểm tra Watchlist
  const cfg = getConfig();
  await pingAccounts(null, false, true);
  if (cfg.autoJoin && Object.keys(getLinksMap()).length > 0) {
    await batchJoinLinks({ skipPublicCheck: false, stopOnFirst: false });
  }
  checkWatchlistRenewals();
  $done();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HUB_VERSION, KEYS, STOREFRONT_MAP, extractCodes, patchStorefrontInBody, modBuild, decodeJwsPayload };
} else {
  main().catch((err) => {
    recordAction('ERR', 'RUNTIME', 'main', String(err && err.message ? err.message : err), 0, 0);
    try { $done({}); } catch (_) {}
  });
}
