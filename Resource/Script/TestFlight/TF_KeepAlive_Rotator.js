// ============================================================================
// TF_KeepAlive_Rotator.js — Bộ Xoay Vòng Giữ Sống Token TestFlight 24/7 (v1.0.0.0)
// Tương thích: Loon 3.5+ (.conf / .plugin) & Shadowrocket 2.2+ (.conf / .sgmodule)
// Tối ưu phần cứng: iPhone A9 (iOS 15.8.8 Rootless) — RAM < 3MB
// ============================================================================
// CÁCH HOẠT ĐỘNG TRUST-FIRST (TỶ LỆ LIVE CAO NHẤT & ÍT DIE TOKEN NHẤT):
//   Bước 1: TUYỆT ĐỐI KHÔNG đưa idmsa.apple.com / gsa.apple.com / appleid.apple.com vào [Mitm].
//           Để iOS tự hoàn tất đăng nhập mật khẩu + OTP/2FA trực tiếp bằng SSL gốc của Apple.
//   Bước 2: Chỉ bật MITM trên testflight.apple.com. Khi mở app TestFlight, script tự bắt thụ động
//           phiên trên nhiều điểm cuối (/v3/accounts/{uuid}/apps, /settings, /ru/*, /v1/devices/apns).
//   Bước 3: Cron xoay vòng Round-Robin (0 */5 * * * * hoặc 0 */10 * * * *) lần lượt giữ sống
//           từng nhóm BATCH nick (mặc định 2 nick/lượt, giãn nhịp JITTER_MS=600ms tránh 429).
//   Bước 4: Tự động chuyển cụm Data Center Apple (dc=st ↔ dc=pv) ngay khi gặp HTTP 401 ảo,
//           KHÔNG BAO GIỜ ghi đè x-request-id hay cookie khi máy chủ trả mã lỗi != 2xx.
// ============================================================================
'use strict';

const ROTATOR_VERSION = '1.0.0.0';
const TF_ORIGIN = 'https://testflight.apple.com';
const TF_DC_POOL = ['st', 'pv'];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const KEY_HUB_ACCS = 'TF_HUB_ACCOUNTS';
const KEY_LEGACY_ACCS = 'TF_ACCOUNTS';
const KEY_ROTATOR_PTR = 'TF_KA_ROTATOR_IDX';
const KEY_ACTION_LOGS = 'TF_HUB_ACTION_LOGS';

const isLoon = typeof $loon !== 'undefined';
const isReq = typeof $request !== 'undefined';
const isResp = typeof $response !== 'undefined';

function parseArgs() {
  const out = { BATCH: 2, JITTER_MS: 600, NOTIFY_ERR: true };
  const isPlaceholder = (v) => {
    const s = String(v ?? '').trim();
    return !s || s.startsWith('{') || s.startsWith('[');
  };
  try {
    if (typeof $argument === 'object' && $argument !== null) {
      if (!isPlaceholder($argument.BATCH)) out.BATCH = Math.max(1, Number($argument.BATCH) || 2);
      if (!isPlaceholder($argument.JITTER_MS)) out.JITTER_MS = Math.max(100, Number($argument.JITTER_MS) || 600);
      if ($argument.NOTIFY_ERR !== undefined && !isPlaceholder($argument.NOTIFY_ERR)) {
        out.NOTIFY_ERR = String($argument.NOTIFY_ERR).toLowerCase() !== 'false';
      }
      return out;
    }
    if (typeof $argument === 'string' && $argument.trim()) {
      for (const part of $argument.split('&')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const k = decodeURIComponent(part.slice(0, idx).trim());
        const v = decodeURIComponent(part.slice(idx + 1).trim());
        if (isPlaceholder(v)) continue;
        if (k === 'BATCH') out.BATCH = Math.max(1, Number(v) || 2);
        else if (k === 'JITTER_MS') out.JITTER_MS = Math.max(100, Number(v) || 600);
        else if (k === 'NOTIFY_ERR') out.NOTIFY_ERR = v.toLowerCase() !== 'false';
      }
    }
  } catch (_) {}
  return out;
}

function readStore(key, fallback = '') {
  try {
    if (typeof $persistentStore !== 'undefined') {
      const v = $persistentStore.read(key);
      if (v !== null && v !== undefined && v !== '') return v;
    }
  } catch (_) {}
  return fallback;
}

function writeStore(key, val) {
  try {
    if (typeof $persistentStore !== 'undefined') {
      return $persistentStore.write(typeof val === 'string' ? val : JSON.stringify(val), key);
    }
  } catch (_) {}
  return false;
}

function readJson(key, fallback) {
  const raw = readStore(key, '');
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : fallback;
  } catch (_) {
    return fallback;
  }
}

function lowerHeaders(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  for (const k of Object.keys(h)) out[k.toLowerCase()] = h[k];
  return out;
}

function mergeSetCookie(existing, setCookie) {
  if (!setCookie) return existing || '';
  const jar = {};
  if (existing) {
    for (const p of String(existing).split(';')) {
      const i = p.indexOf('=');
      if (i > 0) jar[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    }
  }
  const list = Array.isArray(setCookie) ? setCookie : String(setCookie).split(/,(?=\s*[^;,=\s]+=[^;,]+)/);
  for (const item of list) {
    const first = String(item).split(';')[0] || '';
    const i = first.indexOf('=');
    if (i > 0) jar[first.slice(0, i).trim()] = first.slice(i + 1).trim();
  }
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractDc(cookieStr) {
  const m = String(cookieStr || '').match(/(?:^|;\s*)dc=([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function setDc(cookieStr, dc) {
  return dc ? mergeSetCookie(cookieStr || '', `dc=${String(dc).toLowerCase()}`) : (cookieStr || '');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function recordLog(status, action, target, detail, httpStatus = 0, durationMs = 0) {
  const entry = {
    ts: new Date().toISOString().slice(11, 19),
    status,
    action,
    target: String(target || '-').slice(0, 48),
    httpStatus: Number(httpStatus || 0),
    durationMs: Number(durationMs || 0),
    detail: String(detail || '').slice(0, 140),
  };
  try {
    console.log(`[TF-Rotator ${status}] ${action} | ${entry.target} | HTTP ${entry.httpStatus} (${entry.durationMs}ms) | ${entry.detail}`);
  } catch (_) {}
  const logs = readJson(KEY_ACTION_LOGS, []);
  if (Array.isArray(logs)) {
    logs.unshift(entry);
    if (logs.length > 60) logs.length = 60;
    writeStore(KEY_ACTION_LOGS, logs);
  }
}

function loadMergedAccounts() {
  const hub = readJson(KEY_HUB_ACCS, {});
  const legacy = readJson(KEY_LEGACY_ACCS, []);
  let changed = false;
  if (Array.isArray(legacy)) {
    for (const item of legacy) {
      if (!item || !item.key || !UUID_RE.test(item.key) || !item.session_id || !item.session_digest) continue;
      const id = String(item.key).toLowerCase();
      if (!hub[id]) {
        hub[id] = {
          id,
          alias: item.name || `Apple ID (${id.slice(0, 6)})`,
          xSessionId: item.session_id,
          xSessionDigest: item.session_digest,
          xRequestId: item.request_id || '',
          xDsid: item.xDsid || '',
          xAppleStoreFront: item.xAppleStoreFront || '',
          xAppleIMd: item.xAppleIMd || '',
          xAppleIMdM: item.xAppleIMdM || '',
          cookie: item.cookie || 'dc=st',
          ua: item.tf_ua || 'Oasis/3.3.0 OasisBuild/58 iOS/15.8.8 model/iPhone8,1 hwp/s8003 build/19H422 (6; dt:141) AMS/1 TSE/0',
          status: 'ALIVE',
          fail401: 0,
          lastSeen: Date.now(),
          lastPing: 0,
          appCount: 0,
          apps: [],
        };
        changed = true;
      }
    }
  }
  if (changed) writeStore(KEY_HUB_ACCS, hub);
  return hub;
}

function syncToLegacy(acc) {
  if (!acc || !acc.id || !acc.xSessionId || !acc.xSessionDigest) return;
  const arr = readJson(KEY_LEGACY_ACCS, []);
  const list = Array.isArray(arr) ? arr : [];
  const idx = list.findIndex((x) => x && String(x.key || '').toLowerCase() === acc.id);
  const entry = {
    key: acc.id,
    name: acc.alias || `Apple ID (${acc.id.slice(0, 6)})`,
    session_id: acc.xSessionId,
    session_digest: acc.xSessionDigest,
    request_id: acc.xRequestId || '',
    tf_ua: acc.ua || 'Oasis/3.3.0',
    xDsid: acc.xDsid || '',
    xAppleStoreFront: acc.xAppleStoreFront || '',
    cookie: acc.cookie || 'dc=st',
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  if (idx >= 0) list[idx] = Object.assign({}, list[idx], entry);
  else list.push(entry);
  writeStore(KEY_LEGACY_ACCS, list);
}

function buildHeaders(acc, dc) {
  const out = {
    'X-Session-Id': acc.xSessionId,
    'X-Session-Digest': acc.xSessionDigest,
    'User-Agent': acc.ua || 'Oasis/3.3.0 OasisBuild/58 iOS/15.8.8 model/iPhone8,1',
    'Accept': 'application/json',
    'Accept-Language': acc.acceptLang || 'vi-VN,vi;q=0.9,en-US;q=0.8',
    'Cookie': setDc(acc.cookie, dc || extractDc(acc.cookie) || 'st'),
    'X-TF-Hub-Internal': '1',
  };
  if (acc.xRequestId) out['X-Request-Id'] = acc.xRequestId;
  if (acc.xDsid) out['X-Dsid'] = acc.xDsid;
  if (acc.xAppleStoreFront) out['X-Apple-Store-Front'] = acc.xAppleStoreFront;
  if (acc.xAppleIMd) out['X-Apple-I-MD'] = acc.xAppleIMd;
  if (acc.xAppleIMdM) out['X-Apple-I-MD-M'] = acc.xAppleIMdM;
  return out;
}

function httpGet(url, headers, timeoutSec = 12) {
  const started = Date.now();
  return new Promise((resolve) => {
    if (typeof $httpClient === 'undefined') {
      return resolve({ error: 'No $httpClient', status: 0, headers: {}, body: '', durationMs: 0 });
    }
    $httpClient.get(
      {
        url,
        headers,
        timeout: isLoon ? timeoutSec * 1000 : timeoutSec,
        'auto-cookie': false,
        'X-Surge-Skip-Scripting': true,
      },
      (err, resp, data) => {
        const durationMs = Date.now() - started;
        if (err) return resolve({ error: String(err), status: 0, headers: {}, body: '', durationMs });
        resolve({
          error: null,
          status: (resp && (resp.status || resp.statusCode)) || 0,
          headers: (resp && resp.headers) || {},
          body: data || '',
          durationMs,
        });
      }
    );
  });
}

async function pingOneAccount(acc, args) {
  const firstDc = extractDc(acc.cookie) || 'st';
  const dcs = [firstDc];
  for (const dc of TF_DC_POOL) if (!dcs.includes(dc)) dcs.push(dc);

  let finalResp = null;
  let winDc = '';
  for (let i = 0; i < dcs.length; i++) {
    const dc = dcs[i];
    const r = await httpGet(`${TF_ORIGIN}/v3/accounts/${acc.id}/apps`, buildHeaders(acc, dc), 12);
    finalResp = r;
    if (r.status === 200) {
      const respDc = extractDc(lowerHeaders(r.headers)['set-cookie'] || '') || dc;
      winDc = respDc;
      acc.cookie = setDc(acc.cookie, respDc);
      // Ping phụ /settings trên đúng cụm thắng để giữ ấm phiên toàn diện
      await httpGet(`${TF_ORIGIN}/v1/accounts/${acc.id}/settings`, buildHeaders(acc, respDc), 10);
      break;
    }
    if (r.status !== 401) break;
  }

  if (finalResp && finalResp.status === 200) {
    let appCount = acc.appCount || 0;
    try {
      const parsed = JSON.parse(finalResp.body || '{}');
      if (Array.isArray(parsed.data)) {
        appCount = parsed.data.filter((a) => a && a.previouslyTested !== true).length;
      }
    } catch (_) {}
    acc.status = 'ALIVE';
    acc.fail401 = 0;
    acc.lastPing = Date.now();
    acc.appCount = appCount;
    recordLog('OK', 'ROTATE_KA', acc.alias, `Giữ sống OK (dc=${winDc}, ${appCount} apps)`, 200, finalResp.durationMs);
    return true;
  }

  if (finalResp && finalResp.status === 401) {
    acc.fail401 = (acc.fail401 || 0) + 1;
    acc.lastPing = Date.now();
    if (acc.fail401 >= 2) {
      acc.status = 'EXPIRED_401';
      if (args.NOTIFY_ERR && typeof $notification !== 'undefined') {
        $notification.post('TF Rotator — Cần làm mới phiên (401)', acc.alias, 'Cả 2 cụm st/pv đều báo 401. Hãy mở TestFlight bằng nick này 1 lần.');
      }
    }
    recordLog('ERR', 'ROTATE_KA', acc.alias, `401 cả 2 cụm st/pv (${acc.fail401}/2)`, 401, finalResp.durationMs);
    return false;
  }

  recordLog('WARN', 'ROTATE_KA', acc.alias, `Tạm lỗi mạng: ${(finalResp && (finalResp.error || 'HTTP ' + finalResp.status)) || 'timeout'}`, (finalResp && finalResp.status) || 0, (finalResp && finalResp.durationMs) || 0);
  return false;
}

function passiveCaptureOnRequest() {
  const h = lowerHeaders(($request && $request.headers) || {});
  if (h['x-tf-hub-internal'] === '1') return $done({});
  const url = ($request && $request.url) || '';
  const m = url.match(/\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  if (m && h['x-session-id'] && h['x-session-digest']) {
    const id = m[1].toLowerCase();
    const hub = loadMergedAccounts();
    const prev = hub[id] || {};
    hub[id] = Object.assign({}, prev, {
      id,
      alias: prev.alias || `Apple ID (${id.slice(0, 6)})`,
      xSessionId: h['x-session-id'],
      xSessionDigest: h['x-session-digest'],
      xRequestId: h['x-request-id'] || prev.xRequestId || '',
      xDsid: h['x-dsid'] || h['x-apple-dsid'] || prev.xDsid || '',
      xAppleStoreFront: h['x-apple-store-front'] || prev.xAppleStoreFront || '',
      cookie: h['cookie'] || prev.cookie || 'dc=st',
      ua: h['user-agent'] || prev.ua || 'Oasis/3.3.0',
      status: 'ALIVE',
      fail401: 0,
      lastSeen: Date.now(),
    });
    writeStore(KEY_HUB_ACCS, hub);
    syncToLegacy(hub[id]);
  }
  return $done({});
}

async function runCronRotation() {
  const startedAt = Date.now();
  const args = parseArgs();
  const hub = loadMergedAccounts();
  const ids = Object.keys(hub);
  if (!ids.length) {
    recordLog('INFO', 'ROTATE_KA', 'Vault', 'Chưa có nick nào trong kho để xoay vòng.', 0, 0);
    return $done();
  }
  const ptr = Number(readStore(KEY_ROTATOR_PTR, '0')) || 0;
  const batchSize = Math.min(args.BATCH, ids.length);
  let processed = 0;
  for (let i = 0; i < batchSize; i++) {
    if (i > 0 && Date.now() - startedAt > 18000) break; // Chống vượt giới hạn timeout 30s của NetworkExtension
    const id = ids[(ptr + i) % ids.length];
    const acc = hub[id];
    if (!acc || !acc.xSessionId || !acc.xSessionDigest) continue;
    if (i > 0) await sleep(args.JITTER_MS);
    await pingOneAccount(acc, args);
    hub[id] = acc;
    writeStore(KEY_HUB_ACCS, hub);
    syncToLegacy(acc);
    processed++;
  }
  writeStore(KEY_ROTATOR_PTR, String((ptr + Math.max(1, processed)) % ids.length));
  $done();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ROTATOR_VERSION, TF_DC_POOL, extractDc, setDc, mergeSetCookie };
} else if (isReq && !isResp) {
  passiveCaptureOnRequest();
} else if (isResp) {
  $done({});
} else {
  runCronRotation().catch((err) => {
    recordLog('ERR', 'ROTATE_KA', 'runtime', String(err && err.message ? err.message : err), 0, 0);
    try { $done(); } catch (_) {}
  });
}
