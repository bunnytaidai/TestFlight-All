/*
 * Script: Preferences_ReadOnly_Inspector.js (version.1.0.0.0)
 * Mục đích: Kiểm tra & ghi log chẩn đoán CHỈ ĐỌC (Read-Only) trên Loon cho các kết nối mạng
 *           liên quan đến Cài đặt hệ thống (com.apple.Preferences) & môi trường kiểm thử Sandbox.
 * Cam kết an toàn (OWASP MASTG Compliant):
 * 1. Chỉ đọc 100% — luôn kết thúc bằng $done({}), TUYỆT ĐỐI KHÔNG sửa đổi gói tin Request/Response.
 * 2. Không can thiệp SSL Pinning của Apple; các miền HTTPS hệ thống đi thẳng (DIRECT) qua SNI Audit.
 * 3. Tự động ẩn (Redact -> [REDACTED]) mọi trường xác thực nhạy cảm (Cookie, Token, Apple-I-MD, DSID...).
 */

const SENSITIVE_KEY_REGEX = /^(authorization|proxy-authorization|cookie|set-cookie|x-token|i-token|x-dsid|dsid|x-apple-i-md.*|x-apple-amd.*|x-apple-gs-token|x-apple-adsid|x-apple-id-session-id|x-mme-client-info|password|passwd|secret|token|session_id|session_digest)$/i;

function parseArgFlags() {
    if (typeof $argument === 'undefined' || !$argument) {
        return { NotifyToast: false };
    }
    if (typeof $argument === 'object') {
        return {
            NotifyToast: String($argument.NotifyToast || 'false') === 'true'
        };
    }
    const raw = String($argument);
    return {
        NotifyToast: /NotifyToast\s*=\s*"?true"?/i.test(raw)
    };
}

function redactHeaders(headers) {
    const safe = {};
    if (!headers || typeof headers !== 'object') return safe;
    for (const [k, v] of Object.entries(headers)) {
        safe[k] = SENSITIVE_KEY_REGEX.test(String(k).trim()) ? '[REDACTED]' : v;
    }
    return safe;
}

function classifyPreferencesEndpoint(hostname, pathname) {
    const host = String(hostname || '').toLowerCase();
    const path = String(pathname || '');
    if (host.includes('captive.apple.com') || path.includes('generate_204') || path.includes('hotspot-detect')) {
        return 'PREFS_WIFI_CAPTIVE_CHECK';
    }
    if (host.includes('mesu.apple.com') || host.includes('gdmf.apple.com') || host.includes('updates-http.cdn-apple.com') || host.includes('updates.cdn-apple.com')) {
        return 'PREFS_SOFTWARE_UPDATE';
    }
    if (host.includes('configuration.apple.com') || host.includes('xp.apple.com')) {
        return 'PREFS_SYSTEM_CONFIG';
    }
    if (host.includes('time.apple.com') || host.includes('time-ios.apple.com')) {
        return 'PREFS_DATETIME_SYNC';
    }
    if (host.includes('sandbox.itunes.apple.com') || host.includes('mzstorekit-sb.itunes.apple.com')) {
        return 'PREFS_APPSTORE_SANDBOX';
    }
    if (host.includes('iprofiles.apple.com') || host.includes('deviceenrollment.apple.com') || host.includes('mdmenrollment.apple.com')) {
        return 'PREFS_PROFILE_MANAGEMENT';
    }
    return 'PREFS_NETWORK_READONLY';
}

function summarizeBodyReadOnly(bodyStr) {
    if (!bodyStr || typeof bodyStr !== 'string') return 'empty_body';
    const trimmed = bodyStr.trim();
    if (!trimmed) return 'empty_body';

    try {
        const parsed = JSON.parse(trimmed);
        const safeFields = [];
        if (parsed.environment) safeFields.push(`env=${parsed.environment}`);
        if (parsed.bundleId) safeFields.push(`bundleId=${parsed.bundleId}`);
        if (parsed.status !== undefined) safeFields.push(`status=${parsed.status}`);
        return safeFields.length > 0 ? safeFields.join(' | ') : `json_bytes=${trimmed.length}`;
    } catch (e) {
        return `bytes=${trimmed.length}`;
    }
}

(function runPreferencesReadOnlyInspector() {
    const flags = parseArgFlags();
    const hasRequest = typeof $request !== 'undefined' && $request !== null;
    const hasResponse = typeof $response !== 'undefined' && $response !== null;

    // Nhánh 1: Chạy kiểm tra sức khỏe định kỳ / thủ công (Generic / Cron Self-Check trên Loon)
    if (!hasRequest && !hasResponse) {
        const runtimeInfo = typeof $loon !== 'undefined' ? String($loon) : 'Loon Runtime';
        const nowIso = new Date().toISOString();
        const statusMsg = `[Loon-Preferences-ReadOnly] [SELF-CHECK PASS] ${nowIso} | runtime=${runtimeInfo} | mode=READ_ONLY_100%`;
        console.log(statusMsg);
        if (typeof $persistentStore !== 'undefined' && $persistentStore.write) {
            $persistentStore.write(nowIso, 'PREFS_READONLY_LAST_HEARTBEAT');
        }
        if (flags.NotifyToast && typeof $notification !== 'undefined' && $notification.post) {
            $notification.post(
                '🔎 Loon Preferences (Chỉ đọc)',
                'Kiểm tra hoạt động thành công',
                runtimeInfo
            );
        }
        $done({});
        return;
    }

    // Nhánh 2: Quan sát gói tin HTTP / Sandbox chỉ đọc (100% giữ nguyên gói tin gốc)
    const reqUrl = hasRequest && $request.url ? String($request.url) : 'unknown://local';
    const method = hasRequest && $request.method ? String($request.method) : 'GET';
    let hostname = 'unknown-host';
    let pathname = '/';
    try {
        const parsedUrl = new URL(reqUrl);
        hostname = parsedUrl.hostname;
        pathname = parsedUrl.pathname;
    } catch (e) {}

    const category = classifyPreferencesEndpoint(hostname, pathname);

    if (hasResponse) {
        const status = $response.status || $response.statusCode || 0;
        const safeHeaders = redactHeaders($response.headers);
        const summary = summarizeBodyReadOnly($response.body);
        console.log(`[Loon-Preferences-ReadOnly] [RESPONSE] [${category}] HTTP ${status} ${method} ${hostname}${pathname} | ${summary}`);
        console.log(`[Loon-Preferences-ReadOnly] [RESP-HEADERS] ${JSON.stringify(safeHeaders)}`);

        if (flags.NotifyToast && typeof $notification !== 'undefined' && $notification.post) {
            $notification.post(
                `🔎 [${category}]`,
                `HTTP ${status} • ${method} ${hostname}`,
                `${pathname} (${summary})`
            );
        }
    } else if (hasRequest) {
        const safeHeaders = redactHeaders($request.headers);
        const summary = summarizeBodyReadOnly($request.body);
        console.log(`[Loon-Preferences-ReadOnly] [REQUEST] [${category}] ${method} ${hostname}${pathname} | ${summary}`);
        console.log(`[Loon-Preferences-ReadOnly] [REQ-HEADERS] ${JSON.stringify(safeHeaders)}`);
    }

    $done({});
})();
