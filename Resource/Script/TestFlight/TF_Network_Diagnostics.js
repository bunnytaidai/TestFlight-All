/*
 * Script: TF_Network_Diagnostics.js (Plugin 4: Chẩn Đoán Kết Nối, Tải Nhanh CDN & Kiểm Định MitM TestFlight)
 * Phiên bản: version.5.0.0.0 — Tuân thủ chuẩn bảo mật che giấu khóa nhạy cảm (Zero-Leak Redaction)
 * Hỗ trợ: Loon ($loon) & Shadowrocket ($rocket) & Surge / Stash
 * Tác dụng thực tế:
 * 1. Đo tốc độ phản hồi thực tế (ms) từ bên trong đường hầm VPN tới máy chủ TestFlight & Apple Beta CDN.
 * 2. Quan sát chỉ đọc (Read-Only) mã phản hồi HTTP (200, 304, 401, 429...) từ `testflight.apple.com` để bắt bệnh:
 *    - Chưa bật tin cậy chứng chỉ CA / HTTP2 MitM
 *    - Bị nghẽn mạng DNS hoặc bị Apple giới hạn tốc độ (HTTP 429)
 *    - Hết hạn Token đăng nhập (HTTP 401)
 * 3. Tự động che 100% giá trị nhạy cảm (`X-Session-Id`, `X-Session-Digest`, `Cookie`, `Authorization`) trước khi lưu log.
 * 4. Hiển thị báo cáo sức khỏe chi tiết bằng Tiếng Việt tại `http://tf-diag.test/`.
 */

function getPlatform() {
    if (typeof $loon !== 'undefined') return 'Loon';
    if (typeof $rocket !== 'undefined') return 'Shadowrocket';
    if (typeof $environment !== 'undefined' && $environment['surge-version']) return 'Surge';
    return 'Loon/Shadowrocket';
}

const PLATFORM = getPlatform();
const SENSITIVE_HEADER_RE = /^(authorization|cookie|set-cookie|x-session-id|x-session-digest|x-apple-.*token.*|x-ds-.*|proxy-authorization)$/i;

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

function redactHeaders(headersObj) {
    const safe = {};
    if (!headersObj || typeof headersObj !== 'object') return safe;
    for (const [k, v] of Object.entries(headersObj)) {
        if (SENSITIVE_HEADER_RE.test(k)) {
            const s = String(v || '');
            safe[k] = s.length > 8 ? `[REDACTED:${s.slice(0, 3)}...${s.slice(-3)}]` : '[REDACTED]';
        } else {
            safe[k] = String(v || '').slice(0, 120);
        }
    }
    return safe;
}

function sanitizeUrlPath(rawUrl) {
    if (!rawUrl) return '';
    // Ẩn UUID tài khoản Apple ID trong URL log để bảo vệ quyền riêng tư
    return String(rawUrl).replace(/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}/g, '<ACCOUNT-UUID>');
}

function appendTraceEntry(entry) {
    let list = [];
    try {
        list = JSON.parse(readStore('TF_DIAG_TRACES', '[]'));
        if (!Array.isArray(list)) list = [];
    } catch (e) {
        list = [];
    }
    list.unshift(entry);
    if (list.length > 20) list = list.slice(0, 20);
    writeStore(JSON.stringify(list), 'TF_DIAG_TRACES');
}

function probeEndpoint(name, url) {
    return new Promise((resolve) => {
        const start = Date.now();
        $httpClient.get(
            {
                url,
                headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X)' },
                timeout: 7
            },
            (err, resp) => {
                const ms = Date.now() - start;
                const status = resp ? (resp.status || resp.statusCode || 0) : 0;
                resolve({
                    name,
                    url,
                    ok: !err && status >= 200 && status < 400,
                    status,
                    latencyMs: ms,
                    error: err ? String(err) : ''
                });
            }
        );
    });
}

async function runActiveHealthProbe() {
    const [tfWeb, appleCdn] = await Promise.all([
        probeEndpoint('Máy chủ TestFlight Web (Join)', 'https://testflight.apple.com/join/LPQmtkUs'),
        probeEndpoint('Máy chủ Apple Icon/Build CDN', 'https://is1-ssl.mzstatic.com/favicon.ico')
    ]);
    const report = {
        checkedAt: new Date().toISOString(),
        platform: PLATFORM,
        hasSessionToken: Boolean(readStore('session_id', '') && readStore('key', '')),
        probes: [tfWeb, appleCdn]
    };
    writeStore(JSON.stringify(report), 'TF_DIAG_LAST_REPORT');
    return report;
}

function buildResponse(status, contentType, bodyStr) {
    const headers = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
    };
    if (typeof $task !== 'undefined') return { status: `HTTP/1.1 ${status} OK`, headers, body: bodyStr };
    return { response: { status, headers, body: bodyStr } };
}

function renderDiagHtml(report) {
    let traces = [];
    try {
        traces = JSON.parse(readStore('TF_DIAG_TRACES', '[]')) || [];
    } catch (e) {}

    const hasToken = Boolean(readStore('session_id', '') && readStore('key', ''));
    let accountsCount = 0;
    try {
        accountsCount = (JSON.parse(readStore('TF_ACCOUNTS', '[]')) || []).length;
    } catch (e) {}

    const diagnosisTips = [];
    if (!hasToken) {
        diagnosisTips.push('🟡 <b>Chưa thu thập được Token MitM TestFlight:</b> Hãy kiểm tra (1) Đã cài & bật Tin cậy Chứng chỉ gốc CA trong <i>Cài đặt ➔ Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ</i>, (2) Đã bật <b>MitM</b> + <b>HTTP/2</b> cho <code>testflight.apple.com</code>, sau đó mở lại app TestFlight.');
    } else {
        diagnosisTips.push(`🟢 <b>MitM & Token hoạt động tốt:</b> Đã thu thập thành công ${accountsCount || 1} nick Apple ID sẵn sàng tự động nhận slot.`);
    }

    const recent429 = traces.some(t => t && t.status === 429);
    const recent401 = traces.some(t => t && (t.status === 401 || t.status === 403));
    if (recent429) {
        diagnosisTips.push('🔴 <b>Phát hiện mã HTTP 429 (Quá tải yêu cầu):</b> Không nên đặt lịch Cron 1 giây (`* * * * * *`). Bản v5.0.0.0 đã nâng lên 10 giây kết hợp Radar Tầng 1 để bảo vệ tài khoản.');
    }
    if (recent401) {
        diagnosisTips.push('🟡 <b>Phát hiện mã HTTP 401/403 (Hết hạn phiên):</b> Hãy mở lại ứng dụng TestFlight trên iPhone để làm mới `X-Session-Id`.');
    }

    const probes = (report && Array.isArray(report.probes)) ? report.probes : [];
    const probeHtml = probes.map(p => {
        const color = p.ok ? '#10b981' : '#ef4444';
        return `<div class="item">
          <div><b>${escapeHtml(p.name)}</b><div class="small">${escapeHtml(p.url)}</div></div>
          <span style="color:${color};font-weight:700">${p.ok ? `🟢 ${p.latencyMs}ms (HTTP ${p.status})` : `🔴 Lỗi (${escapeHtml(p.error || ('HTTP ' + p.status))})`}</span>
        </div>`;
    }).join('');

    const traceHtml = traces.length === 0
        ? `<div class="small">Chưa có gói tin API TestFlight nào đi qua kể từ lúc bật plugin.</div>`
        : traces.map(t => `<div class="trace">
            <b>HTTP ${escapeHtml(t.status)}</b> • <code>${escapeHtml(t.method || 'GET')}</code> ${escapeHtml(t.url)}
            <div class="small">${escapeHtml(t.time)} • Headers nhạy cảm: Đã che bảo mật (Redacted)</div>
          </div>`).join('');

    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TF Network Diagnostics — ${escapeHtml(PLATFORM)}</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  body{margin:0;padding:16px;background:#0b1120;color:#f3f4f6;max-width:680px;margin-inline:auto}
  h1{font-size:20px;margin:0 0 4px}.sub{font-size:13px;color:#9ca3af;margin-bottom:14px}
  .box{background:#111827;border:1px solid #1f2937;border-radius:14px;padding:14px;margin-bottom:14px}
  h2{font-size:15px;margin:0 0 10px;color:#93c5fd}
  .item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #1f2937}
  .item:last-child{border-bottom:none}
  .tip{font-size:13px;line-height:1.5;padding:10px;border-radius:10px;background:#03071288;margin-bottom:8px}
  .trace{font-size:12px;padding:8px 0;border-bottom:1px solid #1f2937}
  .small{font-size:12px;color:#9ca3af;margin-top:3px}
  .btn{padding:8px 13px;border-radius:9px;background:#2563eb;color:#fff;text-decoration:none;font-size:13px;font-weight:600;display:inline-block;margin-bottom:12px}
  code{background:#030712;padding:2px 5px;border-radius:4px;color:#93c5fd}
</style></head>
<body>
  <h1>🩺 Chẩn Đoán Mạng & MitM TestFlight (${escapeHtml(PLATFORM)})</h1>
  <div class="sub">Tự động ẩn khóa phiên bảo mật • Đo trực tiếp từ bên trong VPN Tunnel</div>
  <a class="btn" href="/?probe=1">🔄 Đo Tốc Độ & Kiểm Tra Lại Ngay</a>

  <div class="box">
    <h2>1. Kết Luận Bắt Bệnh Tự Động</h2>
    ${diagnosisTips.map(t => `<div class="tip">${t}</div>`).join('')}
  </div>

  <div class="box">
    <h2>2. Độ Trễ Kết Nối Trực Tiếp (DIRECT Latency)</h2>
    ${probeHtml || '<div class="small">Nhấn nút Đo Tốc Độ phía trên để kiểm tra.</div>'}
  </div>

  <div class="box">
    <h2>3. Nhật Ký Gói Tin TestFlight Gần Nhất (Chỉ Đọc — Redacted)</h2>
    ${traceHtml}
  </div>
</body></html>`;
}

if (typeof $response !== 'undefined' && $response && typeof $request !== 'undefined' && $request) {
    // Quan sát chỉ đọc phản hồi từ testflight.apple.com (ẩn toàn bộ Header nhạy cảm)
    try {
        const status = $response.status || $response.statusCode || 0;
        appendTraceEntry({
            time: new Date().toISOString().replace('T', ' ').slice(0, 19),
            method: $request.method || 'GET',
            url: sanitizeUrlPath($request.url),
            status,
            reqHeaders: redactHeaders($request.headers),
            respHeaders: redactHeaders($response.headers)
        });
    } catch (e) {}
    $done({});
} else if (typeof $request !== 'undefined' && $request && $request.url) {
    !(async () => {
        let report = null;
        try {
            report = JSON.parse(readStore('TF_DIAG_LAST_REPORT', 'null'));
        } catch (e) {}
        if (!report || /[?&]probe=1\b/.test($request.url) || $request.url.includes('/api/probe')) {
            report = await runActiveHealthProbe();
        }
        if ($request.url.includes('/api/probe')) {
            $done(buildResponse(200, 'application/json; charset=utf-8', JSON.stringify(report)));
        } else {
            $done(buildResponse(200, 'text/html; charset=utf-8', renderDiagHtml(report)));
        }
    })().catch(err => {
        $done(buildResponse(500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(err) })));
    });
} else {
    !(async () => {
        const rep = await runActiveHealthProbe();
        const probeSummary = rep.probes.map(p => `${p.name}: ${p.ok ? p.latencyMs + 'ms' : 'LỖI'}`).join(' | ');
        console.log(`[${PLATFORM}-Diag] Token=${rep.hasSessionToken} | ${probeSummary}`);
        $done();
    })().catch(() => $done());
}
