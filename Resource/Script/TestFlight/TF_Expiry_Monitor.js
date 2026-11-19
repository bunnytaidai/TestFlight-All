/*
 * Script: TF_Expiry_Monitor.js (Plugin 2: Giám Sát Hạn 90 Ngày & Báo Bản Cập Nhật Build Beta Mới)
 * Phiên bản: version.5.0.0.0 — 100% Read-Only (Không sửa đổi gói tin phản hồi của Apple)
 * Hỗ trợ: Loon ($loon) & Shadowrocket ($rocket) & Surge / Stash
 * Tác dụng thực tế:
 * 1. Đọc phản hồi danh sách ứng dụng TestFlight (/v3/accounts/<uuid>/apps) ở chế độ CHỈ ĐỌC ($done({})),
 *    tự động bóc tách hạn dùng 90 ngày (expiresOn / expirationDate), phiên bản Build và ghi chú cập nhật (What's New).
 * 2. Cảnh báo ngay khi có ứng dụng Beta sắp hết hạn (mặc định <= 7 ngày) hoặc vừa có bản Build mới phát hành.
 * 3. Chạy Cron hàng ngày kiểm tra lại bộ đệm hạn dùng ngay cả khi bạn quên mở app TestFlight nhiều tuần.
 * 4. Trang Web Trạng Thái Nội Bộ tại `http://tf-status.test/` hiển thị thanh đếm ngược ngày hết hạn trực quan.
 */

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

function getWarnDays() {
    let days = 7;
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            if (typeof $argument === 'object' && $argument.WarnDays) {
                days = parseInt($argument.WarnDays, 10);
            } else if (typeof $argument === 'string') {
                const m = $argument.match(/WarnDays\s*=\s*(\d+)/i) || $argument.match(/^(\d+)$/);
                if (m && m[1]) days = parseInt(m[1], 10);
            }
        }
    } catch (e) {}
    return (!isNaN(days) && days >= 1 && days <= 60) ? days : 7;
}

function sendNotify(title, subtitle, body) {
    if (typeof $notification !== 'undefined' && $notification.post) {
        $notification.post(title, subtitle || '', body || '');
    }
    console.log(`[${PLATFORM}-Expiry] ${title} | ${subtitle || ''} | ${body || ''}`);
}

function computeDaysLeft(isoStr) {
    if (!isoStr) return null;
    const ts = Date.parse(isoStr);
    if (isNaN(ts)) return null;
    return Math.ceil((ts - Date.now()) / 86400000);
}

function inspectAppsResponse(rawBody) {
    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch (e) {
        return;
    }
    if (!payload || !Array.isArray(payload.data)) return;

    const warnDays = getWarnDays();
    const cache = loadJson('TF_EXPIRY_CACHE', {});
    const newBuilds = [];
    const expiringSoon = [];

    for (const app of payload.data) {
        if (!app || !app.id) continue;
        const appId = String(app.id);
        const name = app.name || app.bundleId || appId;
        const bundleId = app.bundleId || '';
        const platforms = Array.isArray(app.platforms) ? app.platforms : [];
        const iosPlat = platforms.find(p => p && (p.name === 'ios' || p.platform === 'ios')) || platforms[0] || {};
        const build = iosPlat.build || app.currentBuild || {};

        const shortVer = build.cfBundleShortVersionString || build.shortVersion || '';
        const buildNum = String(build.cfBundleVersion || build.buildVersion || build.id || '');
        const expiresOn = build.expiresOn || build.expirationDate || build.expireDate || '';
        const whatsNew = String(build.whatsNew || build.releaseNotes || '').trim().slice(0, 180);
        const daysLeft = computeDaysLeft(expiresOn);

        const prev = cache[appId];
        if (prev && prev.buildNum && buildNum && prev.buildNum !== buildNum) {
            newBuilds.push({ name, shortVer, buildNum, whatsNew });
        }

        cache[appId] = {
            appId,
            name,
            bundleId,
            shortVer,
            buildNum,
            expiresOn,
            whatsNew,
            updatedAt: new Date().toISOString()
        };

        if (daysLeft !== null && daysLeft <= warnDays) {
            expiringSoon.push({ name, shortVer, buildNum, daysLeft });
        }
    }

    writeStore(JSON.stringify(cache), 'TF_EXPIRY_CACHE');
    writeStore(new Date().toISOString(), 'TF_EXPIRY_LAST_SYNC');

    if (newBuilds.length > 0) {
        const first = newBuilds[0];
        sendNotify(
            `🆕 Có Build TestFlight mới: ${first.name}`,
            `Phiên bản ${first.shortVer} (${first.buildNum})${newBuilds.length > 1 ? ` và +${newBuilds.length - 1} app khác` : ''}`,
            first.whatsNew || 'Mở TestFlight để cập nhật bản dựng mới nhất.'
        );
    }

    if (expiringSoon.length > 0) {
        expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);
        const summary = expiringSoon
            .slice(0, 4)
            .map(item => item.daysLeft <= 0 ? `${item.name} (ĐÃ HẾT HẠN)` : `${item.name} (còn ${item.daysLeft} ngày)`)
            .join(', ');
        sendNotify(
            `⏳ Cảnh báo hạn TestFlight (${expiringSoon.length} ứng dụng)`,
            `Ngưỡng cảnh báo: <= ${warnDays} ngày`,
            summary
        );
    }
}

function runDailyExpiryAudit() {
    const warnDays = getWarnDays();
    const cache = loadJson('TF_EXPIRY_CACHE', {});
    const entries = Object.values(cache);
    if (entries.length === 0) {
        console.log(`[${PLATFORM}-Expiry] Chưa có dữ liệu ứng dụng. Hãy mở TestFlight 1 lần để đồng bộ danh sách Beta.`);
        return;
    }

    const alerts = [];
    for (const item of entries) {
        const daysLeft = computeDaysLeft(item.expiresOn);
        if (daysLeft !== null && daysLeft <= warnDays) {
            alerts.push({ name: item.name, daysLeft, shortVer: item.shortVer, buildNum: item.buildNum });
        }
    }

    if (alerts.length > 0) {
        alerts.sort((a, b) => a.daysLeft - b.daysLeft);
        sendNotify(
            `⏰ Báo cáo hạn Beta TestFlight (${alerts.length}/${entries.length} app cần chú ý)`,
            `Kiểm tra định kỳ trên ${PLATFORM}`,
            alerts.map(a => a.daysLeft <= 0 ? `${a.name}: HẾT HẠN` : `${a.name}: còn ${a.daysLeft} ngày`).join(' • ')
        );
    } else {
        console.log(`[${PLATFORM}-Expiry] Tất cả ${entries.length} ứng dụng TestFlight đều còn hạn an toàn (> ${warnDays} ngày).`);
    }
}

function buildHttpResponse(status, contentType, bodyStr) {
    const headers = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
    };
    if (typeof $task !== 'undefined') return { status: `HTTP/1.1 ${status} OK`, headers, body: bodyStr };
    return { response: { status, headers, body: bodyStr } };
}

function renderStatusHtml() {
    const warnDays = getWarnDays();
    const cache = loadJson('TF_EXPIRY_CACHE', {});
    const lastSync = readStore('TF_EXPIRY_LAST_SYNC', 'Chưa đồng bộ — Hãy mở app TestFlight 1 lần');
    const items = Object.values(cache).map(item => {
        const daysLeft = computeDaysLeft(item.expiresOn);
        return Object.assign({}, item, { daysLeft });
    });

    items.sort((a, b) => {
        const da = a.daysLeft === null ? 999 : a.daysLeft;
        const db = b.daysLeft === null ? 999 : b.daysLeft;
        return da - db;
    });

    const rowsHtml = items.length === 0
        ? `<div class="empty">📭 Chưa có dữ liệu gói Beta.<br>Hãy bật VPN và mở ứng dụng <b>TestFlight</b> 1 lần, danh sách hạn dùng 90 ngày sẽ tự động hiện tại đây!</div>`
        : items.map(it => {
            const d = it.daysLeft;
            const pct = d === null ? 100 : Math.max(0, Math.min(100, Math.round((d / 90) * 100)));
            const color = d === null ? '#3b82f6' : (d <= 0 ? '#ef4444' : (d <= warnDays ? '#f59e0b' : '#10b981'));
            const label = d === null ? 'Không giới hạn' : (d <= 0 ? '🔴 ĐÃ HẾT HẠN' : `Còn ${d} / 90 ngày`);
            return `<div class="card">
              <div class="row">
                <div>
                  <div class="title">${escapeHtml(it.name)}</div>
                  <div class="meta">${escapeHtml(it.bundleId)} • v${escapeHtml(it.shortVer)} (${escapeHtml(it.buildNum)})</div>
                </div>
                <span class="pill" style="color:${color};border-color:${color}66;background:${color}1a">${label}</span>
              </div>
              <div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
              ${it.whatsNew ? `<div class="notes">📝 ${escapeHtml(it.whatsNew)}</div>` : ''}
            </div>`;
        }).join('');

    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TF Expiry Monitor — ${escapeHtml(PLATFORM)}</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  body{margin:0;padding:16px;background:#0b1120;color:#f3f4f6;max-width:680px;margin-inline:auto}
  h1{font-size:20px;margin:0 0 4px}.sub{font-size:13px;color:#9ca3af;margin-bottom:16px}
  .card,.empty{background:#111827;border:1px solid #1f2937;border-radius:14px;padding:14px;margin-bottom:12px}
  .empty{text-align:center;color:#9ca3af;line-height:1.6;padding:28px 16px}
  .row{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
  .title{font-weight:700;font-size:16px}.meta{font-size:12px;color:#9ca3af;margin-top:3px}
  .pill{font-size:12px;font-weight:700;padding:4px 9px;border-radius:999px;border:1px solid;white-space:nowrap}
  .bar{height:7px;background:#1f2937;border-radius:999px;overflow:hidden;margin-top:11px}
  .fill{height:100%;border-radius:999px}
  .notes{font-size:12px;color:#d1d5db;margin-top:9px;background:#03071288;padding:8px 10px;border-radius:8px}
</style></head>
<body>
  <h1>⏳ Giám Sát Hạn 90 Ngày TestFlight (${escapeHtml(PLATFORM)})</h1>
  <div class="sub">Chế độ Chỉ Đọc An Toàn (Read-Only) • Đồng bộ gần nhất: <b>${escapeHtml(lastSync)}</b></div>
  ${rowsHtml}
</body></html>`;
}

if (typeof $response !== 'undefined' && $response && typeof $request !== 'undefined' && $request) {
    // Chế độ http-response CHỈ ĐỌC trên /v3/accounts/<uuid>/apps
    try {
        if ($response.body) inspectAppsResponse($response.body);
    } catch (err) {
        console.log(`[${PLATFORM}-Expiry] Lỗi đọc danh sách app: ${err}`);
    }
    $done({});
} else if (typeof $request !== 'undefined' && $request && $request.url) {
    // Trang bảng điều khiển nội bộ http://tf-status.test/
    if ($request.url.includes('/api/json')) {
        $done(buildHttpResponse(200, 'application/json; charset=utf-8', JSON.stringify({
            ok: true,
            platform: PLATFORM,
            lastSync: readStore('TF_EXPIRY_LAST_SYNC', null),
            apps: loadJson('TF_EXPIRY_CACHE', {})
        })));
    } else {
        $done(buildHttpResponse(200, 'text/html; charset=utf-8', renderStatusHtml()));
    }
} else {
    runDailyExpiryAudit();
    $done();
}
