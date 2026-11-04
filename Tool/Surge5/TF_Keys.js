/*
Script Author: DecoAri / Hely-T
Upgraded: v4.6.0.0 (Multi-Account Apple ID + Auto-seed Google Chrome beta LPQmtkUs)
*/
const DEFAULT_CHROME_BETA_ID = 'LPQmtkUs';

function getHeader(headers, name) {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return '';
}

$persistentStore.write(null, 'request_id');
let url = $request.url || '';
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

let appId = $persistentStore.read('APP_ID');
if (!appId || !appId.trim()) {
  appId = DEFAULT_CHROME_BETA_ID;
  $persistentStore.write(appId, 'APP_ID');
}

try {
  let pool = [];
  const raw = $persistentStore.read('TF_ACCOUNTS');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) pool = parsed;
  }
  const idx = pool.findIndex((a) => a && a.key === key);
  const accObj = { key, session_id, session_digest, request_id, tf_ua: ua, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    pool[idx] = Object.assign({}, pool[idx], accObj);
  } else {
    pool.push(Object.assign({ label: `AppleID #${pool.length + 1}` }, accObj));
  }
  $persistentStore.write(JSON.stringify(pool), 'TF_ACCOUNTS');
} catch (e) {}

if ($persistentStore.read('request_id') !== null) {
  $notification.post('Thu thập Apple ID thành công 🎉', `Tài khoản: ${key.slice(0, 8)}...`, `APP_ID tự động: ${appId}`);
} else {
  $notification.post('Không thể lấy được thông tin', 'Vui lòng mở MITM, bật HTTP/2 và thêm testflight.apple.com', '');
}
$done({});
