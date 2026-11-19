/**
 * TF_MultiAccount_Hub.js — Trung Tâm All-in-One 3 Tab (NobyDa + iRingo + CRUD Link + Batch Actions + StoreKit 1/2 Sandbox)
 * Phiên bản: 2.0.1.0 — Tương thích 100% Loon (.plugin) & Shadowrocket (.sgmodule), tối ưu RAM cho A9 iOS 15.8.8 (SSL Kill Switch 3)
 * Giao diện Web nội bộ 3 Tab: http://tf-hub.test/ | Đồng bộ BoxJs: TF_HUB_*
 * - Tab 1: Quản lý Thêm / Sửa / Xóa / Kiểm tra trạng thái Link TestFlight + Bắn hàng loạt nick tham gia
 * - Tab 2: Kho Đa Tài Khoản Apple ID (UUID + 3 Token), Nuôi Keep-Alive chống die 401, Tráo MERGE/PIN, Quét cập nhật & Lệnh /install, Lách iOS cũ (modBuild) & Phá vùng Storefront
 * - Tab 3: Kiểm tra trạng thái gói đăng ký kiểm thử StoreKit 1 & 2 (Sandbox IAP — Chỉ đọc $done({})) theo từng Apple ID + Watchlist nhắc gia hạn
 */
'use strict';

const HUB_VERSION = '2.0.1.0';
const HUB_HOST = 'tf-hub.test';
const TF_ORIGIN = 'https://testflight.apple.com';

const KEYS = {
  ACCOUNTS: 'TF_HUB_ACCOUNTS',             // { [uuid]: { id, alias, xSessionId, xRequestId, xSessionDigest, ua, status, fail401, lastSeen, lastPing, appCount, apps: [...] } }
  APPLIST: 'TF_HUB_APPLIST',               // { [appAdamId]: uuid }
  LINKS: 'TF_HUB_LINKS',                   // { [code]: { code, name, note, status, lastCheck, joinedBy: [] } }
  SUBS: 'TF_HUB_SUBS',                     // { [ownerKey]: { [productId]: { ownerKey, ownerLabel, productId, originalTxId, expiresMs, autoRenewStatus, environment, source, updatedAt } } }
  WATCHLIST: 'TF_HUB_WATCHLIST',           // Array of "ownerKey::productId"
  MODE: 'TF_HUB_MODE',                     // 'MERGE' | 'PIN'
  ACTIVE_ID: 'TF_HUB_ACTIVE_ID',           // UUID đang ghim
  COUNTRY: 'TF_HUB_COUNTRY',               // 'US' | 'VN' | 'JP' | ... | 'AUTO'
  UNIVERSAL: 'TF_HUB_UNIVERSAL',           // 'true' | 'false'
  ALWAYS_INSTALL: 'TF_HUB_ALWAYS_INSTALL', // 'true' | 'false'
  AUTO_JOIN: 'TF_HUB_AUTO_JOIN',           // 'true' | 'false'
  AUTO_INSTALL: 'TF_HUB_AUTO_INSTALL',     // 'true' | 'false'
  KEEPALIVE_MIN: 'TF_HUB_KEEPALIVE_MIN',   // Phút (mặc định 30)
  JOIN_CODES: 'TF_HUB_JOIN_CODES',         // Đồng bộ chuỗi mã cho BoxJs
  LOGS: 'TF_HUB_LOGS',                     // Tối đa 35 dòng log
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
// 1. TIỆN ÍCH LƯU TRỮ, HTTP & GIẢI MÃ BASE64URL (STOREKIT 2 JWS)
// ============================================================================
function storeRead(key, fallback = '') {
  try {
    if (typeof $persistentStore !== 'undefined') {
      const v = $persistentStore.read(key);
      return v === null || v === undefined ? fallback : v;
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

function readBool(key, def) {
  const r = String(storeRead(key, '')).trim().toLowerCase();
  if (r === 'true' || r === '1') return true;
  if (r === 'false' || r === '0') return false;
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

function addLog(level, msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] [${level}] ${msg}`;
  try { console.log(`[TF-Hub] ${line}`); } catch (_) {}
  const logs = readJson(KEYS.LOGS, []);
  if (!Array.isArray(logs)) return;
  logs.unshift(line);
  if (logs.length > 35) logs.length = 35;
  storeWrite(KEYS.LOGS, logs);
}

function lowerHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const k of Object.keys(headers)) out[k.toLowerCase()] = headers[k];
  return out;
}

function httpCall(method, opts) {
  return new Promise((resolve) => {
    if (typeof $httpClient === 'undefined') {
      return resolve({ error: 'No $httpClient', status: 0, headers: {}, body: '' });
    }
    const reqOpts = {
      url: opts.url,
      headers: Object.assign({}, opts.headers || {}),
      timeout: opts.timeout || 15,
    };
    if (opts.body !== undefined) reqOpts.body = opts.body;
    reqOpts['X-Surge-Skip-Scripting'] = true;
    reqOpts.headers['X-TF-Hub-Internal'] = '1';

    const fn = $httpClient[method.toLowerCase()];
    if (!fn) return resolve({ error: `Unsupported ${method}`, status: 0, headers: {}, body: '' });
    fn(reqOpts, (err, resp, data) => {
      if (err) return resolve({ error: String(err), status: 0, headers: {}, body: '' });
      resolve({
        error: null,
        status: (resp && (resp.status || resp.statusCode)) || 0,
        headers: (resp && resp.headers) || {},
        body: data || '',
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
  // Tự đồng bộ ngược từ TF_HUB_JOIN_CODES (nếu người dùng nhập qua BoxJs)
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
  return {
    mode: storeRead(KEYS.MODE, 'MERGE') === 'PIN' ? 'PIN' : 'MERGE',
    activeId: storeRead(KEYS.ACTIVE_ID, '').trim().toLowerCase(),
    country: (storeRead(KEYS.COUNTRY, 'US') || 'US').toUpperCase(),
    universal: readBool(KEYS.UNIVERSAL, true),
    alwaysInstall: readBool(KEYS.ALWAYS_INSTALL, true),
    autoJoin: readBool(KEYS.AUTO_JOIN, true),
    autoInstall: readBool(KEYS.AUTO_INSTALL, false),
    keepAliveMin: Math.max(5, Number(storeRead(KEYS.KEEPALIVE_MIN, '30')) || 30),
  };
}

// ============================================================================
// 2. KHO ĐA TÀI KHOẢN & LÁCH iOS CŨ / PHÁ VÙNG
// ============================================================================
function upsertAccount(uuid, headersObj, extra = {}) {
  if (!uuid || !UUID_RE.test(uuid)) return null;
  const id = uuid.toLowerCase();
  const h = lowerHeaders(headersObj);
  const xSessionId = h['x-session-id'] || extra.xSessionId || '';
  const xRequestId = h['x-request-id'] || extra.xRequestId || '';
  const xSessionDigest = h['x-session-digest'] || extra.xSessionDigest || '';
  const ua = h['user-agent'] || extra.ua || '';
  if (!xSessionId || !xSessionDigest) return null;

  const accounts = readJson(KEYS.ACCOUNTS, {});
  const isNew = !accounts[id];
  const prev = accounts[id] || {};
  const count = Object.keys(accounts).length + (isNew ? 1 : 0);

  accounts[id] = {
    id,
    alias: extra.alias || prev.alias || `Apple ID #${count}`,
    xSessionId,
    xRequestId: xRequestId || prev.xRequestId || '',
    xSessionDigest,
    ua: ua || prev.ua || 'TestFlight/3.5.1 (iPhone; iOS 15.8.8; Scale/2.00)',
    status: 'ALIVE',
    fail401: 0,
    lastSeen: Date.now(),
    lastPing: prev.lastPing || Date.now(),
    appCount: typeof extra.appCount === 'number' ? extra.appCount : (prev.appCount || 0),
    apps: Array.isArray(extra.apps) ? extra.apps : (prev.apps || []),
  };
  storeWrite(KEYS.ACCOUNTS, accounts);
  if (isNew) {
    addLog('INFO', `Đã lưu nick mới: ${accounts[id].alias} (${id.slice(0, 8)}...)`);
    notify('TF Multi-Account Hub', 'Đã chụp nick Apple ID mới', `${accounts[id].alias}\nUUID: ${id}`, `http://${HUB_HOST}/`);
  }
  return accounts[id];
}

function buildAuthHeaders(acc, baseHeaders = {}) {
  const h = lowerHeaders(baseHeaders);
  const out = {};
  for (const k of Object.keys(h)) {
    if (k === 'if-none-match' || k === 'content-length' || k === 'host') continue;
    out[k] = h[k];
  }
  out['x-session-id'] = acc.xSessionId;
  if (acc.xRequestId) out['x-request-id'] = acc.xRequestId;
  out['x-session-digest'] = acc.xSessionDigest;
  if (!out['user-agent']) out['user-agent'] = acc.ua || 'TestFlight/3.5.1 (iPhone; iOS 15.8.8; Scale/2.00)';
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
// 3. QUẢN LÝ LINK, NUÔI TOKEN & HÀNH ĐỘNG HÀNG LOẠT (PING / SNIPE / INSTALL)
// ============================================================================
async function pingAccount(acc) {
  const url = `${TF_ORIGIN}/v3/accounts/${acc.id}/apps`;
  const r = await httpCall('GET', { url, headers: buildAuthHeaders(acc), timeout: 12 });
  const accounts = readJson(KEYS.ACCOUNTS, {});
  const cur = accounts[acc.id] || acc;

  if (r.status === 200 && r.body) {
    let appsSummary = cur.apps || [];
    try {
      const parsed = JSON.parse(r.body);
      if (Array.isArray(parsed.data)) {
        appsSummary = parsed.data
          .filter((a) => a && a.previouslyTested !== true)
          .slice(0, 25)
          .map((a) => {
            const iosPlat = Array.isArray(a.platforms) ? a.platforms.find((p) => p.name === 'ios') || a.platforms[0] : null;
            const b = iosPlat && iosPlat.build ? iosPlat.build : {};
            return {
              adamId: String(a.appAdamId || ''),
              name: a.name || 'Unknown',
              buildId: String(b.id || ''),
              version: b.cfBundleShortVersion || b.version || '',
              buildVer: b.cfBundleVersion || '',
            };
          });
      }
    } catch (_) {}
    cur.status = 'ALIVE';
    cur.fail401 = 0;
    cur.lastPing = Date.now();
    cur.appCount = appsSummary.length;
    cur.apps = appsSummary;
    accounts[acc.id] = cur;
    storeWrite(KEYS.ACCOUNTS, accounts);
    return { id: acc.id, alias: cur.alias, ok: true, status: 200, appCount: appsSummary.length };
  }

  if (r.status === 401) {
    cur.fail401 = (cur.fail401 || 0) + 1;
    cur.lastPing = Date.now();
    if (cur.fail401 >= 2) {
      cur.status = 'EXPIRED_401';
      notify('TF Hub — Token Hết Hạn (401)', cur.alias, `UUID ${acc.id.slice(0, 8)}... cần mở TestFlight nạp lại phiên.`, `http://${HUB_HOST}/`);
    }
    accounts[acc.id] = cur;
    storeWrite(KEYS.ACCOUNTS, accounts);
    addLog('WARN', `Ping 401 (${cur.fail401}/2): ${cur.alias}`);
    return { id: acc.id, alias: cur.alias, ok: false, status: 401 };
  }

  addLog('WARN', `Ping lỗi (${r.status || r.error}): ${cur.alias}`);
  return { id: acc.id, alias: cur.alias, ok: false, status: r.status || 0 };
}

async function pingAccounts(targetIds = null, force = false) {
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
    results.push(await pingAccount(acc));
  }
  return results;
}

async function checkPublicSlot(tfCode) {
  const r = await httpCall('GET', {
    url: `${TF_ORIGIN}/join/${tfCode}`,
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iOS 15_8_8 like Mac OS X)' },
    timeout: 8,
  });
  if (r.error || r.status !== 200 || !r.body) return 'ERROR';
  if (/This beta is full|không nhận thêm người kiểm tra|已满/i.test(r.body)) return 'FULL';
  if (/isn't accepting any new testers|không chấp nhận|不接受任何新测试员/i.test(r.body)) return 'CLOSED';
  if (/Start Testing|To join the .* beta|Bắt đầu kiểm tra|开始测试/i.test(r.body)) return 'OPEN';
  return 'UNKNOWN';
}

async function checkLinksStatus(targetCodes = null) {
  const links = getLinksMap();
  const codes = Array.isArray(targetCodes) && targetCodes.length ? targetCodes : Object.keys(links);
  const out = [];
  for (const code of codes) {
    if (!links[code]) continue;
    const st = await checkPublicSlot(code);
    links[code].status = st;
    links[code].lastCheck = Date.now();
    out.push({ code, name: links[code].name, status: st });
  }
  saveLinksMap(links);
  return out;
}

async function sendInstallApi(acc, appId, buildId, countryCode) {
  const sf = STOREFRONT_MAP[countryCode] || '143441';
  const url = `${TF_ORIGIN}/v3/accounts/${acc.id}/apps/${appId}/builds/${buildId}/install`;
  const r = await httpCall('POST', {
    url,
    headers: Object.assign(buildAuthHeaders(acc), { 'content-type': 'application/json' }),
    body: JSON.stringify({ storefrontId: `${sf}-19,29` }),
    timeout: 12,
  });
  addLog(r.status === 200 ? 'OK' : 'WARN', `[${acc.alias}] /install app ${appId} (build ${buildId}, SF ${sf}) ➔ HTTP ${r.status}`);
  return { ok: r.status === 200, status: r.status, appId, buildId, account: acc.alias };
}

async function tryAcceptForAccount(acc, tfCode, cfg) {
  const acceptUrl = `${TF_ORIGIN}/v3/accounts/${acc.id}/ru/${tfCode}/accept`;
  const r = await httpCall('POST', {
    url: acceptUrl,
    headers: Object.assign(buildAuthHeaders(acc), { 'content-type': 'application/json' }),
    body: '{}',
    timeout: 12,
  });
  if (r.status === 200) {
    addLog('OK', `[${acc.alias}] Tham gia thành công ${tfCode}!`);
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
  addLog('INFO', `[${acc.alias}] Accept ${tfCode} ➔ HTTP ${r.status}`);
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
      slotState = await checkPublicSlot(code);
      if (links[code]) {
        links[code].status = slotState;
        links[code].lastCheck = Date.now();
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

  // 1) StoreKit 1: verifyReceipt (latest_receipt_info + pending_renewal_info)
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

  // 2) StoreKit 2: Quét mọi chuỗi JWS ES256 (eyJ...) trong phản hồi Sandbox
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

  if (count > 0) addLog('OK', `Đã ghi nhận chỉ đọc ${count} bản ghi gói Sandbox StoreKit`);
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
        ? `Đã hết hạn (${rec.ownerLabel}) — autoRenew=${rec.autoRenewStatus}. Bấm mở trang quản lý để tái kích hoạt.`
        : `Còn ~${remainMin} phút (${rec.ownerLabel}) — autoRenew=${rec.autoRenewStatus}.`;
      notify('TF Hub — Nhắc Gia Hạn Sandbox 💳', rec.productId, msg, 'itms-apps://apps.apple.com/account/subscriptions');
      alerted.push({ ownerKey, productId, remainMin, autoRenewStatus: rec.autoRenewStatus });
    }
  }
  return alerted;
}

// ============================================================================
// 5. MITM REQUEST & RESPONSE HANDLERS
// ============================================================================
async function handleTestFlightRequest() {
  const req = $request;
  const reqHeaders = lowerHeaders(req.headers);
  if (reqHeaders['x-tf-hub-internal'] === '1') return $done({});

  const cfg = getConfig();
  const url = req.url;
  const uuidMatch = url.match(/\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  const reqUuid = uuidMatch ? uuidMatch[1].toLowerCase() : '';

  if (reqUuid && reqHeaders['x-session-id'] && reqHeaders['x-session-digest']) {
    upsertAccount(reqUuid, req.headers);
  }

  let modBody = req.body;
  if (modBody && (/\/v1\/session\/authenticate/.test(url) || /\/install$/.test(url))) {
    modBody = patchStorefrontInBody(modBody, cfg.country);
  }

  const accounts = readJson(KEYS.ACCOUNTS, {});
  const accountIds = Object.keys(accounts);

  // Chế độ PIN (kiểu iRingo)
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
      if (pinned.xRequestId) {
        newHeaders['X-Request-Id'] = pinned.xRequestId;
        newHeaders['x-request-id'] = pinned.xRequestId;
      }
      newHeaders['X-Session-Digest'] = pinned.xSessionDigest;
      newHeaders['x-session-digest'] = pinned.xSessionDigest;
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
      const r = await httpCall('GET', { url: url.replace(UUID_RE, id), headers: buildAuthHeaders(acc, req.headers), timeout: 12 });
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
    return $done({
      response: { status: primaryStatus, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: mergedApps, error: null }) },
    });
  }

  // MERGE — tự tráo nick chủ app khi cài/xem build
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
        if (owner.xRequestId) {
          newHeaders['X-Request-Id'] = owner.xRequestId;
          newHeaders['x-request-id'] = owner.xRequestId;
        }
        newHeaders['X-Session-Digest'] = owner.xSessionDigest;
        newHeaders['x-session-digest'] = owner.xSessionDigest;
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

  // Nhánh StoreKit Sandbox — TUYỆT ĐỐI CHỈ ĐỌC ($done({}))
  if (SANDBOX_HOST_RE.test(url)) {
    parseSandboxSubscriptionsReadOnly(bodyStr, $request && $request.headers);
    return $done({});
  }

  // Nhánh TestFlight API
  if (!bodyStr || bodyStr[0] !== '{') return $done({});
  const cfg = getConfig();
  let obj;
  try { obj = JSON.parse(bodyStr); } catch (_) { return $done({}); }
  let modified = false;

  if (/\/v1\/session\/authenticate/.test(url) && obj?.data?.accountId && $request?.headers) {
    upsertAccount(obj.data.accountId, $request.headers);
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
// 6. WEB UI NỘI BỘ 3 TAB (http://tf-hub.test/)
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
  :root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#f1f5f9;--muted:#94a3b8;--accent:#38bdf8;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444;}
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
  body{margin:0;padding:12px;background:var(--bg);color:var(--text);font-size:14px;line-height:1.45;}
  h1{font-size:18px;margin:0 0 2px;color:var(--accent);}
  .sub{font-size:12px;color:var(--muted);margin-bottom:10px;}
  .tabs{display:flex;gap:6px;margin-bottom:12px;}
  .tab{flex:1;padding:9px 6px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--muted);font-weight:700;font-size:12px;text-align:center;cursor:pointer;}
  .tab.active{background:var(--accent);color:#062033;border-color:var(--accent);}
  .panel{display:none;}.panel.active{display:block;}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;}
  .card h2{font-size:15px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
  label{font-size:12px;color:var(--muted);display:block;margin-bottom:3px;}
  input,select{width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0b1220;color:var(--text);font-size:13px;}
  button{padding:7px 11px;border:0;border-radius:8px;background:var(--accent);color:#062033;font-weight:600;font-size:12px;cursor:pointer;}
  button.sec{background:#334155;color:var(--text);}
  button.ok{background:var(--ok);color:#052e16;}
  button.warn{background:var(--warn);color:#451a03;}
  button.err{background:var(--err);color:#fff;}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;}
  .b-ok{background:#14532d;color:#86efac;}
  .b-warn{background:#78350f;color:#fde68a;}
  .b-err{background:#7f1d1d;color:#fca5a5;}
  .b-pin{background:#0c4a6e;color:#7dd3fc;}
  .item{border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:9px;background:#0b1220;}
  .kv{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all;background:#111c33;padding:4px 7px;border-radius:6px;margin:3px 0;color:#cbd5e1;}
  .kv b{color:var(--accent);}
  .logs{font-family:ui-monospace,monospace;font-size:11px;max-height:170px;overflow:auto;background:#0b1220;padding:8px;border-radius:8px;white-space:pre-wrap;color:#cbd5e1;}
</style>
</head>
<body>
  <h1>✈️ TF Multi-Account Hub <span id="syncStat" class="badge b-ok">Sẵn sàng</span></h1>
  <div class="sub">All-in-One 3 Tab (Loon & Shadowrocket • A9 iOS 15.8.8) • Đồng bộ BoxJs • v${HUB_VERSION}</div>

  <div class="tabs">
    <div class="tab active" onclick="showTab(0)">🔗 Link TF (<span id="cntLinks">0</span>)</div>
    <div class="tab" onclick="showTab(1)">👥 Nick & API (<span id="cntAccs">0</span>)</div>
    <div class="tab" onclick="showTab(2)">💳 Gói Sandbox (<span id="cntSubs">0</span>)</div>
  </div>

  <!-- TAB 1: QUẢN LÝ LINK TESTFLIGHT (CRUD + CHECK + BATCH JOIN) -->
  <div class="panel active" id="p0">
    <div class="card">
      <h2>➕ Thêm Link / Mã TestFlight</h2>
      <div class="row">
        <div style="flex:1;min-width:140px"><label>Mã hoặc Link TestFlight</label><input id="lCode" placeholder="LPQmtkUs hoặc https://testflight.apple.com/join/..."></div>
        <div style="flex:1;min-width:120px"><label>Tên gợi nhớ</label><input id="lName" placeholder="VD: Chrome Beta"></div>
      </div>
      <div class="row">
        <button class="ok" onclick="saveLink()">➕ Lưu Link</button>
        <button onclick="runAct('checkLinks')">🔍 Kiểm tra trạng thái tất cả</button>
        <button class="warn" onclick="runAct('batchJoinOpen')">🎯 Cho toàn bộ Nick ALIVE tham gia link OPEN</button>
      </div>
    </div>
    <div class="card">
      <h2>📋 Danh sách Link TestFlight</h2>
      <div id="linksList">Đang tải...</div>
    </div>
  </div>

  <!-- TAB 2: KHO APPLE ID, CẤU HÌNH & ĐIỀU KHIỂN HÀNG LOẠT -->
  <div class="panel" id="p1">
    <div class="card">
      <h2>⚙️ Cấu hình Tráo Nick, Lách iOS Cũ & Phá Vùng</h2>
      <div class="row">
        <div style="flex:1;min-width:140px">
          <label>Chế độ tráo tài khoản</label>
          <select id="mode">
            <option value="MERGE">MERGE (Gộp mọi nick kiểu NobyDa)</option>
            <option value="PIN">PIN (Khóa 1 nick cố định kiểu iRingo)</option>
          </select>
        </div>
        <div style="flex:1;min-width:120px">
          <label>Phá giới hạn vùng (Storefront)</label>
          <select id="country">
            <option value="US">🇺🇸 Mỹ (143441)</option>
            <option value="VN">🇻🇳 Việt Nam (143471)</option>
            <option value="JP">🇯🇵 Nhật (143462)</option>
            <option value="SG">🇸🇬 Singapore (143464)</option>
            <option value="TW">🇹🇼 Đài Loan (143470)</option>
            <option value="HK">🇭🇰 Hồng Kông (143463)</option>
            <option value="GB">🇬🇧 Anh (143444)</option>
            <option value="AUTO">🇺🇳 Tự động</option>
          </select>
        </div>
        <div style="flex:0.7;min-width:95px">
          <label>Ping (phút)</label>
          <input id="keepAliveMin" type="number" min="5" value="30">
        </div>
      </div>
      <div class="row">
        <label style="display:flex;align-items:center;gap:5px;margin:0"><input type="checkbox" id="universal" style="width:auto"> Lách iOS cũ</label>
        <label style="display:flex;align-items:center;gap:5px;margin:0"><input type="checkbox" id="alwaysInstall" style="width:auto"> Ép nút Cài</label>
        <label style="display:flex;align-items:center;gap:5px;margin:0"><input type="checkbox" id="autoJoin" style="width:auto"> Cron Auto-Join</label>
        <label style="display:flex;align-items:center;gap:5px;margin:0"><input type="checkbox" id="autoInstall" style="width:auto"> Gửi tiếp /install</label>
      </div>
      <div class="row">
        <button class="ok" onclick="saveCfg()">💾 Lưu cấu hình</button>
        <button onclick="runAct('pingAll')">💓 Ping nuôi & Quét App toàn bộ Nick</button>
      </div>
    </div>

    <div class="card">
      <h2>👥 Kho Apple ID & Token đã lưu</h2>
      <div id="accList">Đang tải...</div>
      <details style="margin-top:8px">
        <summary style="cursor:pointer;color:var(--accent);font-weight:600">➕ Nạp tay Nick Apple ID</summary>
        <div style="margin-top:8px">
          <label>Tên gợi nhớ</label><input id="mAlias" placeholder="VD: Nick US #1">
          <label>Account ID (UUID 36 ký tự)</label><input id="mId">
          <label>x-session-id</label><input id="mSid">
          <label>x-request-id</label><input id="mRid">
          <label>x-session-digest</label><input id="mDig">
          <button style="margin-top:8px" onclick="addManual()">➕ Lưu vào kho</button>
        </div>
      </details>
    </div>
  </div>

  <!-- TAB 3: GÓI ĐĂNG KÝ SANDBOX IAP THEO TỪNG APPLE ID -->
  <div class="panel" id="p2">
    <div class="card">
      <h2>💳 Trạng Thái Gói Đăng Ký Kiểm Thử (StoreKit 1 & 2)</h2>
      <div class="sub">Tự động bắt chỉ đọc từ sandbox.itunes.apple.com / mzstorekit-sb.itunes.apple.com. Tích Watchlist để Cron nhắc gia hạn 1 chạm.</div>
      <div class="row">
        <button onclick="runAct('checkWatchlist')">🔔 Kiểm tra hạn Watchlist ngay</button>
        <a href="itms-apps://apps.apple.com/account/subscriptions" style="text-decoration:none"><button class="sec" type="button">⚙️ Mở Trang Thuê Bao iOS</button></a>
      </div>
      <div id="subsList">Đang tải...</div>
    </div>
  </div>

  <div class="card">
    <h2>📜 Nhật ký hoạt động</h2>
    <div id="logs" class="logs">Chưa có log.</div>
  </div>

<script>
const api = (p, b) => fetch(p, b ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)} : {}).then(r=>r.json());
function setStat(t, ok=true){const e=document.getElementById('syncStat');e.textContent=t;e.className='badge '+(ok?'b-ok':'b-err');}
function showTab(i){document.querySelectorAll('.tab').forEach((t,idx)=>t.classList.toggle('active',idx===i));document.querySelectorAll('.panel').forEach((p,idx)=>p.classList.toggle('active',idx===i));}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

async function loadState(){
  setStat('Đang tải...');
  const s = await api('/api/state');
  document.getElementById('mode').value = s.config.mode;
  document.getElementById('country').value = s.config.country;
  document.getElementById('universal').checked = s.config.universal;
  document.getElementById('alwaysInstall').checked = s.config.alwaysInstall;
  document.getElementById('autoJoin').checked = s.config.autoJoin;
  document.getElementById('autoInstall').checked = s.config.autoInstall;
  document.getElementById('keepAliveMin').value = s.config.keepAliveMin;

  // Render Tab 1: Links
  const links = Object.values(s.links || {});
  document.getElementById('cntLinks').textContent = links.length;
  document.getElementById('linksList').innerHTML = !links.length
    ? '<div class="sub">Chưa có link nào. Thêm mã hoặc link ở khung trên.</div>'
    : links.map(l => {
        const bc = l.status==='OPEN'?'b-ok':(l.status==='FULL'||l.status==='CLOSED'?'b-err':'b-warn');
        const t = l.lastCheck ? new Date(l.lastCheck).toLocaleTimeString('vi-VN') : '-';
        return '<div class="item">'
          + '<div class="row" style="justify-content:space-between"><div><b>'+esc(l.name)+'</b> (<code>'+esc(l.code)+'</code>) <span class="badge '+bc+'">'+esc(l.status)+'</span></div><span class="sub" style="margin:0">Quét: '+t+'</span></div>'
          + (l.joinedBy && l.joinedBy.length ? '<div class="sub">Đã vào: '+esc(l.joinedBy.join(', '))+'</div>' : '')
          + '<div class="row" style="margin-bottom:0">'
          + '<button onclick="runAct(\\'checkOne\\',{code:\\''+esc(l.code)+'\\'})">🔍 Kiểm tra</button>'
          + '<button class="ok" onclick="runAct(\\'joinOne\\',{code:\\''+esc(l.code)+'\\'})">🎯 Bắn toàn bộ Nick vào</button>'
          + '<a href="itms-beta://testflight.apple.com/join/'+esc(l.code)+'" style="text-decoration:none"><button class="sec" type="button">📲 Mở TF</button></a>'
          + '<button class="sec" onclick="editLink(\\''+esc(l.code)+'\\',\\''+esc(l.name).replace(/'/g,'')+'\\')">✏️ Sửa</button>'
          + '<button class="err" onclick="delLink(\\''+esc(l.code)+'\\')">🗑️</button>'
          + '</div></div>';
      }).join('');

  // Render Tab 2: Accounts
  const accs = Object.values(s.accounts || {});
  document.getElementById('cntAccs').textContent = accs.length;
  document.getElementById('accList').innerHTML = !accs.length
    ? '<div class="sub">Chưa có nick nào. Mở app TestFlight để tự chụp hoặc nạp tay ở dưới.</div>'
    : accs.map(a => {
        const isPin = s.config.activeId === a.id;
        const alive = a.status !== 'EXPIRED_401';
        const appsHtml = (a.apps || []).slice(0, 8).map(ap =>
          '<div class="kv">📱 <b>'+esc(ap.name)+'</b> v'+esc(ap.version)+' ('+esc(ap.buildVer)+') '
          + (ap.adamId && ap.buildId ? '<button class="sec" style="padding:2px 6px;font-size:10px;margin-left:6px" onclick="runAct(\\'installApp\\',{accountId:\\''+a.id+'\\',appId:\\''+ap.adamId+'\\',buildId:\\''+ap.buildId+'\\'})">⬇️ Gửi /install</button>' : '')
          + '</div>'
        ).join('');
        return '<div class="item">'
          + '<div class="row" style="justify-content:space-between"><div><b>'+esc(a.alias)+'</b> '+(isPin?'<span class="badge b-pin">PIN</span> ':'')
          + '<span class="badge '+(alive?'b-ok':'b-err')+'">'+(alive?'ALIVE':'401 HẾT HẠN')+'</span></div>'
          + '<span class="sub" style="margin:0">Apps: '+(a.appCount||0)+'</span></div>'
          + '<div class="kv"><b>accountId:</b> '+esc(a.id)+'</div>'
          + '<div class="kv"><b>x-session-id:</b> '+esc(a.xSessionId)+'</div>'
          + '<div class="kv"><b>x-request-id:</b> '+esc(a.xRequestId||'-')+'</div>'
          + '<div class="kv"><b>x-session-digest:</b> '+esc(a.xSessionDigest)+'</div>'
          + appsHtml
          + '<div class="row" style="margin-top:6px;margin-bottom:0">'
          + '<button onclick="pinAcc(\\''+a.id+'\\')">📌 Ghim Nick</button>'
          + '<button class="sec" onclick="runAct(\\'pingOne\\',{id:\\''+a.id+'\\'})">💓 Ping & Quét App</button>'
          + '<button class="sec" onclick="renameAcc(\\''+a.id+'\\',\\''+esc(a.alias).replace(/'/g,'')+'\\')">✏️ Đổi tên</button>'
          + '<button class="err" onclick="delAcc(\\''+a.id+'\\')">🗑️</button>'
          + '</div></div>';
      }).join('');

  // Render Tab 3: Sandbox Subscriptions
  const watchSet = new Set(s.watchlist || []);
  const subRows = [];
  for (const ownerKey of Object.keys(s.subs || {})) {
    for (const pid of Object.keys(s.subs[ownerKey] || {})) {
      subRows.push(s.subs[ownerKey][pid]);
    }
  }
  document.getElementById('cntSubs').textContent = subRows.length;
  document.getElementById('subsList').innerHTML = !subRows.length
    ? '<div class="sub">Chưa ghi nhận gói đăng ký kiểm thử nào. Mở app TestFlight có gói Sandbox IAP để Hub tự động ghi nhận chỉ đọc.</div>'
    : subRows.map(r => {
        const wKey = r.ownerKey + '::' + r.productId;
        const watched = watchSet.has(wKey);
        const remainMin = r.expiresMs ? Math.round((r.expiresMs - Date.now()) / 60000) : 0;
        const expTxt = r.expiresMs ? (remainMin > 0 ? 'Còn ~'+remainMin+' phút' : 'Đã hết hạn') : 'Không rõ';
        const renewOn = r.autoRenewStatus === '1';
        return '<div class="item">'
          + '<div class="row" style="justify-content:space-between"><div><b>'+esc(r.productId)+'</b> <span class="badge '+(renewOn?'b-ok':'b-err')+'">'+(renewOn?'AutoRenew BẬT':'AutoRenew TẮT')+'</span></div>'
          + '<span class="badge '+(remainMin>5?'b-ok':'b-warn')+'">'+expTxt+'</span></div>'
          + '<div class="kv"><b>Nick:</b> '+esc(r.ownerLabel)+' ('+esc(r.source)+') • <b>origTx:</b> '+esc(r.originalTxId||'-')+'</div>'
          + '<div class="row" style="margin-bottom:0">'
          + '<button class="'+(watched?'warn':'sec')+'" onclick="toggleWatch(\\''+esc(wKey)+'\\')">'+(watched?'⭐ Đang theo dõi gia hạn':'☆ Bật nhắc gia hạn')+'</button>'
          + '</div></div>';
      }).join('');

  document.getElementById('logs').textContent = (s.logs || []).join('\\n') || 'Chưa có log.';
  setStat('Sẵn sàng');
}

async function saveCfg(){
  await api('/api/config', {
    mode: document.getElementById('mode').value,
    country: document.getElementById('country').value,
    universal: document.getElementById('universal').checked,
    alwaysInstall: document.getElementById('alwaysInstall').checked,
    autoJoin: document.getElementById('autoJoin').checked,
    autoInstall: document.getElementById('autoInstall').checked,
    keepAliveMin: Number(document.getElementById('keepAliveMin').value) || 30,
  });
  await loadState();
}
async function saveLink(){
  const raw = document.getElementById('lCode').value.trim();
  const name = document.getElementById('lName').value.trim();
  if(!raw) return alert('Vui lòng nhập mã hoặc link TestFlight');
  await api('/api/link/save', { raw, name });
  document.getElementById('lCode').value=''; document.getElementById('lName').value='';
  await loadState();
}
async function editLink(code, oldName){
  const name = prompt('Sửa tên cho mã '+code+':', oldName);
  if(name && name.trim()){ await api('/api/link/save', { raw: code, name: name.trim() }); await loadState(); }
}
async function delLink(code){ if(confirm('Xóa link '+code+'?')){ await api('/api/link/delete', { code }); await loadState(); } }
async function pinAcc(id){ await api('/api/pin', { id }); await loadState(); }
async function renameAcc(id, oldName){ const a = prompt('Đổi tên nick:', oldName); if(a&&a.trim()){ await api('/api/rename',{id,alias:a.trim()}); await loadState(); } }
async function delAcc(id){ if(confirm('Xóa nick '+id+'?')){ await api('/api/delete',{id}); await loadState(); } }
async function toggleWatch(wKey){ await api('/api/sub/watch', { key: wKey }); await loadState(); }
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
  setStat('Đang chạy '+action+'...');
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
      logs: readJson(KEYS.LOGS, []),
    });
  }

  if (path === '/api/config') {
    if (body.mode) storeWrite(KEYS.MODE, body.mode === 'PIN' ? 'PIN' : 'MERGE');
    if (body.country) storeWrite(KEYS.COUNTRY, String(body.country).toUpperCase());
    if (typeof body.universal === 'boolean') storeWrite(KEYS.UNIVERSAL, String(body.universal));
    if (typeof body.alwaysInstall === 'boolean') storeWrite(KEYS.ALWAYS_INSTALL, String(body.alwaysInstall));
    if (typeof body.autoJoin === 'boolean') storeWrite(KEYS.AUTO_JOIN, String(body.autoJoin));
    if (typeof body.autoInstall === 'boolean') storeWrite(KEYS.AUTO_INSTALL, String(body.autoInstall));
    if (body.keepAliveMin) storeWrite(KEYS.KEEPALIVE_MIN, String(Math.max(5, Number(body.keepAliveMin) || 30)));
    addLog('INFO', 'Đã lưu cấu hình từ Web UI');
    return jsonResp({ ok: true });
  }

  if (path === '/api/link/save') {
    const codes = extractCodes(body.raw);
    if (!codes.length) return jsonResp({ ok: false, error: 'Mã link không hợp lệ' }, 400);
    const links = getLinksMap();
    for (const c of codes) {
      const prev = links[c] || { code: c, status: 'UNKNOWN', lastCheck: 0, joinedBy: [] };
      links[c] = Object.assign(prev, { code: c, name: body.name || prev.name || `Beta ${c}`, note: body.note || prev.note || '' });
    }
    saveLinksMap(links);
    addLog('INFO', `Đã lưu link: ${codes.join(', ')}`);
    return jsonResp({ ok: true, codes });
  }

  if (path === '/api/link/delete' && body.code) {
    const links = getLinksMap();
    delete links[body.code];
    saveLinksMap(links);
    addLog('WARN', `Đã xóa link: ${body.code}`);
    return jsonResp({ ok: true });
  }

  if (path === '/api/pin' && body.id) {
    storeWrite(KEYS.ACTIVE_ID, String(body.id).toLowerCase());
    storeWrite(KEYS.MODE, 'PIN');
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

  if (path === '/api/action') {
    if (body.action === 'pingAll') return jsonResp({ ok: true, result: await pingAccounts(null, true) });
    if (body.action === 'pingOne' && body.id) return jsonResp({ ok: true, result: await pingAccounts([body.id], true) });
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
// 7. ĐIỂM VÀO CHÍNH (4 CHẾ ĐỘ: WEB UI / MITM REQ / MITM RESP / CRON)
// ============================================================================
async function main() {
  if (isResp) return handleHttpResponse();
  if (isReq) {
    const url = ($request && $request.url) || '';
    if (url.includes(`://${HUB_HOST}`)) return await handleWebUiRequest();
    return await handleTestFlightRequest();
  }
  // Cron ngầm: Nuôi token + Săn & tham gia link + Kiểm tra Watchlist gói Sandbox
  const cfg = getConfig();
  await pingAccounts(null, false);
  if (cfg.autoJoin && Object.keys(getLinksMap()).length > 0) {
    await batchJoinLinks({ skipPublicCheck: false, stopOnFirst: true });
  }
  checkWatchlistRenewals();
  $done();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HUB_VERSION, KEYS, STOREFRONT_MAP, extractCodes, patchStorefrontInBody, modBuild, decodeJwsPayload };
} else {
  main().catch((err) => {
    addLog('ERR', String(err && err.message ? err.message : err));
    try { $done({}); } catch (_) {}
  });
}
