/*
 * Script: TF_keys.js
 * Tác giả gốc: DecoAri & Hely-T
 * Nâng cấp: version.5.1.0.0 (Loon & Shadowrocket Multi-Account Token Collector + 5 Default Beta Apps)
 * - Tự động nạp sẵn 5 ứng dụng TestFlight mặc định: rqvYCYOp (Edge), YSo8aVCS (Notion), m2kxP5cw (Notion Agents), LPQmtkUs (Chrome), Xh9VNQoA (Aloha VPN).
 * - Tự động bắt Token trên mọi đường dẫn /v2, /v3 (/apps, /settings, /ru/) kể cả khi có query string (?platform=ios).
 * - Chặn ghi đè null làm mất Token cũ khi phản hồi 304 Not Modified; tự xóa If-None-Match khi cần làm mới Token.
 * - Khóa chống trùng đổi nick 2000ms trên /v1/devices.
 */

const DEFAULT_BETA_IDS = ['rqvYCYOp', 'YSo8aVCS', 'm2kxP5cw', 'LPQmtkUs', 'Xh9VNQoA'];
const DEFAULT_BETA_CSV = DEFAULT_BETA_IDS.join(',');
const DEFAULT_CHROME_BETA_ID = 'LPQmtkUs';
const regAcc = /^https?:\/\/testflight\.apple\.com\/v\d\/accounts\/([0-9a-fA-F-]{36})\/(apps|settings|ru\/[A-Za-z0-9]+)(\?.*)?$/;
const regJoin = /^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]{5,12})/;
const regDevices = /^https?:\/\/testflight\.apple\.com\/v1\/devices(\?.*)?$/;

function getHeader(headers, name) {
    if (!headers) return '';
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === lower) return headers[k];
    }
    return '';
}

function readStore(key, fallback = '') {
    if (typeof $persistentStore !== 'undefined') {
        const val = $persistentStore.read(key);
        return (val !== undefined && val !== null && val !== 'null' && val !== 'undefined') ? val : fallback;
    }
    if (typeof $prefs !== 'undefined') {
        const val = $prefs.valueForKey(key);
        return (val !== undefined && val !== null && val !== 'null' && val !== 'undefined') ? val : fallback;
    }
    return fallback;
}

function writeStore(val, key) {
    const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (typeof $persistentStore !== 'undefined') return $persistentStore.write(strVal, key);
    if (typeof $prefs !== 'undefined') return $prefs.setValueForKey(strVal, key);
    return false;
}

function notifyUser(title, subtitle, body) {
    if (typeof $notification !== 'undefined' && $notification.post) {
        $notification.post(title, subtitle || '', body || '');
    } else if (typeof $notify !== 'undefined') {
        $notify(title, subtitle || '', body || '');
    }
}

function readAccountsPool() {
    try {
        const raw = readStore('TF_ACCOUNTS', '[]');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return [];
}

function ensureDefaultAppId() {
    const raw = readStore('APP_ID', '');
    const removedRaw = readStore('TF_REMOVED_IDS', '');
    const removedSet = new Set(removedRaw ? String(removedRaw).split(/[,;|+\s]+/).filter(Boolean) : []);
    const pool = readAccountsPool();
    const list = raw ? String(raw).split(/[,;|+\s]+/).map((s) => s.trim()).filter(Boolean) : [];

    for (const id of DEFAULT_BETA_IDS) {
        if (list.includes(id) || removedSet.has(id)) continue;
        const allJoined = pool.length > 0
            ? pool.every((acc) => acc && Array.isArray(acc.joinedApps) && acc.joinedApps.includes(id))
            : (id === DEFAULT_CHROME_BETA_ID && readStore('TF_DEFAULT_CHROME_JOINED', 'false') === 'true');
        if (!allJoined) list.push(id);
    }

    const finalStr = Array.from(new Set(list)).join(',');
    if (finalStr !== raw) writeStore(finalStr, 'APP_ID');
    return finalStr;
}

function syncAccountToPool(accountObj) {
    if (!accountObj || !accountObj.key || !accountObj.session_id || !accountObj.session_digest || !accountObj.request_id) {
        return { total: 0, isChanged: false };
    }
    const pool = readAccountsPool();
    const idx = pool.findIndex((item) => item && item.key === accountObj.key);
    let isChanged = false;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (idx >= 0) {
        if (pool[idx].session_id !== accountObj.session_id || pool[idx].session_digest !== accountObj.session_digest) {
            isChanged = true;
        }
        pool[idx] = Object.assign({}, pool[idx], accountObj, { updatedAt: nowStr });
    } else {
        isChanged = true;
        pool.push(Object.assign({ name: `Nick Apple ID #${pool.length + 1} (${accountObj.key.slice(0, 6)})`, joinedApps: [] }, accountObj, { updatedAt: nowStr }));
    }
    writeStore(JSON.stringify(pool), 'TF_ACCOUNTS');
    return { total: pool.length, isChanged };
}

if (typeof $request !== 'undefined' && $request && $request.url) {
    const url = $request.url;
    let modifiedHeaders = null;

    if (regAcc.test(url)) {
        const accMatch = regAcc.exec(url);
        const key = accMatch ? accMatch[1] : '';
        const session_id = getHeader($request.headers, 'x-session-id');
        const session_digest = getHeader($request.headers, 'x-session-digest');
        const request_id = getHeader($request.headers, 'x-request-id');
        const ua = getHeader($request.headers, 'user-agent') || 'TestFlight/3.5.0 (iPhone; iOS 17.7; Scale/3.00)';

        if (!readStore('session_id') || readStore('session_id') !== session_id) {
            if ($request.headers && ($request.headers['If-None-Match'] || $request.headers['if-none-match'])) {
                modifiedHeaders = Object.assign({}, $request.headers);
                delete modifiedHeaders['If-None-Match'];
                delete modifiedHeaders['if-none-match'];
            }
        }

        if (key && session_id && session_digest && request_id) {
            writeStore(key, 'key');
            writeStore(session_id, 'session_id');
            writeStore(session_digest, 'session_digest');
            writeStore(request_id, 'request_id');
            writeStore(ua, 'tf_ua');

            const syncInfo = syncAccountToPool({ key, session_id, session_digest, request_id, tf_ua: ua });
            const currentAppIds = ensureDefaultAppId();
            if (syncInfo.isChanged) {
                notifyUser(
                    '🎉 Đã thu thập Token TestFlight',
                    `Tài khoản (${key.slice(0, 8)}...) | Kho: ${syncInfo.total} nick`,
                    `Đang canh tự động APP_ID: ${currentAppIds || DEFAULT_BETA_CSV}`
                );
            }
        }
        $done(modifiedHeaders ? { headers: modifiedHeaders } : {});
    } else if (regJoin.test(url)) {
        const match = regJoin.exec(url);
        const id = match && match[1] ? match[1] : '';
        if (id) {
            const removedRaw = readStore('TF_REMOVED_IDS', '');
            if (removedRaw) {
                const nextRemoved = String(removedRaw).split(/[,;|+\s]+/).filter((x) => x && x !== id);
                writeStore(nextRemoved.join(','), 'TF_REMOVED_IDS');
            }
        }
        let appId = ensureDefaultAppId();
        const arr = appId ? appId.split(/[,;|+\s]+/).map((s) => s.trim()).filter(Boolean) : [];
        if (id && !arr.includes(id)) {
            arr.push(id);
            appId = Array.from(new Set(arr)).join(',');
            writeStore(appId, 'APP_ID');
            notifyUser('✈️ Đã thêm APP_ID TestFlight', `Mã mới: ${id}`, `Danh sách hiện tại: ${appId}`);
        }
        $done({});
    } else if (regDevices.test(url)) {
        const lastTs = parseInt(readStore('TF_LAST_SWITCH_TS', '0'), 10);
        if (isNaN(lastTs) || Date.now() - lastTs >= 2000) {
            const pool = readAccountsPool();
            if (pool.length > 1) {
                writeStore(String(Date.now()), 'TF_LAST_SWITCH_TS');
                let idx = parseInt(readStore('TF_ACTIVE_ACCOUNT_IDX', '0'), 10);
                if (isNaN(idx) || idx < 0) idx = 0;
                idx = (idx + 1) % pool.length;
                const nextAcc = pool[idx];
                writeStore(String(idx), 'TF_ACTIVE_ACCOUNT_IDX');
                writeStore(nextAcc.key, 'key');
                writeStore(nextAcc.session_id, 'session_id');
                writeStore(nextAcc.session_digest, 'session_digest');
                writeStore(nextAcc.request_id, 'request_id');
                if (nextAcc.tf_ua) writeStore(nextAcc.tf_ua, 'tf_ua');
                notifyUser(
                    '🔄 Đã tự động đổi Apple ID',
                    `Đang dùng: ${nextAcc.name || 'AppleID #' + (idx + 1)}`,
                    `Tổng số tài khoản đã lưu: ${pool.length}`
                );
            }
        }
        $done({});
    } else {
        $done({});
    }
} else {
    $done({});
}
