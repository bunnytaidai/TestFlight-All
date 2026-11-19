/*
 * Script: Sandbox_StoreKit_Inspector.js (Read-Only Diagnostic Packet Logger for Loon)
 * Mục đích: Chỉ đọc & ghi log chẩn đoán lưu lượng StoreKit Sandbox hợp pháp (OWASP MASTG Network Audit).
 * An toàn:
 * 1. Chỉ đọc 100% ($done({})), TUYỆT ĐỐI KHÔNG sửa đổi gói tin Request/Response và KHÔNG tự động phát lại (Replay).
 * 2. Tự động che ẩn (Redact) toàn bộ khóa xác thực nhạy cảm (Cookie, Authorization, X-Token, X-Apple-I-MD*, X-Dsid).
 */

const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|set-cookie|x-token|i-token|x-dsid|x-apple-i-md.*|x-apple-amd.*|x-apple-gs-token|password)$/i;

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
        safe[k] = SENSITIVE_HEADER_REGEX.test(k.trim()) ? '[REDACTED]' : v;
    }
    return safe;
}

function extractSafeSandboxSummary(bodyStr) {
    if (!bodyStr || typeof bodyStr !== 'string') return 'Không có thân gói tin (Empty Body)';
    const trimmed = bodyStr.trim();
    if (!trimmed) return 'Không có thân gói tin (Empty Body)';

    try {
        const parsed = JSON.parse(trimmed);
        const env = parsed.environment || (parsed.receipt && parsed.receipt.receipt_type) || 'Sandbox';
        const bundleId = parsed.bundleId || (parsed.receipt && parsed.receipt.bundle_id) || '-';
        const productId = parsed.productId || parsed.auto_renew_product_id || '-';
        const status = parsed.status !== undefined ? parsed.status : '-';
        return `env=${env} | bundle=${bundleId} | product=${productId} | status=${status}`;
    } catch (e) {
        const productMatch = trimmed.match(/<key>productId<\/key>\s*<string>([^<]{1,80})<\/string>/i);
        const bidMatch = trimmed.match(/<key>bid<\/key>\s*<string>([^<]{1,80})<\/string>/i);
        if (productMatch || bidMatch) {
            return `plist | bid=${bidMatch ? bidMatch[1] : '-'} | productId=${productMatch ? productMatch[1] : '-'}`;
        }
        return `raw_length=${trimmed.length} bytes`;
    }
}

(function runSandboxInspector() {
    const flags = parseArgFlags();
    const isResp = typeof $response !== 'undefined' && $response !== null;
    const reqUrl = (typeof $request !== 'undefined' && $request && $request.url) ? $request.url : 'unknown-url';
    const method = (typeof $request !== 'undefined' && $request && $request.method) ? $request.method : 'GET';

    let pathname = reqUrl;
    try {
        const u = new URL(reqUrl);
        pathname = `${u.hostname}${u.pathname}`;
    } catch (e) {}

    if (isResp) {
        const status = $response.status || $response.statusCode || 0;
        const safeHeaders = redactHeaders($response.headers);
        const summary = extractSafeSandboxSummary($response.body);
        console.log(`[Loon-Sandbox-Inspector] [RESPONSE] HTTP ${status} ${method} ${pathname} | ${summary}`);
        console.log(`[Loon-Sandbox-Inspector] [RESP-HEADERS] ${JSON.stringify(safeHeaders)}`);

        if (flags.NotifyToast && typeof $notification !== 'undefined' && $notification.post) {
            $notification.post(
                '🔎 Sandbox StoreKit Inspector (Chỉ đọc)',
                `HTTP ${status} • ${method} ${pathname}`,
                summary
            );
        }
    } else if (typeof $request !== 'undefined' && $request) {
        const safeHeaders = redactHeaders($request.headers);
        const summary = extractSafeSandboxSummary($request.body);
        console.log(`[Loon-Sandbox-Inspector] [REQUEST] ${method} ${pathname} | ${summary}`);
        console.log(`[Loon-Sandbox-Inspector] [REQ-HEADERS] ${JSON.stringify(safeHeaders)}`);
    }

    $done({});
})();
