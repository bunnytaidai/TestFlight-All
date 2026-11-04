/*
Script Author: DecoAri
Fix Author: Hely-T
Upgraded: v4.6.0.0 (Loon & Shadowrocket Multi-Account Apple ID + Auto-seed Google Chrome beta LPQmtkUs)
Reference: https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Resource/Script/TestFlight/TF_keys.js
Các bước sử dụng cụ thể:
- Nhập Plugin / Module trên Loon hoặc Shadowrocket
- Vào trang MitM để kích hoạt và bật MitM qua HTTP/2 (testflight.apple.com)
- Mặc định đã tích hợp sẵn APP_ID: LPQmtkUs (Google Chrome beta - https://testflight.apple.com/join/LPQmtkUs)
- Hỗ trợ tự động lưu nhiều tài khoản Apple ID (Multi-Account Pool) và tự động đổi nick khi nhấn biểu tượng Tài khoản trong ứng dụng TestFlight!
*/

const DEFAULT_CHROME_BETA_ID = 'LPQmtkUs';
const reg1 = /^https:\/\/testflight\.apple\.com\/v3\/accounts\/(.*)\/apps$/;
const reg2 = /^https:\/\/testflight\.apple\.com\/join\/(.*)/;
const regDevices = /^https:\/\/testflight\.apple\.com\/v1\/devices(\/.*)?$/;

function getHeader(headers, name) {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return '';
}

function readAccountsPool() {
  try {
    const raw = $persistentStore.read('TF_ACCOUNTS');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function writeAccountsPool(pool) {
  try {
    $persistentStore.write(JSON.stringify(pool), 'TF_ACCOUNTS');
  } catch (e) {}
}

function ensureDefaultAppId() {
  let appId = $persistentStore.read('APP_ID');
  if (!appId || !appId.trim()) {
    $persistentStore.write(DEFAULT_CHROME_BETA_ID, 'APP_ID');
    return DEFAULT_CHROME_BETA_ID;
  }
  return appId;
}

function syncAccountToPool(accountObj) {
  if (!accountObj || !accountObj.key || !accountObj.session_id) return { total: 0, isNew: false };
  const pool = readAccountsPool();
  const idx = pool.findIndex((item) => item && item.key === accountObj.key);
  let isNew = false;
  if (idx >= 0) {
    pool[idx] = Object.assign({}, pool[idx], accountObj, { updatedAt: new Date().toISOString() });
  } else {
    isNew = true;
    pool.push(Object.assign({ label: `AppleID #${pool.length + 1}` }, accountObj, { updatedAt: new Date().toISOString() }));
  }
  writeAccountsPool(pool);
  return { total: pool.length, isNew };
}

function unique(arr) {
  return Array.from(new Set(arr));
}

if (typeof $request !== 'undefined' && $request) {
  const url = $request.url || '';

  if (reg1.test(url)) {
    $persistentStore.write(null, 'request_id');
    let key = url.replace(/(.*accounts\/)(.*)(\/apps)/, '$2');
    let session_id = getHeader($request.headers, 'x-session-id');
    let session_digest = getHeader($request.headers, 'x-session-digest');
    let request_id = getHeader($request.headers, 'x-request-id');
    let ua = getHeader($request.headers, 'user-agent') || 'TestFlight/3.5.0 (iPhone; iOS 17.4; Scale/3.00)';

    $persistentStore.write(key, 'key');
    $persistentStore.write(session_id, 'session_id');
    $persistentStore.write(session_digest, 'session_digest');
    $persistentStore.write(request_id, 'request_id');
    $persistentStore.write(ua, 'tf_ua');

    const currentAppIds = ensureDefaultAppId();
    const syncInfo = syncAccountToPool({
      key: key,
      session_id: session_id,
      session_digest: session_digest,
      request_id: request_id,
      tf_ua: ua
    });

    if ($persistentStore.read('request_id') !== null) {
      $notification.post(
        'Thu thập Apple ID TestFlight thành công 🎉',
        `Tài khoản (${key.slice(0, 8)}...) | Tổng kho: ${syncInfo.total} nick`,
        `Đang canh tự động APP_ID: ${currentAppIds}`
      );
    } else {
      $notification.post(
        'Thu thập thông tin TF thất bại ⚠️',
        'Vui lòng bật MitM qua HTTP/2 và khởi động lại VPN + TestFlight!',
        ''
      );
    }
    $done({});
  } else if (reg2.test(url)) {
    let appId = ensureDefaultAppId();
    let arr = appId.split(',').map((s) => s.trim()).filter(Boolean);
    const match = reg2.exec(url);
    const id = match && match[1] ? match[1].replace(/[^A-Za-z0-9]/g, '') : '';
    if (id) {
      arr.push(id);
      arr = unique(arr).filter((a) => a);
      appId = arr.join(',');
      $persistentStore.write(appId, 'APP_ID');
      $notification.post('TestFlight Tự động tham gia', `Đã thêm APP_ID: ${id}`, `Danh sách hiện tại: ${appId}`);
    }
    $done({});
  } else if (regDevices.test(url)) {
    const pool = readAccountsPool();
    if (pool.length > 1) {
      let idx = parseInt($persistentStore.read('TF_ACTIVE_ACCOUNT_INDEX') || '0', 10);
      if (isNaN(idx)) idx = 0;
      idx = (idx + 1) % pool.length;
      const nextAcc = pool[idx];
      $persistentStore.write(String(idx), 'TF_ACTIVE_ACCOUNT_INDEX');
      $persistentStore.write(nextAcc.key, 'key');
      $persistentStore.write(nextAcc.session_id, 'session_id');
      $persistentStore.write(nextAcc.session_digest, 'session_digest');
      $persistentStore.write(nextAcc.request_id, 'request_id');
      if (nextAcc.tf_ua) $persistentStore.write(nextAcc.tf_ua, 'tf_ua');
      $notification.post(
        '🔄 Đã tự động đổi Apple ID',
        `Đang dùng: ${nextAcc.label || 'AppleID #' + (idx + 1)} (${nextAcc.key.slice(0, 8)}...)`,
        `Tổng số tài khoản đã lưu: ${pool.length}`
      );
    }
    $done({});
  } else {
    $done({});
  }
} else {
  $done({});
}
