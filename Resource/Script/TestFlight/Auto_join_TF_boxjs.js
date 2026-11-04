/*
 * Script: Auto_join_TF_boxjs.js (BoxJS + Loon + Shadowrocket + Surge Multi-Account Edition)
 * Tác giả gốc: Hely-T
 * Bản nâng cấp Toàn Diện cho Loon & Shadowrocket ($loon / $rocket) - version.4.6.0.0:
 * 1. Tích hợp sẵn link mục tiêu mặc định: Google Chrome beta (https://testflight.apple.com/join/LPQmtkUs -> APP_ID: LPQmtkUs).
 * 2. Tự động bắt & lưu trữ NHIỀU tài khoản Apple ID (Multi-Account Pool: TF_ACCOUNTS & chavy_boxjs_sessions) khi mở app TestFlight hoặc đổi nick.
 * 3. Tự động xoay vòng / đổi nick Apple ID (Auto-Switch Account) để đăng ký gói beta TestFlight cho từng nick hoặc khi chạm biểu tượng Tài khoản (/v1/devices).
 */

const DEFAULT_CHROME_BETA_ID = 'LPQmtkUs'; // Tham gia Google Chrome beta - https://testflight.apple.com/join/LPQmtkUs
const DEFAULT_UA = 'TestFlight/3.5.0 (iPhone; iOS 17.7; Scale/3.00)';

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

function sendNotify(title, subtitle, message) {
    if (typeof $notification !== 'undefined' && $notification.post) {
        $notification.post(title, subtitle || '', message || '');
    } else if (typeof $notify !== 'undefined') {
        $notify(title, subtitle || '', message || '');
    }
    console.log(`[${PLATFORM}-TF] ${title} | ${subtitle || ''} | ${message || ''}`);
}

function parseArgumentAppIds() {
    if (typeof $argument === 'undefined' || !$argument) return '';
    if (typeof $argument === 'object') {
        return String($argument.APP_ID || $argument.app_id || '').trim();
    }
    const raw = String($argument).trim();
    if (raw.includes('=')) {
        const pairs = Object.fromEntries(
            raw.split('&').map(part => {
                const idx = part.indexOf('=');
                if (idx === -1) return [part.trim(), ''];
                return [part.slice(0, idx).trim(), part.slice(idx + 1).replace(/^"|"$/g, '').trim()];
            })
        );
        if (pairs.APP_ID !== undefined) return pairs.APP_ID;
    }
    return raw.replace(/^APP_ID=/i, '').trim();
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
    writeStore(tf_ua, 'tf_ua');

    const pool = loadAccountsPool();
    let idx = pool.findIndex(acc => acc && acc.key === key);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (idx === -1) {
        const newAcc = {
            key,
            name: `Nick Apple ID #${pool.length + 1} (${key.slice(0, 6)})`,
            session_id,
            session_digest,
            request_id,
            tf_ua,
            joinedApps: [],
            updatedAt: nowStr
        };
        pool.push(newAcc);
        idx = pool.length - 1;
    } else {
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
    return { account: pool[idx], index: idx, total: pool.length };
}

function switchNextAppleIdAccount(notifyUser = true) {
    const pool = loadAccountsPool();
    if (pool.length === 0) {
        const fallbackKey = readStore('key');
        if (fallbackKey) {
            upsertAccountToken({
                key: fallbackKey,
                session_id: readStore('session_id'),
                session_digest: readStore('session_digest'),
                request_id: readStore('request_id'),
                tf_ua: readStore('tf_ua', DEFAULT_UA)
            });
        }
        return null;
    }

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
            `Đang kích hoạt săn gói TestFlight (${readStore('APP_ID', DEFAULT_CHROME_BETA_ID)})`
        );
    }
    return { account: nextAcc, index: nextIdx, total: pool.length };
}

function ensureDefaultAppIdForAccount(accountObj) {
    let existing = readStore('APP_ID', '');
    let argIds = parseArgumentAppIds();
    let list = existing
        ? existing.split(',').map(i => i.trim()).filter(Boolean)
        : [];

    if (argIds) {
        argIds.split(',').map(i => i.trim()).filter(Boolean).forEach(id => {
            if (!list.includes(id)) list.push(id);
        });
    }

    const joinedDone = readStore('TF_DEFAULT_CHROME_JOINED', 'false') === 'true';
    const accJoinedChrome = accountObj && Array.isArray(accountObj.joinedApps) && accountObj.joinedApps.includes(DEFAULT_CHROME_BETA_ID);

    if (list.length === 0 && !joinedDone && !accJoinedChrome) {
        list.push(DEFAULT_CHROME_BETA_ID);
    }

    const finalStr = Array.from(new Set(list)).join(',');
    if (finalStr !== existing) {
        writeStore(finalStr, 'APP_ID');
    }
    return Array.from(new Set(list));
}

if (typeof $request !== 'undefined' && $request && $request.url) {
    let url = $request.url;
    let keyPattern = /^https?:\/\/testflight\.apple\.com\/v3\/accounts\/(.*?)\/apps/;
    let key = url.match(keyPattern) ? url.match(keyPattern)[1] : null;

    const addAppIdHandler = (appIdMatch) => {
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1].trim();
            let existingAppIds = readStore('APP_ID', '');
            let appIdSet = new Set(existingAppIds ? existingAppIds.split(',').map(i => i.trim()).filter(Boolean) : []);
            if (!appIdSet.has(DEFAULT_CHROME_BETA_ID) && readStore('TF_DEFAULT_CHROME_JOINED', 'false') !== 'true') {
                appIdSet.add(DEFAULT_CHROME_BETA_ID);
            }
            if (!appIdSet.has(appId)) {
                appIdSet.add(appId);
                writeStore(Array.from(appIdSet).join(','), 'APP_ID');
                sendNotify(
                    '✈️ Đã thêm Link TestFlight',
                    `Mã APP_ID: ${appId}`,
                    `Danh sách đang săn: ${Array.from(appIdSet).join(',')}`
                );
            } else {
                sendNotify(
                    'ℹ️ APP_ID đã có trong danh sách săn',
                    `Mã APP_ID: ${appId}`,
                    `Danh sách hiện tại: ${Array.from(appIdSet).join(',')}`
                );
            }
        }
    };

    if (/^https?:\/\/testflight\.apple\.com\/v1\/devices$/.test(url)) {
        const switched = switchNextAppleIdAccount(true);
        if (!switched) {
            console.log(`[${PLATFORM}-TF] Chạm nút thiết bị/tài khoản (Hiện có 1 nick Apple ID).`);
        }
    } else if (/^https?:\/\/testflight\.apple\.com\/v3\/accounts\/.*\/apps/.test(url) && key) {
        let headers = Object.fromEntries(
            Object.entries($request.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
        );
        let session_id = headers['x-session-id'];
        let session_digest = headers['x-session-digest'];
        let request_id = headers['x-request-id'];
        let tf_ua = headers['user-agent'] || DEFAULT_UA;

        const saved = upsertAccountToken({ key, session_id, session_digest, request_id, tf_ua });
        const activeIds = ensureDefaultAppIdForAccount(saved ? saved.account : null);

        if (saved) {
            sendNotify(
                `🎉 Đã lưu Token ${saved.account.name}`,
                `Tổng số nick Apple ID đã lưu: ${saved.total}`,
                `Đang tự động săn TestFlight: ${activeIds.join(',')} (Google Chrome beta)`
            );
        }
    } else if (/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/.test(url)) {
        const appIdMatch = url.match(/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/);
        addAppIdHandler(appIdMatch);
    } else if (/v3\/accounts\/.*\/ru\/([A-Za-z0-9]+)/.test(url)) {
        const appIdMatch = url.match(/v3\/accounts\/.*\/ru\/([A-Za-z0-9]+)/);
        addAppIdHandler(appIdMatch);
    }

    $done({});
} else {
    !(async () => {
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

        let ids = ensureDefaultAppIdForAccount(pool[0] || null);
        if (!ids || ids.length === 0) {
            console.log(`[${PLATFORM}-TF] Danh sách APP_ID trống. Đã hoàn tất săn tất cả TestFlight.`);
            $done();
            return;
        }

        if (pool.length === 0) {
            console.log(`[${PLATFORM}-TF] Đang chờ lấy Token Apple ID (Mục tiêu sẵn sàng: ${ids.join(',')}). Hãy mở app TestFlight 1 lần khi bật VPN.`);
            $done();
            return;
        }

        const autoSwitchEnabled = readStore('TF_AUTO_SWITCH_ACCOUNT', 'true') !== 'false';
        let activeIdx = parseInt(readStore('TF_ACTIVE_ACCOUNT_IDX', '0'), 10);
        if (isNaN(activeIdx) || activeIdx < 0 || activeIdx >= pool.length) activeIdx = 0;

        const accountsToRun = autoSwitchEnabled
            ? pool.map((_, i) => pool[(activeIdx + i) % pool.length])
            : [pool[activeIdx]];

        let currentIds = [...ids];
        for (const account of accountsToRun) {
            if (!account || !account.key) continue;
            writeStore(account.session_id, 'session_id');
            writeStore(account.session_digest, 'session_digest');
            writeStore(account.request_id, 'request_id');
            writeStore(account.key, 'key');
            writeStore(account.tf_ua || DEFAULT_UA, 'tf_ua');

            for (const ID of [...currentIds]) {
                if (Array.isArray(account.joinedApps) && account.joinedApps.includes(ID)) {
                    continue;
                }
                await autoPostForAccount(ID, currentIds, account, pool);
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
                `Bao gồm Google Chrome beta (${DEFAULT_CHROME_BETA_ID})`
            );
            if (typeof $httpAPI === 'function') {
                $done($httpAPI('POST', '/v1/modules', { 'Giám sát beta công khai': false, 'Giám sát công khai': false }));
                return;
            }
        }
        $done();
    })();
}

function autoPostForAccount(ID, currentIds, account, pool) {
    let Key = account.key;
    let testurl = `https://testflight.apple.com/v3/accounts/${Key}/ru/`;
    let header = {
        'X-Session-Id': account.session_id,
        'X-Session-Digest': account.session_digest,
        'X-Request-Id': account.request_id,
        'User-Agent': account.tf_ua || DEFAULT_UA
    };

    return new Promise((resolve) => {
        $httpClient.get({ url: testurl + ID, headers: header }, (error, response, data) => {
            if (error) {
                console.log(`[${PLATFORM}-TF] [${account.name}] ${ID} Lỗi mạng: ${error} (Giữ lại APP_ID)`);
                resolve();
                return;
            }

            const status = response ? (response.status || response.statusCode) : 0;
            if (status === 500 || status === 502 || status === 503 || status === 429) {
                console.log(`[${PLATFORM}-TF] [${account.name}] ${ID} Máy chủ Apple bận (HTTP ${status}) -> Chờ lượt sau`);
                resolve();
                return;
            }

            if (status === 401 || status === 403) {
                console.log(`[${PLATFORM}-TF] [${account.name}] Phiên đăng nhập hết hạn (HTTP ${status}) -> Tự động chuyển sang nick Apple ID tiếp theo`);
                resolve();
                return;
            }

            if (status === 404 || status !== 200) {
                console.log(`[${PLATFORM}-TF] [${account.name}] ${ID} Liên kết không hợp lệ (HTTP ${status}) -> Loại bỏ APP_ID`);
                const idx = currentIds.indexOf(ID);
                if (idx !== -1) currentIds.splice(idx, 1);
                if (ID === DEFAULT_CHROME_BETA_ID) writeStore('true', 'TF_DEFAULT_CHROME_JOINED');
                writeStore(currentIds.join(','), 'APP_ID');
                sendNotify('⚠️ Liên kết TestFlight không tồn tại', `Mã APP_ID: ${ID} (HTTP ${status})`, 'Đã tự động xóa khỏi danh sách chờ');
                resolve();
                return;
            }

            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (parseError) {
                console.log(`[${PLATFORM}-TF] [${account.name}] ${ID} Lỗi giải mã JSON: ${parseError}`);
                resolve();
                return;
            }

            if (!jsonData || !jsonData.data) {
                const msg = (jsonData && Array.isArray(jsonData.messages) && jsonData.messages[0])
                    ? jsonData.messages[0].message
                    : 'Chưa thể chấp nhận lời mời';
                console.log(`[${PLATFORM}-TF] [${account.name}] ${ID}: ${msg}`);
                resolve();
                return;
            }

            if (jsonData.data.status === 'FULL') {
                const appName = (jsonData.data.app && jsonData.data.app.name) ? jsonData.data.app.name : (ID === DEFAULT_CHROME_BETA_ID ? 'Google Chrome beta' : ID);
                console.log(`[${PLATFORM}-TF] [${account.name}] ${appName} (${ID}) Đang đầy (FULL) -> Tiếp tục canh slot...`);
                resolve();
                return;
            }

            $httpClient.post({ url: testurl + ID + '/accept', headers: header }, (postErr, postResp, body) => {
                const postStatus = postResp ? (postResp.status || postResp.statusCode) : 0;
                if (!postErr && postStatus === 200) {
                    let jsonBody;
                    try {
                        jsonBody = JSON.parse(body);
                    } catch (parseError) {
                        console.log(`[${PLATFORM}-TF] [${account.name}] ${ID} Phản hồi Accept lỗi JSON: ${parseError}`);
                        resolve();
                        return;
                    }

                    const appName = (jsonBody && jsonBody.data && jsonBody.data.name)
                        ? jsonBody.data.name
                        : (ID === DEFAULT_CHROME_BETA_ID ? 'Google Chrome beta' : ID);

                    if (!Array.isArray(account.joinedApps)) account.joinedApps = [];
                    if (!account.joinedApps.includes(ID)) account.joinedApps.push(ID);
                    saveAccountsPool(pool);

                    console.log(`[${PLATFORM}-TF] 🎉 [${account.name}] Đã tham gia thành công: ${appName} (${ID})`);
                    sendNotify(
                        `🎉 Tham gia thành công: ${appName}`,
                        `Tài khoản: ${account.name} | Mã: ${ID}`,
                        pool.length > 1
                            ? `Tự động chuyển sang nick Apple ID tiếp theo để đăng ký gói!`
                            : `Đã nhận thành công gói beta TestFlight!`
                    );
                } else {
                    console.log(`[${PLATFORM}-TF] [${account.name}] ${ID} Chưa thể Accept: ${postErr || `HTTP ${postStatus}`}`);
                }
                resolve();
            });
        });
    });
}
