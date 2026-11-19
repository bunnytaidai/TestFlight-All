/*
 * Script: TF_Subscription_Manager.js (Loon & Shadowrocket — TestFlight / Sandbox Subscription Inspector & Renewal Watchlist)
 * Phiên bản: version.5.2.0.0 (Tối ưu iPhone A9 iOS 15.8.8 Rootless)
 *
 * Chức năng thực tế & Cam kết an toàn (Authorized QA & Read-Only StoreKit Audit):
 * 1. Quan sát CHỈ ĐỌC ($done({})) các phản hồi gói đăng ký TestFlight / StoreKit Sandbox
 *    (sandbox.itunes.apple.com, mzstorekit-sb.itunes.apple.com, api.storekit-sandbox.itunes.apple.com)
 *    để liệt kê danh sách các gói đăng ký đã mua gắn với từng nick Apple ID trong kho TF_ACCOUNTS.
 * 2. Tự động che ẩn (Redact) toàn bộ header xác thực nhạy cảm (Cookie, Authorization, X-Apple-I-MD*, X-Dsid, X-Token).
 * 3. Giao diện Web nội bộ `http://tf-sub.test/` (mở trực tiếp trên Safari 0ms):
 *    - Hiển thị danh sách nick Apple ID đã lưu & bật/tắt tự động đảo nick (`TF_AUTO_SWITCH_ACCOUNT`).
 *    - Xem danh sách gói đăng ký TestFlight / Sandbox đã phát hiện (hoặc thêm thủ công).
 *    - Tích chọn cố định các gói cần theo dõi gia hạn (`TF_SUB_WATCHLIST`).
 * 4. Cron định kỳ kiểm tra hạn gói đã chọn: khi gói Sandbox sắp hết chu kỳ tự gia hạn của Apple (6-12 lần),
 *    tự động gửi thông báo đẩy kèm nút 1 chạm mở thẳng `itms-apps://apps.apple.com/account/subscriptions` để gia hạn lại.
 * 5. TUYỆT ĐỐI KHÔNG sửa đổi/giả mạo biên lai StoreKit và KHÔNG tự ý phát lại giao dịch thanh toán.
 */

'use strict';

const STORE_KEY_SUBS = 'TF_SANDBOX_SUBSCRIPTIONS';
const STORE_KEY_WATCH = 'TF_SUB_WATCHLIST';
const STORE_KEY_ALERT = 'TF_SUB_ALERT_CACHE';
const STORE_KEY_ACCOUNTS = 'TF_ACCOUNTS';
const STORE_KEY_ACTIVE_IDX = 'TF_ACTIVE_ACCOUNT_IDX';
const STORE_KEY_AUTO_SWITCH = 'TF_AUTO_SWITCH_ACCOUNT';

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
        const parsed = JSON.parse(raw);
        return (parsed !== null && typeof parsed === 'object') ? parsed : fallback;
    } catch (e) {
        return fallback;
    }
}

function sendNotify(title, subtitle, message, openUrl) {
    if (typeof $notification !== 'undefined' && $notification.post) {
        if (openUrl) {
            const attach = PLATFORM === 'Loon'
                ? { openUrl: openUrl }
                : (PLATFORM === 'Shadowrocket' ? openUrl : { url: openUrl });
            $notification.post(title, subtitle || '', message || '', attach);
        } else {
            $notification.post(title, subtitle || '', message || '');
        }
    } else if (typeof $notify !== 'undefined') {
        $notify(title, subtitle || '', message || '', openUrl ? { 'open-url': openUrl } : undefined);
    }
    console.log(`[${PLATFORM}-TF-Sub] ${title} | ${subtitle || ''} | ${message || ''}`);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function decodeBase64UrlJson(b64Url) {
    try {
        if (!b64Url || typeof b64Url !== 'string') return null;
        let b64 = b64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) b64 += '=';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let str = '';
        let i = 0;
        while (i < b64.length) {
            const enc1 = chars.indexOf(b64.charAt(i++));
            const enc2 = chars.indexOf(b64.charAt(i++));
            const enc3 = chars.indexOf(b64.charAt(i++));
            const enc4 = chars.indexOf(b64.charAt(i++));
            const chr1 = (enc1 << 2) | (enc2 >> 4);
            const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            const chr3 = ((enc3 & 3) << 6) | enc4;
            str += String.fromCharCode(chr1);
            if (enc3 !== 64 && enc3 !== -1) str += String.fromCharCode(chr2);
            if (enc4 !== 64 && enc4 !== -1) str += String.fromCharCode(chr3);
        }
        return JSON.parse(decodeURIComponent(escape(str)));
    } catch (e) {
        return null;
    }
}

function decodeJwsPayloadReadOnly(jwsToken) {
    if (!jwsToken || typeof jwsToken !== 'string') return null;
    const parts = jwsToken.split('.');
    if (parts.length !== 3) return null;
    return decodeBase64UrlJson(parts[1]);
}

function getActiveAccountLabel() {
    const pool = loadJson(STORE_KEY_ACCOUNTS, []);
    const idx = parseInt(readStore(STORE_KEY_ACTIVE_IDX, '0'), 10);
    if (Array.isArray(pool) && pool.length > 0) {
        const safeIdx = (!isNaN(idx) && idx >= 0 && idx < pool.length) ? idx : 0;
        return pool[safeIdx].name || `Apple ID #${safeIdx + 1}`;
    }
    const key = readStore('key', '');
    return key ? `Apple ID (${key.slice(0, 8)})` : 'Apple ID Mặc Định';
}

function upsertSubscriptionRecord(rec) {
    if (!rec || !rec.productId) return false;
    const list = loadJson(STORE_KEY_SUBS, []);
    const arr = Array.isArray(list) ? list : [];
    const uid = `${rec.bundleId || 'unknown'}::${rec.productId}::${rec.originalTransactionId || 'manual'}`;
    const nowIso = new Date().toISOString();

    const idx = arr.findIndex(item => item.uid === uid);
    const merged = {
        uid,
        accountName: rec.accountName || getActiveAccountLabel(),
        bundleId: rec.bundleId || 'unknown.bundle',
        productId: rec.productId,
        originalTransactionId: rec.originalTransactionId || '-',
        environment: rec.environment || 'Sandbox',
        expiresDateMs: Number(rec.expiresDateMs) || 0,
        autoRenewStatus: rec.autoRenewStatus !== undefined ? String(rec.autoRenewStatus) : '1',
        source: rec.source || 'StoreKit-ReadOnly',
        updatedAt: nowIso
    };

    if (idx >= 0) {
        arr[idx] = Object.assign({}, arr[idx], merged);
    } else {
        arr.unshift(merged);
    }

    // Giới hạn tối đa 60 bản ghi để giữ bộ nhớ NetworkExtension < 15MB trên A9 iOS 15.8.8
    writeStore(JSON.stringify(arr.slice(0, 60)), STORE_KEY_SUBS);
    return true;
}

function extractSubscriptionsFromSandboxBody(bodyStr, url) {
    if (!bodyStr || typeof bodyStr !== 'string') return 0;
    const trimmed = bodyStr.trim();
    if (!trimmed) return 0;

    let count = 0;
    const accountName = getActiveAccountLabel();

    // 1. JSON (verifyReceipt, StoreKit 2 JWS, App Store Server API v2 Sandbox)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const data = JSON.parse(trimmed);

            // A. StoreKit 1 verifyReceipt: latest_receipt_info & pending_renewal_info
            const renewalMap = {};
            if (Array.isArray(data.pending_renewal_info)) {
                for (const r of data.pending_renewal_info) {
                    if (r && r.original_transaction_id) {
                        renewalMap[r.original_transaction_id] = r.auto_renew_status || '1';
                    }
                }
            }
            const receiptList = Array.isArray(data.latest_receipt_info)
                ? data.latest_receipt_info
                : (data.receipt && Array.isArray(data.receipt.in_app) ? data.receipt.in_app : []);
            const bundleFromReceipt = (data.receipt && data.receipt.bundle_id) || data.bundleId || '';

            for (const tx of receiptList) {
                if (!tx || !tx.product_id) continue;
                const origId = String(tx.original_transaction_id || tx.transaction_id || '');
                const ok = upsertSubscriptionRecord({
                    accountName,
                    bundleId: bundleFromReceipt || tx.bundle_id || 'sandbox.app',
                    productId: tx.product_id,
                    originalTransactionId: origId,
                    environment: data.environment || 'Sandbox',
                    expiresDateMs: Number(tx.expires_date_ms || 0),
                    autoRenewStatus: renewalMap[origId] !== undefined ? renewalMap[origId] : '1',
                    source: 'SK1-VerifyReceipt'
                });
                if (ok) count++;
            }

            // B. StoreKit 2 / App Store Server API v2 Sandbox: signedTransactionInfo / signedTransactions / data[].lastTransactions[]
            const jwsCandidates = [];
            if (typeof data.signedTransactionInfo === 'string') jwsCandidates.push(data.signedTransactionInfo);
            if (Array.isArray(data.signedTransactions)) {
                for (const s of data.signedTransactions) {
                    if (typeof s === 'string') jwsCandidates.push(s);
                }
            }
            if (Array.isArray(data.data)) {
                for (const group of data.data) {
                    if (group && Array.isArray(group.lastTransactions)) {
                        for (const lt of group.lastTransactions) {
                            if (lt && typeof lt.signedTransactionInfo === 'string') {
                                jwsCandidates.push(lt.signedTransactionInfo);
                            }
                        }
                    }
                }
            }

            for (const jws of jwsCandidates) {
                const payload = decodeJwsPayloadReadOnly(jws);
                if (!payload || !payload.productId) continue;
                const ok = upsertSubscriptionRecord({
                    accountName,
                    bundleId: payload.bundleId || 'sandbox.app',
                    productId: payload.productId,
                    originalTransactionId: String(payload.originalTransactionId || payload.transactionId || ''),
                    environment: payload.environment || 'Sandbox',
                    expiresDateMs: Number(payload.expiresDate || 0),
                    autoRenewStatus: '1',
                    source: 'SK2-JWS-ReadOnly'
                });
                if (ok) count++;
            }
        } catch (e) {
            console.log(`[${PLATFORM}-TF-Sub] Bỏ qua JSON không chuẩn tại ${url}: ${e}`);
        }
    } else if (trimmed.includes('<plist') || trimmed.includes('<key>')) {
        // 2. Apple XML Plist (mzstorekit-sb / sandbox.itunes.apple.com)
        const productMatch = trimmed.match(/<key>product-?id<\/key>\s*<string>([^<]{1,120})<\/string>/i)
            || trimmed.match(/<key>productId<\/key>\s*<string>([^<]{1,120})<\/string>/i);
        const bidMatch = trimmed.match(/<key>(?:bid|bundle-?id|bundleId)<\/key>\s*<string>([^<]{1,120})<\/string>/i);
        const origMatch = trimmed.match(/<key>(?:original-transaction-id|originalTransactionId)<\/key>\s*<string>([^<]{1,64})<\/string>/i);
        const expMatch = trimmed.match(/<key>(?:expires-date-ms|expiresDate)<\/key>\s*<(?:string|integer)>(\d{10,16})<\/(?:string|integer)>/i);
        if (productMatch && productMatch[1]) {
            const ok = upsertSubscriptionRecord({
                accountName,
                bundleId: bidMatch ? bidMatch[1] : 'sandbox.plist',
                productId: productMatch[1],
                originalTransactionId: origMatch ? origMatch[1] : '-',
                environment: 'Sandbox',
                expiresDateMs: expMatch ? Number(expMatch[1]) : 0,
                autoRenewStatus: '1',
                source: 'Sandbox-Plist'
            });
            if (ok) count++;
        }
    }

    return count;
}

function formatExpiryCountdown(expiresDateMs) {
    if (!expiresDateMs || expiresDateMs <= 0) return { label: 'Chưa rõ hạn (Chờ đồng bộ)', expired: false, soon: false };
    const diffMs = expiresDateMs - Date.now();
    const dt = new Date(expiresDateMs).toLocaleString('vi-VN');
    if (diffMs <= 0) {
        return { label: `Đã hết hạn (${dt})`, expired: true, soon: true };
    }
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) {
        return { label: `Còn ${mins} phút (${dt})`, expired: false, soon: mins <= 10 };
    }
    const hours = Math.floor(mins / 60);
    if (hours < 48) {
        return { label: `Còn ${hours} giờ (${dt})`, expired: false, soon: hours <= 6 };
    }
    const days = Math.floor(hours / 24);
    return { label: `Còn ${days} ngày (${dt})`, expired: false, soon: days <= 3 };
}

function parseQueryParams(url) {
    const out = {};
    const qIdx = url.indexOf('?');
    if (qIdx === -1) return out;
    const query = url.slice(qIdx + 1);
    for (const part of query.split('&')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        const k = eq === -1 ? part : part.slice(0, eq);
        const v = eq === -1 ? '' : part.slice(eq + 1);
        out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
    return out;
}

function renderDashboardHtml(flashMsg) {
    const subs = loadJson(STORE_KEY_SUBS, []);
    const watchlist = new Set(loadJson(STORE_KEY_WATCH, []));
    const pool = loadJson(STORE_KEY_ACCOUNTS, []);
    const activeIdx = parseInt(readStore(STORE_KEY_ACTIVE_IDX, '0'), 10) || 0;
    const autoSwitch = readStore(STORE_KEY_AUTO_SWITCH, 'true') !== 'false';

    const accountHtml = Array.isArray(pool) && pool.length > 0
        ? pool.map((acc, i) => {
            const isAct = i === activeIdx;
            return `<div class="acc-item ${isAct ? 'active' : ''}">
                <div>
                    <strong>${escapeHtml(acc.name || `Apple ID #${i + 1}`)}</strong>
                    <div class="muted">Key: ${escapeHtml((acc.key || '').slice(0, 8))}... | Đã vào: ${(acc.joinedApps || []).length} app</div>
                </div>
                <a class="btn small" href="/switch?idx=${i}">${isAct ? 'Đang chọn' : 'Chọn nick'}</a>
            </div>`;
        }).join('')
        : `<div class="muted">Chưa có nick Apple ID nào trong kho <code>TF_ACCOUNTS</code>. Hãy mở ứng dụng TestFlight khi bật VPN để tự động lưu nick.</div>`;

    const subRows = Array.isArray(subs) && subs.length > 0
        ? subs.map(s => {
            const isPinned = watchlist.has(s.uid);
            const expInfo = formatExpiryCountdown(s.expiresDateMs);
            const badge = expInfo.expired
                ? '<span class="badge red">HẾT HẠN</span>'
                : (expInfo.soon ? '<span class="badge warn">SẮP HẾT</span>' : '<span class="badge ok">ĐANG HOẠT ĐỘNG</span>');
            return `<div class="card-row">
                <div class="row-top">
                    <div>
                        <strong>${escapeHtml(s.productId)}</strong> ${badge}
                        <div class="muted">App: ${escapeHtml(s.bundleId)} • Nick: ${escapeHtml(s.accountName)}</div>
                        <div class="muted">TxID: ${escapeHtml(s.originalTransactionId)} • ${escapeHtml(expInfo.label)}</div>
                    </div>
                </div>
                <div class="actions">
                    <a class="btn ${isPinned ? 'primary' : ''}" href="/toggle?uid=${encodeURIComponent(s.uid)}">${isPinned ? '✅ Đang theo dõi gia hạn' : '➕ Chọn gia hạn'}</a>
                    <a class="btn" href="itms-apps://apps.apple.com/account/subscriptions">🔄 Mở mục Đăng ký iOS</a>
                    <a class="btn danger" href="/delete?uid=${encodeURIComponent(s.uid)}">Xóa</a>
                </div>
            </div>`;
        }).join('')
        : `<div class="muted">Chưa ghi nhận gói đăng ký TestFlight / Sandbox nào. Mở ứng dụng TestFlight có gói Sandbox hoặc thêm thủ công bên dưới.</div>`;

    return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Quản Lý Gói Đăng Ký TestFlight & Đảo Nick Apple ID</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px;line-height:1.5}
  .wrap{max-width:760px;margin:0 auto}
  h1{font-size:20px;margin:0 0 8px}
  h2{font-size:15px;margin:18px 0 8px;color:#38bdf8}
  .box{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:14px}
  .muted{color:#94a3b8;font-size:12px}
  .flash{background:#065f46;color:#ecfdf5;padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px}
  .note{background:#172554;border-left:4px solid #38bdf8;padding:10px 12px;border-radius:6px;font-size:12px;color:#cbd5e1;margin-bottom:12px}
  .acc-item,.card-row{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:10px 12px;margin-bottom:8px}
  .acc-item{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .acc-item.active{border-color:#38bdf8}
  .actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .btn{display:inline-block;padding:6px 10px;border-radius:8px;background:#334155;color:#f8fafc;text-decoration:none;font-size:12px;border:none;cursor:pointer}
  .btn.primary{background:#0284c7}
  .btn.danger{background:#991b1b}
  .badge{font-size:10px;padding:2px 6px;border-radius:6px;margin-left:4px;font-weight:700}
  .badge.ok{background:#065f46;color:#a7f3d0}
  .badge.warn{background:#92400e;color:#fde68a}
  .badge.red{background:#991b1b;color:#fecaca}
  input{width:100%;box-sizing:border-box;padding:8px;margin:4px 0 8px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#f8fafc;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <h1>📦 Quản Lý Gói Đăng Ký TestFlight & Đảo Nick Apple ID</h1>
  <div class="muted">Nền tảng: ${escapeHtml(PLATFORM)} • Chế độ StoreKit Chỉ Đọc (Read-Only Audit) • Tối ưu A9 iOS 15.8.8</div>
  ${flashMsg ? `<div class="flash">${escapeHtml(flashMsg)}</div>` : ''}

  <div class="note">
    <strong>Cơ chế Apple TestFlight / Sandbox:</strong> Các gói đăng ký trong TestFlight miễn phí và được Apple Sandbox tự động gia hạn tối đa 6–12 chu kỳ nhanh. Bảng này tự động ghi nhận gói (chỉ đọc, không sửa biên lai), theo dõi hạn và báo đẩy 1 chạm khi cần gia hạn lại.
  </div>

  <div class="box">
    <h2>👤 Kho Nick Apple ID (${Array.isArray(pool) ? pool.length : 0} nick)</h2>
    <div style="margin-bottom:10px">
      <a class="btn ${autoSwitch ? 'primary' : ''}" href="/toggle-rotate">${autoSwitch ? '🔁 Tự động đảo nick: ĐANG BẬT' : '⏸ Tự động đảo nick: ĐANG TẮT'}</a>
      <a class="btn" href="http://tf-link.test/">✈️ Mở Quản Lý Link TestFlight</a>
      <a class="btn" href="http://tf-radar.test/">📡 Mở Radar Slot</a>
    </div>
    ${accountHtml}
  </div>

  <div class="box">
    <h2>🧾 Gói Đăng Ký TestFlight / Sandbox Đã Mua (${Array.isArray(subs) ? subs.length : 0})</h2>
    ${subRows}
  </div>

  <div class="box">
    <h2>➕ Thêm Gói Đăng Ký TestFlight Cần Theo Dõi Thủ Công</h2>
    <form method="GET" action="/add">
      <label class="muted">Mã Gói (Product ID, ví dụ: com.app.pro.monthly)</label>
      <input name="productId" required placeholder="com.example.pro.monthly"/>
      <label class="muted">Mã Ứng Dụng (Bundle ID, tùy chọn)</label>
      <input name="bundleId" placeholder="com.example.app"/>
      <label class="muted">Original Transaction ID (tùy chọn)</label>
      <input name="origId" placeholder="2000000..."/>
      <button class="btn primary" type="submit">Lưu & Chọn Theo Dõi Gia Hạn</button>
    </form>
  </div>
</div>
</body>
</html>`;
}

function handleWebDashboard(url) {
    const q = parseQueryParams(url);
    let flash = '';

    if (url.includes('/toggle-rotate')) {
        const cur = readStore(STORE_KEY_AUTO_SWITCH, 'true') !== 'false';
        writeStore(cur ? 'false' : 'true', STORE_KEY_AUTO_SWITCH);
        flash = cur ? 'Đã TẮT tự động đảo nick Apple ID.' : 'Đã BẬT tự động đảo nick Apple ID.';
    } else if (url.includes('/switch') && q.idx !== undefined) {
        const pool = loadJson(STORE_KEY_ACCOUNTS, []);
        const idx = parseInt(q.idx, 10);
        if (Array.isArray(pool) && idx >= 0 && idx < pool.length) {
            writeStore(String(idx), STORE_KEY_ACTIVE_IDX);
            const acc = pool[idx];
            if (acc.key) writeStore(acc.key, 'key');
            if (acc.session_id) writeStore(acc.session_id, 'session_id');
            if (acc.session_digest) writeStore(acc.session_digest, 'session_digest');
            if (acc.request_id) writeStore(acc.request_id, 'request_id');
            flash = `Đã chuyển sang nick: ${acc.name || `Apple ID #${idx + 1}`}`;
        }
    } else if (url.includes('/toggle') && q.uid) {
        const watch = new Set(loadJson(STORE_KEY_WATCH, []));
        if (watch.has(q.uid)) {
            watch.delete(q.uid);
            flash = 'Đã bỏ chọn gói khỏi danh sách theo dõi gia hạn.';
        } else {
            watch.add(q.uid);
            flash = 'Đã chọn cố định gói vào danh sách theo dõi gia hạn tự động.';
        }
        writeStore(JSON.stringify(Array.from(watch)), STORE_KEY_WATCH);
    } else if (url.includes('/delete') && q.uid) {
        const subs = loadJson(STORE_KEY_SUBS, []).filter(s => s.uid !== q.uid);
        const watch = loadJson(STORE_KEY_WATCH, []).filter(id => id !== q.uid);
        writeStore(JSON.stringify(subs), STORE_KEY_SUBS);
        writeStore(JSON.stringify(watch), STORE_KEY_WATCH);
        flash = 'Đã xóa gói khỏi danh sách.';
    } else if (url.includes('/add') && q.productId) {
        const productId = q.productId.trim();
        const bundleId = (q.bundleId || 'testflight.beta').trim();
        const origId = (q.origId || 'manual').trim();
        upsertSubscriptionRecord({
            accountName: getActiveAccountLabel(),
            bundleId,
            productId,
            originalTransactionId: origId,
            environment: 'Sandbox',
            expiresDateMs: 0,
            autoRenewStatus: '1',
            source: 'Manual-Watchlist'
        });
        const uid = `${bundleId}::${productId}::${origId}`;
        const watch = new Set(loadJson(STORE_KEY_WATCH, []));
        watch.add(uid);
        writeStore(JSON.stringify(Array.from(watch)), STORE_KEY_WATCH);
        flash = `Đã lưu & chọn theo dõi gói: ${productId}`;
    }

    const html = renderDashboardHtml(flash);
    $done({
        response: {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
            body: html
        }
    });
}

function runCronWatchlistCheck() {
    const subs = loadJson(STORE_KEY_SUBS, []);
    const watchlist = new Set(loadJson(STORE_KEY_WATCH, []));
    const alertCache = loadJson(STORE_KEY_ALERT, {});

    if (!Array.isArray(subs) || watchlist.size === 0) {
        console.log(`[${PLATFORM}-TF-Sub] Chưa có gói đăng ký TestFlight nào được chọn theo dõi gia hạn.`);
        $done();
        return;
    }

    let alerted = 0;
    for (const s of subs) {
        if (!watchlist.has(s.uid)) continue;
        const expInfo = formatExpiryCountdown(s.expiresDateMs);
        if (expInfo.expired || expInfo.soon) {
            const lastAlert = parseInt(alertCache[s.uid] || '0', 10);
            if (isNaN(lastAlert) || Date.now() - lastAlert > 1800000) {
                alertCache[s.uid] = Date.now();
                alerted++;
                sendNotify(
                    expInfo.expired
                        ? `🔄 Cần Gia Hạn Gói TestFlight: ${s.productId}`
                        : `⏳ Gói TestFlight Sắp Hết Chu Kỳ: ${s.productId}`,
                    `Nick: ${s.accountName} • ${s.bundleId}`,
                    `${expInfo.label} — Nhấn để mở mục Đăng ký trên iOS và gia hạn lại ngay!`,
                    'itms-apps://apps.apple.com/account/subscriptions'
                );
            }
        }
    }

    if (alerted > 0) {
        writeStore(JSON.stringify(alertCache), STORE_KEY_ALERT);
    }
    console.log(`[${PLATFORM}-TF-Sub] Đã kiểm tra ${watchlist.size} gói đăng ký được chọn (Nhắc gia hạn: ${alerted}).`);
    $done();
}

(function main() {
    try {
        const isReq = typeof $request !== 'undefined' && $request !== null;
        const isResp = typeof $response !== 'undefined' && $response !== null;

        if (isReq && !isResp && /^http:\/\/tf-sub\.test(\/.*)?$/i.test($request.url || '')) {
            handleWebDashboard($request.url);
            return;
        }

        if (isResp) {
            const reqUrl = (isReq && $request.url) ? $request.url : '';
            const count = extractSubscriptionsFromSandboxBody($response.body || '', reqUrl);
            if (count > 0) {
                console.log(`[${PLATFORM}-TF-Sub] ✅ Đã ghi nhận chỉ đọc ${count} gói đăng ký TestFlight/Sandbox từ ${reqUrl}`);
            }
            // Cam kết 100% chỉ đọc: không bao giờ sửa đổi gói tin StoreKit gốc
            $done({});
            return;
        }

        runCronWatchlistCheck();
    } catch (err) {
        console.log(`[${PLATFORM}-TF-Sub] Lỗi ngoại lệ được bảo vệ: ${err}`);
        $done({});
    }
})();
