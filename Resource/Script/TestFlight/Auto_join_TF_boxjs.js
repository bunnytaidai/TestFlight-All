/*
 * Script: Auto_join_TF_boxjs.js (BoxJS + Loon + Shadowrocket + Surge Multi-Account Edition)
 * Tác giả gốc: DecoAri & Hely-T
 * Bản nâng cấp Thực Chiến Toàn Diện cho Loon & Shadowrocket ($loon / $rocket) - version.5.1.0.0:
 * 1. Tích hợp sẵn 5 link mục tiêu mặc định tự động tham gia:
 *    - Microsoft Edge beta (rqvYCYOp)
 *    - Notion: Ghi chép, Nhiệm vụ, AI beta (YSo8aVCS)
 *    - Notion Agents beta (m2kxP5cw)
 *    - Google Chrome beta (LPQmtkUs)
 *    - Aloha Browser – Private VPN beta (Xh9VNQoA)
 * 2. Cơ chế Săn Slot Thông Minh 2 Tầng (Public HTML Pre-Check + Multi-Account Auto Accept), tương thích 100% với BoxJS và http://tf.boxjs.com/.
 * 3. Bảo vệ dữ liệu tuyệt đối: chỉ xóa APP_ID khi HTTP 404 thật sự, chống lỗi xóa nhầm khi rớt mạng / HTTP 504.
 */

const DEFAULT_BETA_TARGETS = {
    rqvYCYOp: 'Microsoft Edge beta',
    YSo8aVCS: 'Notion: Ghi chép, Nhiệm vụ, AI beta',
    m2kxP5cw: 'Notion Agents beta',
    LPQmtkUs: 'Google Chrome beta',
    Xh9VNQoA: 'Aloha Browser – Private VPN beta'
};
const DEFAULT_BETA_IDS = Object.keys(DEFAULT_BETA_TARGETS);
const DEFAULT_BETA_CSV = DEFAULT_BETA_IDS.join(',');
const DEFAULT_CHROME_BETA_ID = 'LPQmtkUs';
const DEFAULT_UA = 'TestFlight/3.5.0 (iPhone; iOS 17.7; Scale/3.00)';
const PUBLIC_WEB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function getDefaultAppName(code) {
    return DEFAULT_BETA_TARGETS[code] || code;
}

function getPlatformName() {
    if (typeof $loon !== 'undefined') return 'Loon';
    if (typeof $rocket !== 'undefined') return 'Shadowrocket';
    if (typeof $environment !== 'undefined' && $environment['surge-version']) return 'Surge';
    if (typeof $environment !== 'undefined' && $environment['stash-version']) return 'Stash';
    return 'Loon/Shadowrocket';
}

const PLATFORM = getPlatformName();

function readStore(key, fallback = null) {
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
    if (typeof $persistentStore !== 'undefined') {
        return $persistentStore.write(strVal, key);
    }
    if (typeof $prefs !== 'undefined') {
        return $prefs.setValueForKey(strVal, key);
    }
    return false;
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
        if (openUrl) {
            $notify(title, subtitle || '', message || '', { 'open-url': openUrl });
        } else {
            $notify(title, subtitle || '', message || '');
        }
    }
    console.log(`[${PLATFORM}-TF] ${title} | ${subtitle || ''} | ${message || ''}`);
}

function extractSingleAppId(token) {
    if (!token) return '';
    const cleaned = String(token).trim();
    const joinMatch = cleaned.match(/(?:testflight\.apple\.com\/join\/|\/ru\/)([A-Za-z0-9]{5,12})/i);
    if (joinMatch && joinMatch[1]) return joinMatch[1];
    const stripped = cleaned.replace(/[\[\]\{\}"'\s]/g, '');
    if (/^[A-Za-z0-9]{5,12}$/.test(stripped) && !/^(APP_ID|null|undefined|true|false)$/i.test(stripped)) {
        return stripped;
    }
    return '';
}

function sanitizeAppIdList(rawStr) {
    if (!rawStr) return '';
    const parts = String(rawStr).split(/[,;|+\s\n]+/);
    const valid = [];
    for (const p of parts) {
        const code = extractSingleAppId(p);
        if (code && !valid.includes(code)) valid.push(code);
    }
    return valid.join(',');
}

function getRemovedAppIds() {
    const raw = readStore('TF_REMOVED_IDS', '');
    return new Set(raw ? String(raw).split(/[,;|+\s]+/).filter(Boolean) : []);
}

function markAppIdRemoved(id) {
    if (!id) return;
    const set = getRemovedAppIds();
    set.add(id);
    writeStore(Array.from(set).join(','), 'TF_REMOVED_IDS');
}

function unmarkAppIdRemoved(id) {
    if (!id) return;
    const set = getRemovedAppIds();
    if (set.delete(id)) {
        writeStore(Array.from(set).join(','), 'TF_REMOVED_IDS');
    }
}

function parseArgumentAppIds() {
    if (typeof $argument === 'undefined' || !$argument) return '';
    if (typeof $argument === 'object') {
        const candidate = $argument.APP_ID || $argument.app_id || '';
        return sanitizeAppIdList(candidate);
    }
    const raw = String($argument).trim();
    if (!raw || raw === '[APP_ID]' || raw === '{{{APP_ID}}}') return '';
    if (raw.includes('=')) {
        const pairs = Object.fromEntries(
            raw.split('&').map(part => {
                const idx = part.indexOf('=');
                if (idx === -1) return [part.trim(), ''];
                return [part.slice(0, idx).trim(), part.slice(idx + 1).replace(/^"|"$/g, '').trim()];
            })
        );
        if (pairs.APP_ID !== undefined) return sanitizeAppIdList(pairs.APP_ID);
    }
    return sanitizeAppIdList(raw.replace(/^APP_ID=/i, '').trim());
}

function loadAccountsPool() {
    try {
        const raw = readStore('TF_ACCOUNTS', '[]');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return [];
}

function saveAccountsPool(pool) {
    writeStore(JSON.stringify(pool), 'TF_ACCOUNTS');
}

function loadJsonStore(key, fallbackObj) {
    try {
        const raw = readStore(key, '');
        if (!raw) return fallbackObj;
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : fallbackObj;
    } catch (e) {
        return fallbackObj;
    }
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function parsePublicJoinHtml(code, status, html) {
    const nowIso = new Date().toISOString();
    if (status === 404) {
        return { code, status: 'INVALID', appName: code, iconUrl: '', message: 'Liên kết không tồn tại (HTTP 404)', checkedAt: nowIso };
    }
    if (status !== 200 || !html) {
        return { code, status: 'UNKNOWN', appName: code, iconUrl: '', message: `HTTP ${status}`, checkedAt: nowIso };
    }

    let appName = getDefaultAppName(code);
    const titleMatch = html.match(/<title>\s*(?:Join the\s+|Tham gia\s+|加入\s*)?(.+?)\s*-\s*TestFlight(?:\s*-\s*Apple)?\s*<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        appName = decodeHtmlEntities(titleMatch[1]);
    }

    let iconUrl = '';
    const iconMatch = html.match(/background-image:\s*url\((https:\/\/[^)]+mzstatic\.com[^)]+)\)/i)
        || html.match(/meta\s+property="og:image"\s+content="(https:\/\/[^"]+)"/i);
    if (iconMatch && iconMatch[1]) {
        iconUrl = iconMatch[1].replace(/['"]/g, '').trim();
    }

    const statusBlockMatch = html.match(/<div\s+class="beta-status"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i);
    const statusMsg = statusBlockMatch && statusBlockMatch[1]
        ? decodeHtmlEntities(statusBlockMatch[1].replace(/<[^>]+>/g, ' '))
        : '';

    if (/doesn't exist|not found|link is invalid|isn't valid|không tồn tại|không hợp lệ|链接无效|不存在/i.test(statusMsg || html)) {
        return { code, status: 'INVALID', appName, iconUrl, message: statusMsg || 'Liên kết TestFlight hết hiệu lực', checkedAt: nowIso };
    }

    if (/this beta is full|beta is full|not accepting any new testers|đã đầy|không nhận thêm|名额已满|不接受任何新测试员/i.test(statusMsg)) {
        return { code, status: 'FULL', appName, iconUrl, message: statusMsg, checkedAt: nowIso };
    }

    if (/start testing|tap\s+accept|open in testflight|join the[\s\S]{1,80}beta|chấp nhận|bắt đầu thử nghiệm/i.test(html) && !/beta-status/i.test(html)) {
        return { code, status: 'OPEN', appName, iconUrl, message: 'Còn slot trống (OPEN)', checkedAt: nowIso };
    }

    if (statusMsg && !/this beta is full|beta is full|not accepting|đã đầy|không nhận thêm|已满/i.test(statusMsg)) {
        return { code, status: 'OPEN', appName, iconUrl, message: statusMsg, checkedAt: nowIso };
    }

    return { code, status: 'UNKNOWN', appName, iconUrl, message: statusMsg || 'Cần kiểm tra xác thực API', checkedAt: nowIso };
}

function checkPublicBetaSlot(code) {
    return new Promise((resolve) => {
        const joinUrl = `https://testflight.apple.com/join/${code}`;
        $httpClient.get(
            {
                url: joinUrl,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': PUBLIC_WEB_UA
                },
                timeout: 8
            },
            (err, resp, body) => {
                if (err) {
                    resolve({ code, status: 'UNKNOWN', appName: code, iconUrl: '', message: String(err), checkedAt: new Date().toISOString() });
                    return;
                }
                const httpStatus = resp ? (resp.status || resp.statusCode || 0) : 0;
                const info = parsePublicJoinHtml(code, httpStatus, body || '');
                const radarCache = loadJsonStore('TF_PUBLIC_RADAR_CACHE', {});
                radarCache[code] = info;
                writeStore(JSON.stringify(radarCache), 'TF_PUBLIC_RADAR_CACHE');
                resolve(info);
            }
        );
    });
}

function syncBoxJsSession(accountObj) {
    try {
        const rawSessions = readStore('chavy_boxjs_sessions', '[]');
        let sessions = [];
        try {
            sessions = JSON.parse(rawSessions);
            if (!Array.isArray(sessions)) sessions = [];
        } catch (e) {
            sessions = [];
        }

        const shortKey = accountObj.key ? accountObj.key.slice(0, 8) : 'AppleID';
        const sessionName = accountObj.name || `AppleID_${shortKey}`;
        const existingIdx = sessions.findIndex(
            s => s && s.appId === 'Auto_join_TF' && Array.isArray(s.datas) && s.datas.some(d => d.key === 'key' && d.val === accountObj.key)
        );

        const sessionPayload = {
            id: existingIdx !== -1 ? sessions[existingIdx].id : `tf_${accountObj.key}`,
            name: sessionName,
            appId: 'Auto_join_TF',
            appName: 'Theo dõi TestFlight',
            enable: true,
            createTime: accountObj.updatedAt || new Date().toISOString().replace('T', ' ').slice(0, 19),
            datas: [
                { key: 'key', val: accountObj.key },
                { key: 'session_id', val: accountObj.session_id },
                { key: 'session_digest', val: accountObj.session_digest },
                { key: 'request_id', val: accountObj.request_id },
                { key: 'tf_ua', val: accountObj.tf_ua }
            ]
        };

        if (existingIdx !== -1) {
            sessions[existingIdx] = sessionPayload;
        } else {
            sessions.push(sessionPayload);
        }
        writeStore(JSON.stringify(sessions), 'chavy_boxjs_sessions');

        const iRingoCache = {
            headers: {
                'X-Request-Id': accountObj.request_id,
                'X-Session-Id': accountObj.session_id,
                'X-Session-Digest': accountObj.session_digest
            },
            data: {
                accountId: accountObj.key,
                sessionId: accountObj.session_id,
                termsAndConditions: null,
                hasNewTermsAndConditions: false
            }
        };
        let iRingoRoot = {};
        try {
            iRingoRoot = JSON.parse(readStore('iRingo', '{}')) || {};
        } catch (e) {
            iRingoRoot = {};
        }
        iRingoRoot.TestFlight = iRingoRoot.TestFlight || {};
        iRingoRoot.TestFlight.Caches = iRingoCache;
        iRingoRoot.TestFlight.Settings = Object.assign(
            { Switch: true, CountryCode: 'US', MultiAccount: true, Universal: true },
            iRingoRoot.TestFlight.Settings || {}
        );
        writeStore(JSON.stringify(iRingoRoot), 'iRingo');
    } catch (err) {
        console.log(`[${PLATFORM}-TF] Lỗi đồng bộ BoxJS Session: ${err}`);
    }
}

function upsertAccountToken({ key, session_id, session_digest, request_id, tf_ua }) {
    if (!key || !session_id || !session_digest || !request_id) return null;

    writeStore(session_id, 'session_id');
    writeStore(session_digest, 'session_digest');
    writeStore(request_id, 'request_id');
    writeStore(key, 'key');
    writeStore(tf_ua || DEFAULT_UA, 'tf_ua');

    const pool = loadAccountsPool();
    let idx = pool.findIndex(acc => acc && acc.key === key);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let isChanged = false;

    if (idx === -1) {
        isChanged = true;
        const newAcc = {
            key,
            name: `Nick Apple ID #${pool.length + 1} (${key.slice(0, 6)})`,
            session_id,
            session_digest,
            request_id,
            tf_ua: tf_ua || DEFAULT_UA,
            joinedApps: [],
            updatedAt: nowStr
        };
        pool.push(newAcc);
        idx = pool.length - 1;
    } else {
        if (pool[idx].session_id !== session_id || pool[idx].session_digest !== session_digest) {
            isChanged = true;
        }
        pool[idx].session_id = session_id;
        pool[idx].session_digest = session_digest;
        pool[idx].request_id = request_id;
        pool[idx].tf_ua = tf_ua || pool[idx].tf_ua || DEFAULT_UA;
        pool[idx].updatedAt = nowStr;
        if (!Array.isArray(pool[idx].joinedApps)) pool[idx].joinedApps = [];
    }

    saveAccountsPool(pool);
    writeStore(String(idx), 'TF_ACTIVE_ACCOUNT_IDX');
    syncBoxJsSession(pool[idx]);
    return { account: pool[idx], index: idx, total: pool.length, isChanged };
}

function switchNextAppleIdAccount(notifyUser = true) {
    const lastSwitchTs = parseInt(readStore('TF_LAST_SWITCH_TS', '0'), 10);
    if (!isNaN(lastSwitchTs) && Date.now() - lastSwitchTs < 2000) {
        return null;
    }
    const pool = loadAccountsPool();
    if (pool.length <= 1) return null;
    writeStore(String(Date.now()), 'TF_LAST_SWITCH_TS');

    let curIdx = parseInt(readStore('TF_ACTIVE_ACCOUNT_IDX', '0'), 10);
    if (isNaN(curIdx) || curIdx < 0 || curIdx >= pool.length) curIdx = 0;

    const nextIdx = (curIdx + 1) % pool.length;
    const nextAcc = pool[nextIdx];

    writeStore(nextAcc.session_id, 'session_id');
    writeStore(nextAcc.session_digest, 'session_digest');
    writeStore(nextAcc.request_id, 'request_id');
    writeStore(nextAcc.key, 'key');
    writeStore(nextAcc.tf_ua || DEFAULT_UA, 'tf_ua');
    writeStore(String(nextIdx), 'TF_ACTIVE_ACCOUNT_IDX');
    syncBoxJsSession(nextAcc);
    ensureDefaultAppIdForAccount(nextAcc);

    if (notifyUser) {
        sendNotify(
            '🔄 Đã tự động đổi Nick Apple ID',
            `${nextAcc.name} [${nextIdx + 1}/${pool.length}]`,
            `Đang kích hoạt săn gói TestFlight (${readStore('APP_ID', DEFAULT_BETA_CSV)})`
        );
    }
    return { account: nextAcc, index: nextIdx, total: pool.length };
}

function isJoinedByAllAccounts(id, accountObj, pool) {
    const activePool = Array.isArray(pool) && pool.length > 0 ? pool : loadAccountsPool();
    if (activePool.length > 0) {
        return activePool.every(acc => acc && Array.isArray(acc.joinedApps) && acc.joinedApps.includes(id));
    }
    if (accountObj && Array.isArray(accountObj.joinedApps) && accountObj.joinedApps.includes(id)) {
        return true;
    }
    if (id === DEFAULT_CHROME_BETA_ID && readStore('TF_DEFAULT_CHROME_JOINED', 'false') === 'true') {
        return true;
    }
    return false;
}

function ensureDefaultAppIdForAccount(accountObj, pool) {
    const rawExisting = readStore('APP_ID', '');
    const cleanExisting = sanitizeAppIdList(rawExisting);
    const argIds = parseArgumentAppIds();
    const removedIds = getRemovedAppIds();

    let list = cleanExisting ? cleanExisting.split(',').filter(Boolean) : [];
    const autoSeedCandidates = [
        ...DEFAULT_BETA_IDS,
        ...(argIds ? argIds.split(',').filter(Boolean) : [])
    ];

    for (const id of autoSeedCandidates) {
        if (list.includes(id)) continue;
        if (removedIds.has(id)) continue;
        if (isJoinedByAllAccounts(id, accountObj, pool)) continue;
        list.push(id);
    }

    const finalList = Array.from(new Set(list));
    const finalStr = finalList.join(',');
    if (finalStr !== rawExisting) {
        writeStore(finalStr, 'APP_ID');
    }
    return finalList;
}

function removeInvalidAppId(ID, currentIds, reasonMsg) {
    const idx = currentIds.indexOf(ID);
    if (idx !== -1) currentIds.splice(idx, 1);
    markAppIdRemoved(ID);
    if (ID === DEFAULT_CHROME_BETA_ID) writeStore('true', 'TF_DEFAULT_CHROME_JOINED');
    writeStore(currentIds.join(','), 'APP_ID');
    sendNotify('⚠️ Liên kết TestFlight không tồn tại', `Mã APP_ID: ${ID}`, reasonMsg || 'Đã tự động xóa khỏi danh sách chờ');
}

if (typeof $request !== 'undefined' && $request && $request.url) {
    const url = $request.url;
    const accPattern = /^https?:\/\/testflight\.apple\.com\/v\d\/accounts\/([0-9a-fA-F-]{36})\/(apps|settings|ru\/[A-Za-z0-9]+)/;
    const accMatch = url.match(accPattern);
    const key = accMatch ? accMatch[1] : null;
    let modifiedHeaders = null;

    const addAppIdHandler = (rawId) => {
        const appId = extractSingleAppId(rawId);
        if (!appId) return;
        unmarkAppIdRemoved(appId);
        const seededList = ensureDefaultAppIdForAccount(null);
        const appIdSet = new Set(seededList);
        if (!appIdSet.has(appId)) {
            appIdSet.add(appId);
            writeStore(Array.from(appIdSet).join(','), 'APP_ID');
            sendNotify(
                '✈️ Đã thêm Link TestFlight vào hàng đợi',
                `Mã APP_ID: ${appId} (${getDefaultAppName(appId)})`,
                `Danh sách đang săn: ${Array.from(appIdSet).join(',')}`,
                `itms-beta://testflight.apple.com/join/${appId}`
            );
        }
    };

    if (/^https?:\/\/testflight\.apple\.com\/v1\/devices(\?.*)?$/.test(url)) {
        switchNextAppleIdAccount(true);
    } else if (key) {
        const rawHeaders = $request.headers || {};
        const lowerHeaders = Object.fromEntries(
            Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v])
        );
        const session_id = lowerHeaders['x-session-id'];
        const session_digest = lowerHeaders['x-session-digest'];
        const request_id = lowerHeaders['x-request-id'];
        const tf_ua = lowerHeaders['user-agent'] || DEFAULT_UA;

        if (!readStore('session_id') || readStore('session_id') !== session_id) {
            if (rawHeaders['If-None-Match'] || rawHeaders['if-none-match']) {
                modifiedHeaders = Object.assign({}, rawHeaders);
                delete modifiedHeaders['If-None-Match'];
                delete modifiedHeaders['if-none-match'];
            }
        }

        const saved = upsertAccountToken({ key, session_id, session_digest, request_id, tf_ua });
        const activeIds = ensureDefaultAppIdForAccount(saved ? saved.account : null);

        if (saved && saved.isChanged) {
            sendNotify(
                `🎉 Đã lưu Token ${saved.account.name}`,
                `Kho Apple ID đã lưu: ${saved.total} nick`,
                `Đang tự động canh slot: ${activeIds.join(',') || DEFAULT_BETA_CSV}`
            );
        }

        if (/\/ru\/([A-Za-z0-9]+)/.test(url)) {
            const ruMatch = url.match(/\/ru\/([A-Za-z0-9]+)/);
            if (ruMatch && ruMatch[1]) addAppIdHandler(ruMatch[1]);
        }
    } else if (/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/.test(url)) {
        const joinMatch = url.match(/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/);
        if (joinMatch && joinMatch[1]) addAppIdHandler(joinMatch[1]);
    }

    $done(modifiedHeaders ? { headers: modifiedHeaders } : {});
} else {
    !(async () => {
        const lastCronTs = parseInt(readStore('TF_LAST_CRON_TS', '0'), 10);
        if (!isNaN(lastCronTs) && Date.now() - lastCronTs < 4000) {
            $done();
            return;
        }
        writeStore(String(Date.now()), 'TF_LAST_CRON_TS');

        let pool = loadAccountsPool();
        const currentKey = readStore('key');
        if (pool.length === 0 && currentKey) {
            const initialized = upsertAccountToken({
                key: currentKey,
                session_id: readStore('session_id'),
                session_digest: readStore('session_digest'),
                request_id: readStore('request_id'),
                tf_ua: readStore('tf_ua', DEFAULT_UA)
            });
            if (initialized) pool = loadAccountsPool();
        }

        const ids = ensureDefaultAppIdForAccount(pool[0] || null, pool);
        if (!ids || ids.length === 0) {
            $done();
            return;
        }

        const currentIds = [...ids];
        const candidateIdsForAccept = [];
        const openAlertCache = loadJsonStore('TF_OPEN_ALERT_CACHE', {});

        for (const ID of [...currentIds]) {
            const pubInfo = await checkPublicBetaSlot(ID);
            if (pubInfo.status === 'INVALID') {
                removeInvalidAppId(ID, currentIds, pubInfo.message);
                continue;
            }
            if (pubInfo.status === 'FULL') {
                console.log(`[${PLATFORM}-TF] [Radar Tầng 1] ${pubInfo.appName} (${ID}) Đang đầy (FULL) -> Chờ lượt kế...`);
                continue;
            }
            if (pubInfo.status === 'OPEN' && pool.length === 0) {
                const lastAlert = parseInt(openAlertCache[ID] || '0', 10);
                if (isNaN(lastAlert) || Date.now() - lastAlert > 300000) {
                    openAlertCache[ID] = Date.now();
                    writeStore(JSON.stringify(openAlertCache), 'TF_OPEN_ALERT_CACHE');
                    sendNotify(
                        `🟢 CÒN SLOT TESTFLIGHT: ${pubInfo.appName}!`,
                        `Mã: ${ID} — Nhấn thông báo này để vào ngay!`,
                        `Bấm vào đây để mở thẳng trong ứng dụng TestFlight.`,
                        `itms-beta://testflight.apple.com/join/${ID}`
                    );
                }
            }
            candidateIdsForAccept.push({ id: ID, appName: pubInfo.appName });
        }

        if (pool.length === 0 || candidateIdsForAccept.length === 0) {
            $done();
            return;
        }

        const autoSwitchEnabled = readStore('TF_AUTO_SWITCH_ACCOUNT', 'true') !== 'false';
        let activeIdx = parseInt(readStore('TF_ACTIVE_ACCOUNT_IDX', '0'), 10);
        if (isNaN(activeIdx) || activeIdx < 0 || activeIdx >= pool.length) activeIdx = 0;

        const accountsToRun = autoSwitchEnabled
            ? pool.map((_, i) => pool[(activeIdx + i) % pool.length])
            : [pool[activeIdx]];

        for (const account of accountsToRun) {
            if (!account || !account.key) continue;
            writeStore(account.session_id, 'session_id');
            writeStore(account.session_digest, 'session_digest');
            writeStore(account.request_id, 'request_id');
            writeStore(account.key, 'key');
            writeStore(account.tf_ua || DEFAULT_UA, 'tf_ua');

            for (const item of candidateIdsForAccept) {
                const ID = item.id;
                if (!currentIds.includes(ID)) continue;
                if (Array.isArray(account.joinedApps) && account.joinedApps.includes(ID)) continue;
                await autoPostForAccount(ID, currentIds, account, pool, item.appName);
            }
        }

        if (autoSwitchEnabled && pool.length > 1) {
            const nextIdx = (activeIdx + 1) % pool.length;
            writeStore(String(nextIdx), 'TF_ACTIVE_ACCOUNT_IDX');
        }

        const remainingIds = currentIds.filter(id => {
            const allJoined = pool.every(acc => Array.isArray(acc.joinedApps) && acc.joinedApps.includes(id));
            if (allJoined && id === DEFAULT_CHROME_BETA_ID) {
                writeStore('true', 'TF_DEFAULT_CHROME_JOINED');
            }
            return !allJoined;
        });

        writeStore(remainingIds.join(','), 'APP_ID');

        if (remainingIds.length === 0) {
            sendNotify(
                '🎉 Hoàn tất tham gia tất cả TestFlight!',
                `Cả ${pool.length} nick Apple ID đã nhận đủ slot TestFlight.`,
                `Đã hoàn thành danh sách săn beta.`
            );
        }
        $done();
    })().catch((err) => {
        console.log(`[${PLATFORM}-TF] Lỗi ngoại lệ được bảo vệ: ${err}`);
        $done();
    });
}

function autoPostForAccount(ID, currentIds, account, pool, fallbackAppName) {
    const Key = account.key;
    const testurl = `https://testflight.apple.com/v3/accounts/${Key}/ru/`;
    const header = {
        'X-Session-Id': account.session_id,
        'X-Session-Digest': account.session_digest,
        'X-Request-Id': account.request_id,
        'User-Agent': account.tf_ua || DEFAULT_UA
    };

    return new Promise((resolve) => {
        $httpClient.get({ url: testurl + ID, headers: header, timeout: 10 }, (error, response, data) => {
            if (error) {
                resolve();
                return;
            }
            const status = response ? (response.status || response.statusCode || 0) : 0;
            if (status === 404) {
                removeInvalidAppId(ID, currentIds, `Máy chủ Apple trả về HTTP 404.`);
                resolve();
                return;
            }
            if (status !== 200) {
                resolve();
                return;
            }

            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (e) {
                resolve();
                return;
            }

            if (!jsonData || !jsonData.data || jsonData.data.status === 'FULL') {
                resolve();
                return;
            }

            $httpClient.post({ url: testurl + ID + '/accept', headers: header, timeout: 10 }, (postErr, postResp, body) => {
                const postStatus = postResp ? (postResp.status || postResp.statusCode || 0) : 0;
                if (!postErr && postStatus >= 200 && postStatus < 300) {
                    let jsonBody = null;
                    try {
                        jsonBody = body ? JSON.parse(body) : null;
                    } catch (e) {}

                    const appName = (jsonBody && jsonBody.data && jsonBody.data.name)
                        ? jsonBody.data.name
                        : (fallbackAppName || getDefaultAppName(ID));

                    if (!Array.isArray(account.joinedApps)) account.joinedApps = [];
                    if (!account.joinedApps.includes(ID)) account.joinedApps.push(ID);
                    saveAccountsPool(pool);

                    sendNotify(
                        `🎉 Đã vào TestFlight: ${appName}!`,
                        `Tài khoản: ${account.name} | Mã: ${ID}`,
                        `Nhấn vào thông báo để mở ứng dụng TestFlight!`,
                        `itms-beta://testflight.apple.com/join/${ID}`
                    );
                }
                resolve();
            });
        });
    });
}
