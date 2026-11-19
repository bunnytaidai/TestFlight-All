/*
 * Script: TF_Link_Helper.js (Plugin 3: Trợ Lý Bắt Link Nhanh, Đổi Link itms-beta:// & Quản Lý Hàng Đợi Offline)
 * Phiên bản: version.5.1.0.0
 * Hỗ trợ: Loon ($loon) & Shadowrocket ($rocket) & Surge / Stash
 * Tác dụng thực tế:
 * 1. Tích hợp sẵn bộ 5 ứng dụng Beta mặc định:
 *    - Microsoft Edge beta (rqvYCYOp) | Notion beta (YSo8aVCS) | Notion Agents beta (m2kxP5cw) | Google Chrome beta (LPQmtkUs) | Aloha Browser VPN beta (Xh9VNQoA)
 * 2. Tự động bắt mọi liên kết https://testflight.apple.com/join/<CODE> khi bạn bấm từ Safari, Telegram, Facebook, X...
 *    để gom ngay vào hàng đợi `APP_ID` và `TF_RADAR_IDS` không cần copy/paste thủ công.
 * 3. Tùy chọn `AutoOpenApp = true` (hoặc thêm `?open=1` vào cuối link): chuyển hướng thẳng sang `itms-beta://testflight.apple.com/join/<CODE>`
 *    mở trực tiếp ứng dụng TestFlight siêu tốc, bỏ qua trang trung gian Safari.
 * 4. Cung cấp Trình Quản Lý Hàng Đợi & Đa Tài Khoản Offline `http://tf-link.test/` (tải < 10ms không cần mạng ngoài,
 *    hỗ trợ lọc hàng loạt mã TestFlight từ đoạn tin nhắn dài, chuyển đổi Nick Apple ID 1 chạm, ẩn khóa bảo mật).
 */

const DEFAULT_BETA_TARGETS = {
    rqvYCYOp: 'Microsoft Edge beta',
    YSo8aVCS: 'Notion: Ghi chép, Nhiệm vụ, AI beta',
    m2kxP5cw: 'Notion Agents beta',
    LPQmtkUs: 'Google Chrome beta',
    Xh9VNQoA: 'Aloha Browser – Private VPN beta'
};
const DEFAULT_BETA_IDS = Object.keys(DEFAULT_BETA_TARGETS);
const DEFAULT_CHROME_ID = 'LPQmtkUs';

function getPlatform() {
    if (typeof $loon !== 'undefined') return 'Loon';
    if (typeof $rocket !== 'undefined') return 'Shadowrocket';
    if (typeof $environment !== 'undefined' && $environment['surge-version']) return 'Surge';
    return 'Loon/Shadowrocket';
}

const PLATFORM = getPlatform();

function readStore(key, fallback = '') {
    if (typeof $persistentStore !== 'undefined') {
        const v = $persistentStore.read(key);
        return (v !== undefined && v !== null && v !== 'null' && v !== 'undefined') ? v : fallback;
    }
    if (typeof $prefs !== 'undefined') {
        const v = $prefs.valueForKey(key);
        return (v !== undefined && v !== null && v !== 'null' && v !== 'undefined') ? v : fallback;
    }
    return fallback;
}

function writeStore(val, key) {
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (typeof $persistentStore !== 'undefined') return $persistentStore.write(s, key);
    if (typeof $prefs !== 'undefined') return $prefs.setValueForKey(s, key);
    return false;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function maskToken(val) {
    if (!val) return '(trống)';
    const s = String(val);
    if (s.length <= 8) return '***';
    return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function extractCodesFromBulkText(text) {
    if (!text) return [];
    const str = String(text);
    const found = [];
    const urlReg = /testflight\.apple\.com\/join\/([A-Za-z0-9]{5,12})/gi;
    let m;
    while ((m = urlReg.exec(str)) !== null) {
        if (!found.includes(m[1])) found.push(m[1]);
    }
    if (found.length > 0) return found;

    for (const token of str.split(/[,;|+\s\n]+/)) {
        const clean = token.replace(/[\[\]\{\}"']/g, '').trim();
        if (/^[A-Za-z0-9]{5,12}$/.test(clean) && !/^(APP_ID|http|https|true|false|null|undefined)$/i.test(clean)) {
            if (!found.includes(clean)) found.push(clean);
        }
    }
    return found;
}

function getRemovedIds() {
    const raw = readStore('TF_REMOVED_IDS', '');
    return new Set(raw ? String(raw).split(/[,;|+\s]+/).filter(Boolean) : []);
}

function markIdRemoved(id) {
    if (!id) return;
    const set = getRemovedIds();
    set.add(id);
    writeStore(Array.from(set).join(','), 'TF_REMOVED_IDS');
}

function unmarkIdRemoved(id) {
    if (!id) return;
    const set = getRemovedIds();
    if (set.delete(id)) {
        writeStore(Array.from(set).join(','), 'TF_REMOVED_IDS');
    }
}

function isAutoOpenEnabled(url) {
    if (/[?&]open=1\b/i.test(url)) return true;
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            if (typeof $argument === 'object') {
                return String($argument.AutoOpenApp || 'false') === 'true';
            }
            if (/AutoOpenApp\s*=\s*"?true"?/i.test(String($argument))) return true;
        }
    } catch (e) {}
    return readStore('TF_AUTO_OPEN_APP', 'false') === 'true';
}

function getAppIdQueue() {
    const existing = extractCodesFromBulkText(readStore('APP_ID', ''));
    const removed = getRemovedIds();
    const accounts = loadAccounts();
    const merged = [...existing];
    for (const id of DEFAULT_BETA_IDS) {
        if (merged.includes(id) || removed.has(id)) continue;
        const allJoined = accounts.length > 0
            ? accounts.every(acc => acc && Array.isArray(acc.joinedApps) && acc.joinedApps.includes(id))
            : (id === DEFAULT_CHROME_ID && readStore('TF_DEFAULT_CHROME_JOINED', 'false') === 'true');
        if (!allJoined) merged.push(id);
    }
    return merged;
}

function saveAppIdQueue(list) {
    const unique = Array.from(new Set(list.filter(Boolean)));
    writeStore(unique.join(','), 'APP_ID');
    const radar = extractCodesFromBulkText(readStore('TF_RADAR_IDS', ''));
    for (const c of unique) {
        if (!radar.includes(c)) radar.push(c);
    }
    if (radar.length > 0) writeStore(radar.join(','), 'TF_RADAR_IDS');
    return unique;
}

function loadAccounts() {
    try {
        const p = JSON.parse(readStore('TF_ACCOUNTS', '[]'));
        return Array.isArray(p) ? p : [];
    } catch (e) {
        return [];
    }
}

function buildResponse(status, contentType, bodyStr, extraHeaders = {}) {
    const headers = Object.assign({
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
    }, extraHeaders);
    if (typeof $task !== 'undefined') return { status: `HTTP/1.1 ${status}`, headers, body: bodyStr };
    return { response: { status, headers, body: bodyStr } };
}

function renderManagerHtml() {
    const queue = getAppIdQueue();
    const accounts = loadAccounts();
    const activeIdx = parseInt(readStore('TF_ACTIVE_ACCOUNT_IDX', '0'), 10) || 0;
    const autoSwitch = readStore('TF_AUTO_SWITCH_ACCOUNT', 'true') !== 'false';
    const autoOpen = readStore('TF_AUTO_OPEN_APP', 'false') === 'true';

    const queueHtml = queue.length === 0
        ? `<div class="muted">Hàng đợi đang trống. Nhấn "+ Nạp Bộ 5 App Mặc Định" hoặc dán tin nhắn chứa nhiều link TestFlight vào ô bên trên!</div>`
        : queue.map(code => `
          <div class="chip">
            <code>${escapeHtml(code)}</code>
            ${DEFAULT_BETA_TARGETS[code] ? `<span class="small" style="margin:0">${escapeHtml(DEFAULT_BETA_TARGETS[code])}</span>` : ''}
            <a href="itms-beta://testflight.apple.com/join/${encodeURIComponent(code)}">Mở App</a>
            <button onclick="delId('${escapeHtml(code)}')">✕</button>
          </div>`).join('');

    const accHtml = accounts.length === 0
        ? `<div class="muted">Chưa có nick Apple ID nào trong kho. Hãy bật VPN + MitM và mở ứng dụng <b>TestFlight</b> 1 lần để tự động thu thập!</div>`
        : accounts.map((acc, idx) => `
          <div class="acc ${idx === activeIdx ? 'active' : ''}">
            <div>
              <b>${idx === activeIdx ? '🟢 ' : ''}${escapeHtml(acc.name || ('Apple ID #' + (idx + 1)))}</b>
              <div class="small">UUID: ${escapeHtml(maskToken(acc.key))} • Session: ${escapeHtml(maskToken(acc.session_id))} • Đã vào: ${(acc.joinedApps || []).length} app</div>
            </div>
            <button class="btn" onclick="activateAcc(${idx})">${idx === activeIdx ? 'Đang dùng' : 'Chọn nick này'}</button>
          </div>`).join('');

    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TF Link & Queue Hub — ${escapeHtml(PLATFORM)}</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  body{margin:0;padding:16px;background:#0b1120;color:#f3f4f6;max-width:680px;margin-inline:auto}
  h1{font-size:20px;margin:0 0 4px}.sub{font-size:13px;color:#9ca3af;margin-bottom:14px}
  .box{background:#111827;border:1px solid #1f2937;border-radius:14px;padding:14px;margin-bottom:14px}
  h2{font-size:15px;margin:0 0 10px;color:#93c5fd}
  textarea{width:100%;min-height:76px;background:#030712;color:#f3f4f6;border:1px solid #1f2937;border-radius:10px;padding:10px;font-size:13px}
  .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .btn{padding:8px 12px;border-radius:9px;border:1px solid #374151;background:#1f2937;color:#f3f4f6;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none}
  .btn.primary{background:#2563eb;border-color:#2563eb}
  .chips{display:flex;gap:8px;flex-wrap:wrap}
  .chip{display:inline-flex;align-items:center;gap:8px;background:#030712;border:1px solid #1f2937;padding:6px 10px;border-radius:999px;font-size:13px}
  .chip a{color:#60a5fa;text-decoration:none;font-weight:600}.chip button{background:none;border:none;color:#f87171;cursor:pointer;font-weight:700}
  .acc{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px;border-radius:10px;border:1px solid #1f2937;margin-bottom:8px;background:#03071288}
  .acc.active{border-color:#10b98188;background:#064e3b33}
  .small,.muted{font-size:12px;color:#9ca3af;margin-top:3px}
</style></head>
<body>
  <h1>🔗 Quản Lý Hàng Đợi & Link TestFlight (${escapeHtml(PLATFORM)})</h1>
  <div class="sub">100% Offline Siêu Tốc • Tự bóc tách hàng loạt link từ tin nhắn Telegram/Discord</div>

  <div class="box">
    <h2>1. Bóc Tách & Thêm Hàng Loạt Link TestFlight</h2>
    <textarea id="bulk" placeholder="Dán cả đoạn tin nhắn chứa nhiều link https://testflight.apple.com/join/XXXX hoặc danh sách mã vào đây..."></textarea>
    <div class="row">
      <button class="btn primary" onclick="addBulk()">+ Lọc & Đưa Vào Hàng Đợi Săn</button>
      <button class="btn" onclick="seedDefaults()">+ Nạp Bộ 5 App Mặc Định (Edge, Notion, Chrome, Aloha)</button>
      <button class="btn" onclick="toggleOpt('autoSwitch')">Xoay vòng Nick: <b>${autoSwitch ? 'BẬT' : 'TẮT'}</b></button>
      <button class="btn" onclick="toggleOpt('autoOpen')">Tự mở thẳng App: <b>${autoOpen ? 'BẬT' : 'TẮT'}</b></button>
    </div>
  </div>

  <div class="box">
    <h2>2. Hàng Đợi APP_ID Đang Săn (${queue.length})</h2>
    <div class="chips">${queueHtml}</div>
  </div>

  <div class="box">
    <h2>3. Kho Đa Tài Khoản Apple ID (${accounts.length} nick — Đã ẩn khóa nhạy cảm)</h2>
    ${accHtml}
  </div>

  <div class="box">
    <h2>4. Trung Tâm Điều Khiển Nhanh</h2>
    <div class="row">
      <a class="btn" href="http://tf-radar.test/">📡 Mở Radar Slot</a>
      <a class="btn" href="http://tf-status.test/">⏳ Mở Bảng Hạn 90 Ngày</a>
      <a class="btn" href="http://tf-diag.test/">🩺 Mở Chẩn Đoán Mạng</a>
      <a class="btn" href="http://boxjs.com/">📦 Mở BoxJs</a>
    </div>
  </div>
<script>
async function addBulk(){
  const t=document.getElementById('bulk').value;
  if(!t.trim())return;
  await fetch('/api/add',{method:'POST',body:t});
  location.reload();
}
async function seedDefaults(){
  await fetch('/api/seed-defaults');
  location.reload();
}
async function delId(c){
  await fetch('/api/del?code='+encodeURIComponent(c));
  location.reload();
}
async function activateAcc(i){
  await fetch('/api/switch?idx='+i);
  location.reload();
}
async function toggleOpt(k){
  await fetch('/api/toggle?key='+k);
  location.reload();
}
</script>
</body></html>`;
}

if (typeof $request !== 'undefined' && $request && $request.url) {
    const url = $request.url;

    // Nhánh 1: Bắt link trực tiếp từ testflight.apple.com/join/<CODE>
    const joinMatch = url.match(/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]{5,12})/i);
    if (joinMatch && joinMatch[1]) {
        const code = joinMatch[1];
        unmarkIdRemoved(code);
        const queue = getAppIdQueue();
        if (!queue.includes(code)) {
            queue.push(code);
            saveAppIdQueue(queue);
            if (typeof $notification !== 'undefined' && $notification.post) {
                $notification.post(
                    '🔗 TF Link Helper: Đã bắt mã mới!',
                    `Mã APP_ID: ${code}`,
                    `Hàng đợi hiện tại (${queue.length}): ${queue.join(',')}`
                );
            }
        } else {
            saveAppIdQueue(queue);
        }
        if (isAutoOpenEnabled(url)) {
            $done(buildResponse(302, 'text/plain; charset=utf-8', '', {
                Location: `itms-beta://testflight.apple.com/join/${code}`
            }));
        } else {
            $done({});
        }
    } else {
        // Nhánh 2: Bảng điều khiển nội bộ http://tf-link.test/
        const pathMatch = url.match(/^https?:\/\/[^\/]+(\/[^\?]*)?(?:\?(.*))?$/);
        const pathname = (pathMatch && pathMatch[1]) ? pathMatch[1] : '/';
        const queryStr = (pathMatch && pathMatch[2]) ? pathMatch[2] : '';
        const params = Object.fromEntries(
            queryStr.split('&').filter(Boolean).map(kv => {
                const i = kv.indexOf('=');
                return i === -1 ? [kv, ''] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))];
            })
        );

        if (pathname === '/api/add') {
            const incoming = extractCodesFromBulkText($request.body || params.q || '');
            for (const c of incoming) unmarkIdRemoved(c);
            const merged = saveAppIdQueue([...getAppIdQueue(), ...incoming]);
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, added: incoming, queue: merged })));
        } else if (pathname === '/api/seed-defaults' || pathname === '/api/seed-chrome') {
            writeStore('false', 'TF_DEFAULT_CHROME_JOINED');
            const toSeed = pathname === '/api/seed-chrome' ? [DEFAULT_CHROME_ID] : DEFAULT_BETA_IDS;
            for (const c of toSeed) unmarkIdRemoved(c);
            const merged = saveAppIdQueue([...toSeed, ...getAppIdQueue()]);
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, queue: merged })));
        } else if (pathname === '/api/del') {
            const target = (params.code || '').trim();
            if (target) markIdRemoved(target);
            if (target === DEFAULT_CHROME_ID) writeStore('true', 'TF_DEFAULT_CHROME_JOINED');
            const next = getAppIdQueue().filter(c => c !== target);
            writeStore(next.join(','), 'APP_ID');
            const radarNext = extractCodesFromBulkText(readStore('TF_RADAR_IDS', '')).filter(c => c !== target);
            writeStore(radarNext.join(','), 'TF_RADAR_IDS');
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, queue: next })));
        } else if (pathname === '/api/switch') {
            const accounts = loadAccounts();
            const idx = parseInt(params.idx || '0', 10);
            if (accounts[idx]) {
                const acc = accounts[idx];
                writeStore(String(idx), 'TF_ACTIVE_ACCOUNT_IDX');
                writeStore(acc.key, 'key');
                writeStore(acc.session_id, 'session_id');
                writeStore(acc.session_digest, 'session_digest');
                writeStore(acc.request_id, 'request_id');
                if (acc.tf_ua) writeStore(acc.tf_ua, 'tf_ua');
            }
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, activeIdx: idx })));
        } else if (pathname === '/api/toggle') {
            if (params.key === 'autoSwitch') {
                const cur = readStore('TF_AUTO_SWITCH_ACCOUNT', 'true') !== 'false';
                writeStore(cur ? 'false' : 'true', 'TF_AUTO_SWITCH_ACCOUNT');
            } else if (params.key === 'autoOpen') {
                const cur = readStore('TF_AUTO_OPEN_APP', 'false') === 'true';
                writeStore(cur ? 'false' : 'true', 'TF_AUTO_OPEN_APP');
            }
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true })));
        } else if (pathname === '/api/state') {
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify({
                ok: true,
                platform: PLATFORM,
                queue: getAppIdQueue(),
                accountCount: loadAccounts().length
            })));
        } else {
            $done(buildResponse(200, 'text/html; charset=utf-8', renderManagerHtml()));
        }
    }
} else {
    $done({});
}
