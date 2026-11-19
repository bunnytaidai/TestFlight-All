/*
 * Script: TF_Slot_Radar.js (Plugin 1: Radar Canh Slot TestFlight Công Khai — Không Cần Token)
 * Phiên bản: version.5.2.0.0
 * Hỗ trợ: Loon ($loon) & Shadowrocket ($rocket) & Surge / Stash
 * Tác dụng thực tế:
 * 1. Tích hợp sẵn 5 link mục tiêu mặc định:
 *    - Google Chrome beta (LPQmtkUs) | Aloha Browser VPN beta (Xh9VNQoA) | VilaNet beta (2mcx1R3I) | Notion beta (YSo8aVCS) | Notion Calendar Next beta (CzpZHGuS)
 * 2. Quét trạng thái Slot công khai (OPEN / FULL / INVALID) trực tiếp từ https://testflight.apple.com/join/<CODE>
 *    mà KHÔNG cần chứng chỉ MitM vào testflight.apple.com và KHÔNG cần Token Apple ID!
 * 3. Ngay khi phát hiện gói Beta mở slot (OPEN), bắn thông báo đẩy kèm Deep-Link `itms-beta://testflight.apple.com/join/<CODE>`
 *    để người dùng chạm 1 lần mở thẳng vào ứng dụng TestFlight nhận slot ngay lập tức.
 * 4. Tích hợp Bảng Điều Khiển Web Nội Bộ siêu nhẹ tại `http://tf-radar.test/` (hoạt động < 10ms, thêm/xóa mã và quét trực tiếp trên Safari).
 */

const DEFAULT_BETA_TARGETS = {
    LPQmtkUs: 'Google Chrome beta',
    Xh9VNQoA: 'Aloha Browser – Private VPN beta',
    '2mcx1R3I': 'VilaNet beta',
    YSo8aVCS: 'Notion: Notes, Tasks, AI beta',
    CzpZHGuS: 'Notion Calendar Next beta'
};
const DEFAULT_BETA_IDS = Object.keys(DEFAULT_BETA_TARGETS);
const DEFAULT_RADAR_ID = 'LPQmtkUs';
const PUBLIC_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function getDefaultAppName(code) {
    return DEFAULT_BETA_TARGETS[code] || code;
}

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

function loadJson(key, fallback) {
    try {
        const raw = readStore(key, '');
        if (!raw) return fallback;
        const p = JSON.parse(raw);
        return (p && typeof p === 'object') ? p : fallback;
    } catch (e) {
        return fallback;
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function decodeHtml(str) {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function extractCodes(rawText) {
    if (!rawText) return [];
    const text = String(rawText);
    const out = [];
    const urlRegex = /testflight\.apple\.com\/join\/([A-Za-z0-9]{5,12})/gi;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
        if (!out.includes(m[1])) out.push(m[1]);
    }
    const tokens = text.split(/[,;|+\s\n]+/);
    for (const t of tokens) {
        const clean = t.replace(/[\[\]\{\}"']/g, '').trim();
        if (/^[A-Za-z0-9]{5,12}$/.test(clean) && !/^(APP_ID|RADAR_IDS|http|https|true|false|null|undefined)$/i.test(clean)) {
            if (!out.includes(clean)) out.push(clean);
        }
    }
    return out;
}

function getRemovedRadarIds() {
    const raw = readStore('TF_REMOVED_IDS', '');
    return new Set(raw ? String(raw).split(/[,;|+\s]+/).filter(Boolean) : []);
}

function markRadarIdRemoved(id) {
    if (!id) return;
    const set = getRemovedRadarIds();
    set.add(id);
    writeStore(Array.from(set).join(','), 'TF_REMOVED_IDS');
}

function unmarkRadarIdRemoved(id) {
    if (!id) return;
    const set = getRemovedRadarIds();
    if (set.delete(id)) {
        writeStore(Array.from(set).join(','), 'TF_REMOVED_IDS');
    }
}

function getArgumentCodes() {
    if (typeof $argument === 'undefined' || !$argument) return [];
    if (typeof $argument === 'object') {
        return extractCodes($argument.RADAR_IDS || $argument.APP_ID || '');
    }
    const raw = String($argument).trim();
    if (!raw || raw === '[RADAR_IDS]' || raw === '{{{RADAR_IDS}}}') return [];
    if (raw.includes('=')) {
        const pairs = Object.fromEntries(
            raw.split('&').map(p => {
                const idx = p.indexOf('=');
                return idx === -1 ? [p.trim(), ''] : [p.slice(0, idx).trim(), p.slice(idx + 1).replace(/^"|"$/g, '').trim()];
            })
        );
        return extractCodes(pairs.RADAR_IDS || pairs.APP_ID || '');
    }
    return extractCodes(raw);
}

function getWatchList() {
    const radarRaw = readStore('TF_RADAR_IDS', '');
    const appRaw = readStore('APP_ID', '');
    const removed = getRemovedRadarIds();
    const merged = [];

    for (const c of [...extractCodes(radarRaw), ...extractCodes(appRaw)]) {
        if (!merged.includes(c)) merged.push(c);
    }
    for (const c of [...DEFAULT_BETA_IDS, ...getArgumentCodes()]) {
        if (!merged.includes(c) && !removed.has(c)) {
            merged.push(c);
        }
    }
    const nextStr = merged.join(',');
    if (nextStr !== radarRaw) {
        writeStore(nextStr, 'TF_RADAR_IDS');
    }
    return merged;
}

function saveWatchList(codes) {
    const unique = Array.from(new Set(codes.filter(Boolean)));
    writeStore(unique.join(','), 'TF_RADAR_IDS');
    // Đồng bộ sang APP_ID để Auto_Join_TF cùng săn nếu bật song song
    const appIds = extractCodes(readStore('APP_ID', ''));
    for (const c of unique) {
        if (!appIds.includes(c)) appIds.push(c);
    }
    if (appIds.length > 0) writeStore(appIds.join(','), 'APP_ID');
    return unique;
}

function sendNotify(title, subtitle, body, openUrl) {
    if (typeof $notification !== 'undefined' && $notification.post) {
        if (openUrl) {
            const attach = PLATFORM === 'Loon' ? { openUrl } : (PLATFORM === 'Shadowrocket' ? openUrl : { url: openUrl });
            $notification.post(title, subtitle || '', body || '', attach);
        } else {
            $notification.post(title, subtitle || '', body || '');
        }
    }
    console.log(`[${PLATFORM}-Radar] ${title} | ${subtitle || ''} | ${body || ''}`);
}

function parseJoinHtml(code, status, html) {
    const checkedAt = new Date().toISOString();
    if (status === 404) {
        return { code, status: 'INVALID', appName: code, iconUrl: '', message: 'Liên kết không tồn tại (HTTP 404)', checkedAt };
    }
    if (status !== 200 || !html) {
        return { code, status: 'ERROR', appName: code, iconUrl: '', message: `Tạm gián đoạn (HTTP ${status})`, checkedAt };
    }

    let appName = getDefaultAppName(code);
    const titleMatch = html.match(/<title>\s*(?:Join the\s+|Tham gia\s+|加入\s*)?(.+?)\s*-\s*TestFlight(?:\s*-\s*Apple)?\s*<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        appName = decodeHtml(titleMatch[1]);
    }

    let iconUrl = '';
    const iconMatch = html.match(/background-image:\s*url\((https:\/\/[^)]+mzstatic\.com[^)]+)\)/i)
        || html.match(/meta\s+property="og:image"\s+content="(https:\/\/[^"]+)"/i);
    if (iconMatch && iconMatch[1]) iconUrl = iconMatch[1].replace(/['"]/g, '').trim();

    const statusBlock = html.match(/<div\s+class="beta-status"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i);
    const statusText = statusBlock && statusBlock[1] ? decodeHtml(statusBlock[1].replace(/<[^>]+>/g, ' ')) : '';

    if (/doesn't exist|not found|link is invalid|isn't valid|không tồn tại|không hợp lệ/i.test(statusText || html)) {
        return { code, status: 'INVALID', appName, iconUrl, message: statusText || 'Link không hợp lệ', checkedAt };
    }
    if (/this beta is full|beta is full|not accepting any new testers|đã đầy|không nhận thêm|名额已满/i.test(statusText)) {
        return { code, status: 'FULL', appName, iconUrl, message: statusText, checkedAt };
    }
    return { code, status: 'OPEN', appName, iconUrl, message: statusText || 'Còn slot trống — Có thể tham gia ngay!', checkedAt };
}

function scanSingleCode(code) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        $httpClient.get(
            {
                url: `https://testflight.apple.com/join/${code}`,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': PUBLIC_UA
                },
                timeout: 8
            },
            (err, resp, body) => {
                const latencyMs = Date.now() - t0;
                if (err) {
                    resolve({ code, status: 'ERROR', appName: code, iconUrl: '', message: String(err), latencyMs, checkedAt: new Date().toISOString() });
                    return;
                }
                const httpStatus = resp ? (resp.status || resp.statusCode || 0) : 0;
                const parsed = parseJoinHtml(code, httpStatus, body || '');
                parsed.latencyMs = latencyMs;
                resolve(parsed);
            }
        );
    });
}

async function runRadarScan(notifyOnOpen = true) {
    const watchList = getWatchList();
    const cache = loadJson('TF_PUBLIC_RADAR_CACHE', {});
    const alertCache = loadJson('TF_OPEN_ALERT_CACHE', {});
    const results = [];

    for (const code of watchList) {
        const prevStatus = cache[code] ? cache[code].status : null;
        const info = await scanSingleCode(code);
        cache[code] = info;
        results.push(info);

        if (notifyOnOpen && info.status === 'OPEN') {
            const lastAlert = parseInt(alertCache[`radar_${code}`] || '0', 10);
            const transitioned = prevStatus && prevStatus !== 'OPEN';
            if (transitioned || isNaN(lastAlert) || Date.now() - lastAlert > 180000) {
                alertCache[`radar_${code}`] = Date.now();
                sendNotify(
                    `🟢 MỞ SLOT: ${info.appName}!`,
                    `Mã: ${code} (${info.latencyMs}ms) — Nhấn để vào ngay!`,
                    info.message,
                    `itms-beta://testflight.apple.com/join/${code}`
                );
            }
        }
    }

    writeStore(JSON.stringify(cache), 'TF_PUBLIC_RADAR_CACHE');
    writeStore(JSON.stringify(alertCache), 'TF_OPEN_ALERT_CACHE');
    writeStore(new Date().toISOString(), 'TF_RADAR_LAST_SCAN');
    return results;
}

function buildHttpResponse(status, contentType, bodyStr) {
    const headers = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
    };
    if (typeof $task !== 'undefined') {
        return { status: `HTTP/1.1 ${status} OK`, headers, body: bodyStr };
    }
    return { response: { status, headers, body: bodyStr } };
}

function renderDashboardHtml() {
    const watchList = getWatchList();
    const cache = loadJson('TF_PUBLIC_RADAR_CACHE', {});
    const lastScan = readStore('TF_RADAR_LAST_SCAN', 'Chưa quét lần nào');

    const cardsHtml = watchList.map(code => {
        const item = cache[code] || { code, appName: getDefaultAppName(code), status: 'PENDING', message: 'Bấm "Quét Ngay" để kiểm tra trực tiếp', checkedAt: '' };
        const badgeColor = item.status === 'OPEN'
            ? '#10b981'
            : (item.status === 'FULL' ? '#ef4444' : (item.status === 'INVALID' ? '#6b7280' : '#f59e0b'));
        const badgeLabel = item.status === 'OPEN'
            ? '🟢 CÒN SLOT (OPEN)'
            : (item.status === 'FULL' ? '🔴 ĐẦY SLOT (FULL)' : (item.status === 'INVALID' ? '⚪ KHÔNG TỒN TẠI' : '🟡 CHỜ QUÉT'));

        return `
        <div class="card">
          <div class="row">
            <div>
              <div class="title">${escapeHtml(item.appName || code)}</div>
              <div class="meta">Mã: <code>${escapeHtml(code)}</code> ${item.latencyMs ? `• ${Number(item.latencyMs)}ms` : ''}</div>
            </div>
            <span class="badge" style="background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}66">${badgeLabel}</span>
          </div>
          <div class="msg">${escapeHtml(item.message || '')}</div>
          <div class="actions">
            <a class="btn primary" href="itms-beta://testflight.apple.com/join/${ encodeURIComponent(code) }">✈️ Mở App TestFlight</a>
            <a class="btn" href="https://testflight.apple.com/join/${ encodeURIComponent(code) }" target="_blank">🌐 Trang Web</a>
            <button class="btn danger" onclick="removeCode('${escapeHtml(code)}')">Xóa</button>
          </div>
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>TF Slot Radar — ${escapeHtml(PLATFORM)}</title>
<style>
  :root{color-scheme:dark;--bg:#0b1120;--card:#111827;--border:#1f2937;--txt:#f3f4f6;--sub:#9ca3af;--acc:#3b82f6}
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
  body{margin:0;padding:16px;background:var(--bg);color:var(--txt);max-width:680px;margin-inline:auto}
  h1{font-size:20px;margin:0 0 4px}
  .sub{font-size:13px;color:var(--sub);margin-bottom:16px}
  .toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
  input{flex:1;min-width:190px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-size:14px}
  .btn{padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:#1f2937;color:var(--txt);text-decoration:none;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
  .btn.primary{background:var(--acc);border-color:var(--acc);color:#fff}
  .btn.success{background:#059669;border-color:#059669;color:#fff}
  .btn.danger{background:#7f1d1d44;border-color:#ef444466;color:#fca5a5}
  .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px}
  .row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
  .title{font-weight:700;font-size:16px}
  .meta{font-size:12px;color:var(--sub);margin-top:3px}
  .badge{font-size:11px;font-weight:700;padding:4px 8px;border-radius:999px;white-space:nowrap}
  .msg{font-size:13px;color:#d1d5db;margin:10px 0}
  .actions{display:flex;gap:8px;flex-wrap:wrap}
  code{background:#030712;padding:2px 6px;border-radius:5px;color:#93c5fd}
</style>
</head>
<body>
  <h1>📡 Radar Canh Slot TestFlight (${escapeHtml(PLATFORM)})</h1>
  <div class="sub">Không tốn Token Apple ID • Lần quét gần nhất: <b>${escapeHtml(lastScan)}</b></div>
  <div class="toolbar">
    <input id="codeInput" placeholder="Dán link TestFlight hoặc mã (VD: rqvYCYOp, LPQmtkUs)..." />
    <button class="btn primary" onclick="addCode()">+ Thêm Mã</button>
    <button class="btn" onclick="seedDefaults()">+ Bộ 5 App Mặc Định</button>
    <button class="btn success" id="scanBtn" onclick="scanNow()">🔄 Quét Ngay</button>
  </div>
  <div id="list">${cardsHtml}</div>
<script>
async function addCode(){
  const val=document.getElementById('codeInput').value.trim();
  if(!val)return;
  await fetch('/api/add?q='+encodeURIComponent(val));
  location.reload();
}
async function seedDefaults(){
  await fetch('/api/seed-defaults');
  location.reload();
}
async function removeCode(c){
  await fetch('/api/remove?code='+encodeURIComponent(c));
  location.reload();
}
async function scanNow(){
  const b=document.getElementById('scanBtn');
  b.textContent='⏳ Đang quét Apple...';
  b.disabled=true;
  await fetch('/api/scan');
  location.reload();
}
</script>
</body>
</html>`;
}

if (typeof $request !== 'undefined' && $request && $request.url) {
    !(async () => {
        const url = $request.url;
        const pathMatch = url.match(/^https?:\/\/[^\/]+(\/[^\?]*)?(?:\?(.*))?$/);
        const pathname = (pathMatch && pathMatch[1]) ? pathMatch[1] : '/';
        const queryStr = (pathMatch && pathMatch[2]) ? pathMatch[2] : '';
        const params = Object.fromEntries(
            queryStr.split('&').filter(Boolean).map(kv => {
                const i = kv.indexOf('=');
                return i === -1 ? [kv, ''] : [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))];
            })
        );

        if (pathname === '/api/scan') {
            const results = await runRadarScan(true);
            $done(buildHttpResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, platform: PLATFORM, results })));
            return;
        }
        if (pathname === '/api/add') {
            const added = extractCodes(params.q || '');
            for (const c of added) unmarkRadarIdRemoved(c);
            const current = getWatchList();
            for (const c of added) {
                if (!current.includes(c)) current.push(c);
            }
            const updated = saveWatchList(current);
            $done(buildHttpResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, watchList: updated })));
            return;
        }
        if (pathname === '/api/seed-defaults') {
            for (const c of DEFAULT_BETA_IDS) unmarkRadarIdRemoved(c);
            const updated = saveWatchList([...DEFAULT_BETA_IDS, ...getWatchList()]);
            $done(buildHttpResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, watchList: updated })));
            return;
        }
        if (pathname === '/api/remove') {
            const target = (params.code || '').trim();
            if (target) markRadarIdRemoved(target);
            const filtered = extractCodes(readStore('TF_RADAR_IDS', '')).filter(c => c !== target);
            writeStore(filtered.join(','), 'TF_RADAR_IDS');
            const appFiltered = extractCodes(readStore('APP_ID', '')).filter(c => c !== target);
            writeStore(appFiltered.join(','), 'APP_ID');
            $done(buildHttpResponse(200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, watchList: getWatchList() })));
            return;
        }
        if (pathname === '/api/status') {
            $done(buildHttpResponse(200, 'application/json; charset=utf-8', JSON.stringify({
                ok: true,
                platform: PLATFORM,
                watchList: getWatchList(),
                cache: loadJson('TF_PUBLIC_RADAR_CACHE', {})
            })));
            return;
        }

        $done(buildHttpResponse(200, 'text/html; charset=utf-8', renderDashboardHtml()));
    })().catch(err => {
        $done(buildHttpResponse(500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(err) })));
    });
} else {
    !(async () => {
        await runRadarScan(true);
        $done();
    })().catch(err => {
        console.log(`[${PLATFORM}-Radar] Lỗi quét Cron: ${err}`);
        $done();
    });
}
