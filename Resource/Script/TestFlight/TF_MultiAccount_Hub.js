/**
 * TF_MultiAccount_Hub.js — Trung Tâm Đa Tài Khoản TestFlight Hợp Nhất (NobyDa + iRingo + Sniper + Keep-Alive + Web UI + BoxJs)
 * Tương thích: Loon (.plugin) & Shadowrocket (.sgmodule) — Tối ưu RAM cho A9 iOS 15.8.8 (SSL Kill Switch 3)
 * Giao diện Web nội bộ: http://tf-hub.test/
 * Đồng bộ BoxJs: TF_HUB_* keys trong $persistentStore
 * @version 1.0.0.0
 */
'use strict';

const HUB_VERSION = '1.0.0.0';
const HUB_HOST = 'tf-hub.test';
const TF_ORIGIN = 'https://testflight.apple.com';

// Khóa lưu trữ chuẩn dùng chung giữa Web UI nội bộ và BoxJs ($persistentStore)
const KEYS = {
  ACCOUNTS: 'TF_HUB_ACCOUNTS',           // JSON Object: { [uuid]: { id, alias, xSessionId, xRequestId, xSessionDigest, ua, status, fail401, lastSeen, lastPing, appCount, appsSummary } }
  APPLIST: 'TF_HUB_APPLIST',             // JSON Object: { [appAdamId]: uuid }
  MODE: 'TF_HUB_MODE',                   // 'MERGE' (kiểu NobyDa) | 'PIN' (kiểu iRingo)
  ACTIVE_ID: 'TF_HUB_ACTIVE_ID',         // UUID nick đang ghim khi MODE = 'PIN' hoặc ưu tiên Auto-Join
  COUNTRY: 'TF_HUB_COUNTRY',             // Mã vùng Storefront: 'US', 'VN', 'JP', 'SG', 'TW', 'HK', 'GB', 'KR', 'AU', 'CA', 'AUTO'
  UNIVERSAL: 'TF_HUB_UNIVERSAL',         // 'true' | 'false' — Lách tương thích thiết bị/iOS cũ (modBuild kiểu iRingo)
  ALWAYS_INSTALL: 'TF_HUB_ALWAYS_INSTALL', // 'true' | 'false' — Ép hiện nút Cài đặt khi beta FULL
  JOIN_CODES: 'TF_HUB_JOIN_CODES',       // Chuỗi mã/link TestFlight cách nhau bằng dấu phẩy hoặc xuống dòng
  AUTO_JOIN: 'TF_HUB_AUTO_JOIN',         // 'true' | 'false' — Bật tự động quét & tham gia link trong Cron
  AUTO_INSTALL: 'TF_HUB_AUTO_INSTALL',   // 'true' | 'false' — Sau khi accept thành công, thử gọi tiếp /install
  KEEPALIVE_MIN: 'TF_HUB_KEEPALIVE_MIN', // Chu kỳ ping nuôi token (phút), mặc định 30
  LOGS: 'TF_HUB_LOGS',                   // Mảng log tối đa 30 dòng (nhẹ RAM cho A9)
};

// Bảng mã Storefront Apple (trích chuẩn iRingo)
const STOREFRONT_MAP = {
  US: '143441', VN: '143471', JP: '143462', SG: '143464',
  TW: '143470', HK: '143463', CN: '143465', GB: '143444',
  KR: '143466', AU: '143460', CA: '143455', DE: '143443',
  FR: '143442', TH: '143475', ID: '143476', MY: '143473',
  PH: '143474', IN: '143467', IE: '143449', NL: '143452',
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ============================================================================
// 1. LỚP TƯƠNG THÍCH MÔI TRƯỜNG (LOON / SHADOWROCKET / NODE TEST)
// ============================================================================
const isLoon = typeof $loon !== 'undefined';
const isReq = typeof $request !== 'undefined';
const isResp = typeof $response !== 'undefined';

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
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      return $persistentStore.write(str, key);
    }
  } catch (_) {}
  return false;
}

function readJson(key, fallback) {
  const raw = storeRead(key, '');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function readBool(key, defaultVal) {
  const raw = String(storeRead(key, '')).trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return defaultVal;
}

function notify(title, subtitle, body, openUrl) {
  try {
    if (typeof $notification !== 'undefined') {
      if (isLoon) {
        if (openUrl) $notification.post(title, subtitle, body, { openUrl });
        else $notification.post(title, subtitle, body);
      } else {
        // Shadowrocket / Surge
        if (openUrl) $notification.post(title, subtitle, body, { url: openUrl });
        else $notification.post(title, subtitle, body);
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
  if (logs.length > 30) logs.length = 30;
  storeWrite(KEYS.LOGS, logs);
}

function lowerHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const k of Object.keys(headers)) {
    out[k.toLowerCase()] = headers[k];
  }
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
    // Chống loopback trên Shadowrocket / Surge / Loon khi gọi lại testflight.apple.com
    reqOpts['X-Surge-Skip-Scripting'] = true;
    reqOpts.headers['X-TF-Hub-Internal'] = '1';

    const fn = $httpClient[method.toLowerCase()];
    if (!fn) return resolve({ error: `Unsupported method ${method}`, status: 0, headers: {}, body: '' });
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
  const items = String(raw)
    .split(/[\s,;|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/i);
      return m ? m[1] : s.replace(/[^A-Za-z0-9]/g, '');
    })
    .filter((s) => s.length >= 6 && s.length <= 16);
  return Array.from(new Set(items));
}

function getConfig() {
  return {
    mode: storeRead(KEYS.MODE, 'MERGE') === 'PIN' ? 'PIN' : 'MERGE',
    activeId: storeRead(KEYS.ACTIVE_ID, '').trim(),
    country: (storeRead(KEYS.COUNTRY, 'US') || 'US').toUpperCase(),
    universal: readBool(KEYS.UNIVERSAL, true),
    alwaysInstall: readBool(KEYS.ALWAYS_INSTALL, true),
    autoJoin: readBool(KEYS.AUTO_JOIN, true),
    autoInstall: readBool(KEYS.AUTO_INSTALL, false),
    keepAliveMin: Math.max(5, Number(storeRead(KEYS.KEEPALIVE_MIN, '30')) || 30),
    joinCodes: extractCodes(storeRead(KEYS.JOIN_CODES, '')),
  };
}

// ============================================================================
// 2. KHO ĐA TÀI KHOẢN (LƯU / CẬP NHẬT / CHỌN NICK)
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

// ============================================================================
// 3. LÁCH PHIÊN BẢN CŨ (modBuild KIỂU iRingo) & PHÁ GIỚI HẠN VÙNG (STOREFRONT)
// ============================================================================
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
// 4. NUÔI TOKEN (KEEP-ALIVE) & SĂN SLOT 2 TẦNG (AUTO JOIN / INSTALL)
// ============================================================================
async function pingAccount(acc) {
  const url = `${TF_ORIGIN}/v3/accounts/${acc.id}/apps`;
  const r = await httpCall('GET', { url, headers: buildAuthHeaders(acc), timeout: 12 });
  const accounts = readJson(KEYS.ACCOUNTS, {});
  const cur = accounts[acc.id] || acc;

  if (r.status === 200 && r.body) {
    let appCount = cur.appCount || 0;
    try {
      const parsed = JSON.parse(r.body);
      if (Array.isArray(parsed.data)) appCount = parsed.data.length;
    } catch (_) {}
    cur.status = 'ALIVE';
    cur.fail401 = 0;
    cur.lastPing = Date.now();
    cur.appCount = appCount;
    accounts[acc.id] = cur;
    storeWrite(KEYS.ACCOUNTS, accounts);
    return { id: acc.id, alias: cur.alias, ok: true, status: 200, appCount };
  }

  if (r.status === 401) {
    cur.fail401 = (cur.fail401 || 0) + 1;
    cur.lastPing = Date.now();
    if (cur.fail401 >= 2) {
      cur.status = 'EXPIRED_401';
      notify(
        'TF Hub — Token Hết Hạn (401)',
        cur.alias,
        `UUID ${acc.id.slice(0, 8)}... cần mở lại TestFlight để chụp phiên mới.`,
        `http://${HUB_HOST}/`
      );
    }
    accounts[acc.id] = cur;
    storeWrite(KEYS.ACCOUNTS, accounts);
    addLog('WARN', `Ping 401 (${cur.fail401}/2): ${cur.alias}`);
    return { id: acc.id, alias: cur.alias, ok: false, status: 401 };
  }

  addLog('WARN', `Ping lỗi mạng (${r.status || r.error}): ${cur.alias}`);
  return { id: acc.id, alias: cur.alias, ok: false, status: r.status || 0 };
}

async function pingAllAccounts(force = false) {
  const cfg = getConfig();
  const accounts = readJson(KEYS.ACCOUNTS, {});
  const list = Object.values(accounts);
  const results = [];
  const now = Date.now();
  const intervalMs = cfg.keepAliveMin * 60 * 1000;

  for (const acc of list) {
    if (!force && acc.status === 'ALIVE' && now - (acc.lastPing || 0) < intervalMs) {
      results.push({ id: acc.id, alias: acc.alias, skipped: true, status: 200 });
      continue;
    }
    // Chạy tuần tự từng nick thay vì ồ ạt để tiết kiệm RAM trên chip A9
    const res = await pingAccount(acc);
    results.push(res);
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

async function tryAcceptAndInstall(acc, tfCode, cfg) {
  const acceptUrl = `${TF_ORIGIN}/v3/accounts/${acc.id}/ru/${tfCode}/accept`;
  const r = await httpCall('POST', {
    url: acceptUrl,
    headers: Object.assign(buildAuthHeaders(acc), { 'content-type': 'application/json' }),
    body: '{}',
    timeout: 12,
  });

  if (r.status === 200) {
    addLog('OK', `[${acc.alias}] Tham gia thành công mã ${tfCode}!`);
    notify(
      'TF Hub — Tham Gia Thành Công 🎉',
      `${acc.alias} ➔ ${tfCode}`,
      'Bấm để mở TestFlight tải/cập nhật ngay.',
      `itms-beta://testflight.apple.com/join/${tfCode}`
    );

    // Tùy chọn gọi tiếp /install với Storefront đã phá vùng nếu phản hồi trả về appAdamId & buildId
    if (cfg.autoInstall && r.body) {
      try {
        const j = JSON.parse(r.body);
        const appId = j?.data?.appAdamId || j?.data?.app?.adamId;
        const buildId = j?.data?.buildId || j?.data?.currentBuild?.id;
        if (appId && buildId) {
          const sf = STOREFRONT_MAP[cfg.country] || '143441';
          const installUrl = `${TF_ORIGIN}/v3/accounts/${acc.id}/apps/${appId}/builds/${buildId}/install`;
          await httpCall('POST', {
            url: installUrl,
            headers: Object.assign(buildAuthHeaders(acc), { 'content-type': 'application/json' }),
            body: JSON.stringify({ storefrontId: `${sf}-19,29` }),
            timeout: 12,
          });
          addLog('OK', `[${acc.alias}] Đã gửi lệnh /install cho app ${appId} (Storefront ${sf})`);
        }
      } catch (_) {}
    }
    return { ok: true, status: 200, code: tfCode, account: acc.alias };
  }

  addLog('INFO', `[${acc.alias}] Accept ${tfCode} trả HTTP ${r.status}`);
  return { ok: false, status: r.status, code: tfCode, account: acc.alias };
}

async function runSlotSniper(forceAll = false) {
  const cfg = getConfig();
  if (!cfg.joinCodes.length) return [];
  const accounts = readJson(KEYS.ACCOUNTS, {});
  let aliveList = Object.values(accounts).filter((a) => a.status === 'ALIVE');
  if (cfg.mode === 'PIN' && cfg.activeId && accounts[cfg.activeId]) {
    aliveList = [accounts[cfg.activeId]];
  }
  const summary = [];

  for (const code of cfg.joinCodes) {
    const slotState = await checkPublicSlot(code);
    if (slotState !== 'OPEN' && !forceAll) {
      summary.push({ code, slotState, action: 'SKIP' });
      continue;
    }
    if (!aliveList.length) {
      if (slotState === 'OPEN') {
        notify('TF Hub — Có Slot Mở!', `Mã ${code} đang OPEN`, 'Chưa có nick ALIVE, bấm mở trực tiếp TestFlight.', `itms-beta://testflight.apple.com/join/${code}`);
      }
      summary.push({ code, slotState, action: 'NO_ALIVE_ACCOUNT' });
      continue;
    }
    for (const acc of aliveList) {
      const res = await tryAcceptAndInstall(acc, code, cfg);
      summary.push({ code, slotState, account: acc.alias, status: res.status, ok: res.ok });
      if (res.ok) break; // Chốt thành công thì chuyển mã tiếp theo
    }
  }
  return summary;
}

// ============================================================================
// 5. XỬ LÝ MITM REQUEST (HỢP NHẤT NOBYDA MERGE + IRINGO PIN & STOREFRONT)
// ============================================================================
async function handleTestFlightRequest() {
  const req = $request;
  const reqHeaders = lowerHeaders(req.headers);

  // Bỏ qua các request nội bộ do chính Hub phát ra (tránh vòng lặp)
  if (reqHeaders['x-tf-hub-internal'] === '1') {
    return $done({});
  }

  const cfg = getConfig();
  const url = req.url;
  const uuidMatch = url.match(/\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  const reqUuid = uuidMatch ? uuidMatch[1].toLowerCase() : '';

  // 1) Tự động chụp phiên mỗi khi app TestFlight gửi request mang UUID + token
  if (reqUuid && reqHeaders['x-session-id'] && reqHeaders['x-session-digest']) {
    upsertAccount(reqUuid, req.headers);
  }

  // 2) Phá giới hạn vùng Storefront trên /v1/session/authenticate và .../install
  let modBody = req.body;
  if (modBody && (/\/v1\/session\/authenticate/.test(url) || /\/install$/.test(url))) {
    modBody = patchStorefrontInBody(modBody, cfg.country);
  }

  const accounts = readJson(KEYS.ACCOUNTS, {});
  const accountIds = Object.keys(accounts);

  // 3) CHẾ ĐỘ PIN (kiểu iRingo): Khóa cứng mọi request về 1 nick đích danh
  if (cfg.mode === 'PIN' && cfg.activeId && accounts[cfg.activeId]) {
    const pinned = accounts[cfg.activeId];
    const newHeaders = Object.assign({}, req.headers);
    let newUrl = url;
    if (reqUuid && reqUuid !== pinned.id) {
      newUrl = url.replace(UUID_RE, pinned.id);
    }
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

  // 4) CHẾ ĐỘ MERGE (kiểu NobyDa): Gộp danh sách app mọi nick khi gọi GET .../accounts/{uuid}/apps
  if (cfg.mode === 'MERGE' && req.method === 'GET' && /\/accounts\/[0-9a-f-]{36}\/apps$/i.test(url) && accountIds.length > 1) {
    const aliveIds = accountIds.filter((id) => accounts[id].status !== 'EXPIRED_401');
    const mergedApps = [];
    const seenAdam = new Set();
    const appOwnerMap = readJson(KEYS.APPLIST, {});
    let primaryStatus = 200;

    // Gọi tuần tự từng nick (an toàn RAM A9 2GB)
    for (const id of aliveIds) {
      const acc = accounts[id];
      const targetUrl = url.replace(UUID_RE, id);
      const r = await httpCall('GET', { url: targetUrl, headers: buildAuthHeaders(acc, req.headers), timeout: 12 });
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
      response: {
        status: primaryStatus,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: mergedApps, error: null }),
      },
    });
  }

  // 5) CHẾ ĐỘ MERGE — Tự tráo nick chủ sở hữu khi mở/cài app cụ thể (/apps/{appId}/...)
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
        const newUrl = reqUuid ? url.replace(UUID_RE, owner.id) : url;
        const out = { url: newUrl, headers: newHeaders };
    if (modBody !== undefined) out.body = modBody;
    return $done(out);
      }
    }
  }

  // Mặc định cho đi qua (vẫn giữ body đã phá vùng nếu có)
  if (modBody !== req.body) return $done({ body: modBody });
  return $done({});
}

// ============================================================================
// 6. XỬ LÝ MITM RESPONSE (CHỤP AUTH + LÁCH iOS CŨ + ÉP HIỆN NÚT CÀI)
// ============================================================================
function handleTestFlightResponse() {
  const url = ($request && $request.url) || '';
  const bodyStr = ($response && $response.body) || '';
  if (!bodyStr || bodyStr[0] !== '{') return $done({});

  const cfg = getConfig();
  let obj;
  try {
    obj = JSON.parse(bodyStr);
  } catch (_) {
    return $done({});
  }

  let modified = false;

  // 1) Chụp accountId khi /v1/session/authenticate
  if (/\/v1\/session\/authenticate/.test(url) && obj?.data?.accountId && $request?.headers) {
    upsertAccount(obj.data.accountId, $request.headers);
  }

  // 2) Lách tương thích iOS 15.8.8 / thiết bị cũ (Universal kiểu iRingo)
  if (cfg.universal && obj.error === null && obj.data) {
    if (/\/accounts\/[0-9a-f-]{36}\/apps$/i.test(url) && Array.isArray(obj.data)) {
      obj.data = patchAppsListUniversal(obj.data);
      modified = true;
    } else if (/\/apps\/\d+\/builds(\/\d+)?$/i.test(url)) {
      if (obj.data.currentBuild) {
        obj.data.currentBuild = modBuild(obj.data.currentBuild);
        modified = true;
      }
      if (Array.isArray(obj.data.builds)) {
        obj.data.builds = obj.data.builds.map(modBuild);
        modified = true;
      }
    } else if (/\/platforms\/.+\/trains\/.+\/builds$/i.test(url) && Array.isArray(obj.data)) {
      obj.data = obj.data.map(modBuild);
      modified = true;
    }
  }

  // 3) Ép hiện nút Cài đặt kể cả khi beta báo FULL (AlwaysShowInstall kiểu iRingo)
  if (cfg.alwaysInstall && /\/accounts\/[0-9a-f-]{36}\/ru\//i.test(url) && obj?.data?.status === 'FULL') {
    obj.data.status = 'OPEN';
    if (obj.data.app) {
      obj.data.app.eligibility = { status: 'NO_CRITERIA', criteria: null };
    }
    modified = true;
  }

  if (modified) return $done({ body: JSON.stringify(obj) });
  return $done({});
}

// ============================================================================
// 7. WEB UI NỘI BỘ (http://tf-hub.test/) — HIỂN THỊ RÕ ID, TOKEN & ĐIỀU KHIỂN
// ============================================================================
function jsonResp(data, status = 200) {
  return $done({
    response: {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify(data),
    },
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
  h1{font-size:18px;margin:0 0 4px;color:var(--accent);}
  .sub{font-size:12px;color:var(--muted);margin-bottom:12px;}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;}
  .card h2{font-size:15px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;}
  label{font-size:12px;color:var(--muted);display:block;margin-bottom:3px;}
  input,select,textarea{width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0b1220;color:var(--text);font-size:13px;}
  textarea{min-height:60px;font-family:ui-monospace,monospace;}
  button{padding:7px 12px;border:0;border-radius:8px;background:var(--accent);color:#062033;font-weight:600;font-size:13px;cursor:pointer;}
  button.sec{background:#334155;color:var(--text);}
  button.ok{background:var(--ok);color:#052e16;}
  button.err{background:var(--err);color:#fff;}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;}
  .b-ok{background:#14532d;color:#86efac;}
  .b-err{background:#7f1d1d;color:#fca5a5;}
  .b-pin{background:#0c4a6e;color:#7dd3fc;}
  .acc{border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px;background:#0b1220;}
  .kv{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all;background:#111c33;padding:5px 7px;border-radius:6px;margin:4px 0;color:#cbd5e1;}
  .kv b{color:var(--accent);}
  .logs{font-family:ui-monospace,monospace;font-size:11px;max-height:180px;overflow:auto;background:#0b1220;padding:8px;border-radius:8px;white-space:pre-wrap;color:#cbd5e1;}
</style>
</head>
<body>
  <h1>✈️ TF Multi-Account Hub</h1>
  <div class="sub">Hợp nhất NobyDa + iRingo + Sniper + Keep-Alive • Đồng bộ BoxJs • v${HUB_VERSION}</div>

  <div class="card">
    <h2>⚙️ Cấu hình hoạt động <span id="syncStat" class="badge b-ok">Sẵn sàng</span></h2>
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
          <option value="KR">🇰🇷 Hàn (143466)</option>
          <option value="AU">🇦🇺 Úc (143460)</option>
          <option value="CA">🇨🇦 Canada (143455)</option>
          <option value="AUTO">🇺🇳 Tự động (Không sửa)</option>
        </select>
      </div>
    </div>
    <div class="row">
      <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="universal" style="width:auto"> Lách iOS cũ (modBuild)</label>
      <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="alwaysInstall" style="width:auto"> Ép hiện nút Cài (FULL→OPEN)</label>
      <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="autoJoin" style="width:auto"> Tự động săn & Accept</label>
      <label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" id="autoInstall" style="width:auto"> Gửi tiếp /install</label>
    </div>
    <div class="row">
      <div style="flex:1;min-width:110px">
        <label>Chu kỳ ping nuôi token (phút)</label>
        <input id="keepAliveMin" type="number" min="5" value="30">
      </div>
      <div style="flex:2;min-width:180px">
        <label>Mã / Link TestFlight tự động tham gia (cách nhau dấu phẩy)</label>
        <input id="joinCodes" placeholder="VD: LPQmtkUs, Xh9VNQoA hoặc dán nguyên link">
      </div>
    </div>
    <div class="row">
      <button class="ok" onclick="saveCfg()">💾 Lưu cấu hình</button>
      <button onclick="runAction('ping')">💓 Ping nuôi Token ngay</button>
      <button onclick="runAction('snipe')">🎯 Quét & Tham gia ngay</button>
    </div>
  </div>

  <div class="card">
    <h2>👥 Kho Apple ID & Token đã lưu (<span id="accCount">0</span>)</h2>
    <div id="accList">Đang tải...</div>
    <details style="margin-top:8px">
      <summary style="cursor:pointer;color:var(--accent);font-weight:600">➕ Thêm / Nạp tay nick Apple ID</summary>
      <div style="margin-top:8px">
        <label>Tên gợi nhớ</label><input id="mAlias" placeholder="VD: Nick US Chính">
        <label>Account ID (UUID 36 ký tự)</label><input id="mId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
        <label>x-session-id</label><input id="mSid">
        <label>x-request-id</label><input id="mRid">
        <label>x-session-digest</label><input id="mDig">
        <button style="margin-top:8px" onclick="addManual()">➕ Lưu nick vào kho</button>
      </div>
    </details>
  </div>

  <div class="card">
    <h2>📜 Nhật ký hoạt động</h2>
    <div id="logs" class="logs">Chưa có log.</div>
  </div>

<script>
const api = (path, body) => fetch(path, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}).then(r=>r.json());
function setStat(t, ok=true){const el=document.getElementById('syncStat');el.textContent=t;el.className='badge '+(ok?'b-ok':'b-err');}
function copyTxt(t){navigator.clipboard ? navigator.clipboard.writeText(t).then(()=>setStat('Đã chép!')) : prompt('Copy:', t);}

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
  document.getElementById('joinCodes').value = s.config.joinCodes.join(', ');

  const accs = Object.values(s.accounts || {});
  document.getElementById('accCount').textContent = accs.length;
  const wrap = document.getElementById('accList');
  if(!accs.length){
    wrap.innerHTML = '<div class="sub">Chưa có nick nào. Hãy mở app TestFlight để script tự chụp, hoặc thêm tay ở dưới.</div>';
  } else {
    wrap.innerHTML = accs.map(a => {
      const isPin = s.config.activeId === a.id;
      const alive = a.status !== 'EXPIRED_401';
      const tPing = a.lastPing ? new Date(a.lastPing).toLocaleString('vi-VN') : '-';
      return '<div class="acc">'
        + '<div class="row" style="justify-content:space-between">'
        + '<div><b>'+a.alias+'</b> '+(isPin?'<span class="badge b-pin">ĐANG GHIM</span> ':'')
        + '<span class="badge '+(alive?'b-ok':'b-err')+'">'+(alive?'ALIVE':'401 HẾT HẠN')+'</span></div>'
        + '<div class="sub" style="margin:0">Apps: '+(a.appCount||0)+' • Ping: '+tPing+'</div></div>'
        + '<div class="kv"><b>accountId:</b> '+a.id+'</div>'
        + '<div class="kv"><b>x-session-id:</b> '+a.xSessionId+'</div>'
        + '<div class="kv"><b>x-request-id:</b> '+(a.xRequestId||'-')+'</div>'
        + '<div class="kv"><b>x-session-digest:</b> '+a.xSessionDigest+'</div>'
        + '<div class="row" style="margin-top:6px;margin-bottom:0">'
        + '<button onclick="pinAcc(\\''+a.id+'\\')">📌 Ghim làm Nick Chính</button>'
        + '<button class="sec" onclick="renameAcc(\\''+a.id+'\\',\\''+a.alias.replace(/'/g,'')+'\\')">✏️ Đổi tên</button>'
        + '<button class="sec" onclick="copyTxt(\\''+a.id+'\\')">📋 Chép UUID</button>'
        + '<button class="err" onclick="delAcc(\\''+a.id+'\\')">🗑️ Xóa</button>'
        + '</div></div>';
    }).join('');
  }
  document.getElementById('logs').textContent = (s.logs || []).join('\\n') || 'Chưa có log.';
  setStat('Sẵn sàng');
}

async function saveCfg(){
  setStat('Đang lưu...');
  await api('/api/config', {
    mode: document.getElementById('mode').value,
    country: document.getElementById('country').value,
    universal: document.getElementById('universal').checked,
    alwaysInstall: document.getElementById('alwaysInstall').checked,
    autoJoin: document.getElementById('autoJoin').checked,
    autoInstall: document.getElementById('autoInstall').checked,
    keepAliveMin: Number(document.getElementById('keepAliveMin').value) || 30,
    joinCodes: document.getElementById('joinCodes').value,
  });
  await loadState();
}

async function pinAcc(id){ await api('/api/pin', { id }); await loadState(); }
async function renameAcc(id, oldName){
  const alias = prompt('Đặt tên mới cho nick:', oldName);
  if(alias && alias.trim()){ await api('/api/rename', { id, alias: alias.trim() }); await loadState(); }
}
async function delAcc(id){
  if(confirm('Xóa nick '+id+' khỏi kho?')){ await api('/api/delete', { id }); await loadState(); }
}
async function addManual(){
  const payload = {
    alias: document.getElementById('mAlias').value.trim(),
    id: document.getElementById('mId').value.trim(),
    xSessionId: document.getElementById('mSid').value.trim(),
    xRequestId: document.getElementById('mRid').value.trim(),
    xSessionDigest: document.getElementById('mDig').value.trim(),
  };
  const r = await api('/api/manual', payload);
  if(!r.ok) alert(r.error || 'Thiếu dữ liệu UUID / Token!');
  await loadState();
}
async function runAction(act){
  setStat('Đang chạy '+act+'...');
  const r = await api('/api/action', { action: act });
  setStat('Xong: '+act);
  await loadState();
  alert('Kết quả '+act+':\\n'+JSON.stringify(r.result, null, 2));
}
loadState();
</script>
</body>
</html>`;
  return $done({
    response: {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      body: html,
    },
  });
}

async function handleWebUiRequest() {
  const url = $request.url || '';
  const path = url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0] || '/';
  let body = {};
  if ($request.body) {
    try { body = JSON.parse($request.body); } catch (_) {}
  }

  if (path === '/' || path === '/index.html') return renderHtmlDashboard();

  if (path === '/api/state') {
    return jsonResp({
      version: HUB_VERSION,
      config: getConfig(),
      accounts: readJson(KEYS.ACCOUNTS, {}),
      appCountMapped: Object.keys(readJson(KEYS.APPLIST, {})).length,
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
    if (body.joinCodes !== undefined) storeWrite(KEYS.JOIN_CODES, extractCodes(body.joinCodes).join(','));
    addLog('INFO', 'Đã lưu cấu hình từ Web UI');
    return jsonResp({ ok: true });
  }

  if (path === '/api/pin' && body.id) {
    storeWrite(KEYS.ACTIVE_ID, String(body.id).toLowerCase());
    storeWrite(KEYS.MODE, 'PIN');
    addLog('INFO', `Đã ghim nick chính: ${String(body.id).slice(0, 8)}...`);
    return jsonResp({ ok: true });
  }

  if (path === '/api/rename' && body.id && body.alias) {
    const accounts = readJson(KEYS.ACCOUNTS, {});
    if (accounts[body.id]) {
      accounts[body.id].alias = String(body.alias).slice(0, 40);
      storeWrite(KEYS.ACCOUNTS, accounts);
    }
    return jsonResp({ ok: true });
  }

  if (path === '/api/delete' && body.id) {
    const accounts = readJson(KEYS.ACCOUNTS, {});
    delete accounts[body.id];
    storeWrite(KEYS.ACCOUNTS, accounts);
    if (storeRead(KEYS.ACTIVE_ID, '') === body.id) storeWrite(KEYS.ACTIVE_ID, '');
    addLog('WARN', `Đã xóa nick: ${String(body.id).slice(0, 8)}...`);
    return jsonResp({ ok: true });
  }

  if (path === '/api/manual') {
    const saved = upsertAccount(body.id, {}, {
      alias: body.alias,
      xSessionId: body.xSessionId,
      xRequestId: body.xRequestId,
      xSessionDigest: body.xSessionDigest,
    });
    if (!saved) return jsonResp({ ok: false, error: 'UUID (36 ký tự), x-session-id và x-session-digest là bắt buộc.' }, 400);
    return jsonResp({ ok: true, account: saved });
  }

  if (path === '/api/action') {
    if (body.action === 'ping') {
      const result = await pingAllAccounts(true);
      return jsonResp({ ok: true, result });
    }
    if (body.action === 'snipe') {
      const result = await runSlotSniper(false);
      return jsonResp({ ok: true, result });
    }
    return jsonResp({ ok: false, error: 'Unknown action' }, 400);
  }

  return jsonResp({ error: 'Not Found' }, 404);
}

// ============================================================================
// 8. ĐIỂM VÀO CHÍNH (ROUTER 4 CHẾ ĐỘ: WEB UI / MITM REQ / MITM RESP / CRON)
// ============================================================================
async function main() {
  if (isResp) {
    return handleTestFlightResponse();
  }
  if (isReq) {
    const url = ($request && $request.url) || '';
    if (url.includes(`://${HUB_HOST}`)) {
      return await handleWebUiRequest();
    }
    return await handleTestFlightRequest();
  }
  // Chế độ Cron ngầm: Nuôi token định kỳ + Săn & tự động tham gia link TestFlight
  const cfg = getConfig();
  await pingAllAccounts(false);
  if (cfg.autoJoin && cfg.joinCodes.length > 0) {
    await runSlotSniper(false);
  }
  $done();
}

// Cho phép kiểm thử cú pháp & hàm trên Node.js mà không tự chạy main()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HUB_VERSION,
    KEYS,
    STOREFRONT_MAP,
    extractCodes,
    patchStorefrontInBody,
    modBuild,
    patchAppsListUniversal,
  };
} else {
  main().catch((err) => {
    addLog('ERR', String(err && err.message ? err.message : err));
    try { $done({}); } catch (_) {}
  });
}

