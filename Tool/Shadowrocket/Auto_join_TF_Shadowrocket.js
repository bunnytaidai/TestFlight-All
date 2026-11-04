/*
 * Script: Auto_join_TF_Shadowrocket.js
 * Tác giả gốc: DecoAri & Hely-T
 * Bản tối ưu cho Shadowrocket ($rocket):
 * 1. Tự động bắt Token (key, session_id, session_digest, request_id, tf_ua) khi mở app TestFlight.
 * 2. Tự động bắt và gom APP_ID khi nhấn vào bất kỳ link https://testflight.apple.com/join/XXXX nào.
 * 3. Hỗ trợ đọc APP_ID từ cả 3 nguồn: Link vừa nhấn, BoxJS (http://boxjs.com), hoặc tham số argument trong Module Shadowrocket.
 * 4. Tương thích 100% với Shadowrocket (loại bỏ lỗi crash $httpAPI độc quyền của Surge).
 */

if (typeof $request !== 'undefined' && $request && $request.url) {
    let url = $request.url;

    let keyPattern = /^https?:\/\/testflight\.apple\.com\/v3\/accounts\/(.*?)\/apps/;
    let key = url.match(keyPattern) ? url.match(keyPattern)[1] : null;

    const handler = (appIdMatch) => {
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1];
            let existingAppIds = $persistentStore.read('APP_ID');
            let appIdSet = new Set(existingAppIds ? existingAppIds.split(',').map(i => i.trim()).filter(Boolean) : []);
            if (!appIdSet.has(appId)) {
                appIdSet.add(appId);
                $persistentStore.write(Array.from(appIdSet).join(','), 'APP_ID');
                $notification.post(
                    '✈️ Đã thêm Link TestFlight',
                    `Mã APP_ID: ${appId}`,
                    `Danh sách đang chờ: ${Array.from(appIdSet).join(',')}`
                );
                console.log(`[Shadowrocket-TF] Đã chụp và lưu trữ APP_ID: ${appId}`);
            } else {
                $notification.post(
                    'ℹ️ APP_ID đã có trong danh sách',
                    `Mã APP_ID: ${appId}`,
                    `Danh sách hiện tại: ${Array.from(appIdSet).join(',')}`
                );
                console.log(`[Shadowrocket-TF] APP_ID: ${appId} đã tồn tại, không cần thêm lại.`);
            }
        }
    };

    if (/^https?:\/\/testflight\.apple\.com\/v3\/accounts\/.*\/apps/.test(url) && key) {
        let headers = Object.fromEntries(
            Object.entries($request.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
        );
        let session_id = headers['x-session-id'];
        let session_digest = headers['x-session-digest'];
        let request_id = headers['x-request-id'];
        let ua = headers['user-agent'] || 'TestFlight/3.5.0 (iPhone; iOS 17.4; Scale/3.00)';

        $persistentStore.write(session_id, 'session_id');
        $persistentStore.write(session_digest, 'session_digest');
        $persistentStore.write(request_id, 'request_id');
        $persistentStore.write(key, 'key');
        $persistentStore.write(ua, 'tf_ua');

        let existingAppIds = $persistentStore.read('APP_ID');
        if (!existingAppIds) {
            $notification.post(
                '🎉 Lấy Token TestFlight thành công!',
                'Shadowrocket đã lưu phiên đăng nhập TestFlight',
                'Giờ bạn chỉ cần bấm vào bất kỳ link TestFlight nào hoặc nhập APP_ID trong BoxJS để tự động tham gia!'
            );
        } else {
            $notification.post(
                '✅ Đã cập nhật Token TestFlight',
                `Đang theo dõi APP_ID: ${existingAppIds}`,
                'Shadowrocket đang tự động săn slot ngầm cho bạn.'
            );
        }
        console.log(`[Shadowrocket-TF] Thu thập Token thành công: key=${key}, request_id=${request_id}`);
    } else if (/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/.test(url)) {
        const appIdMatch = url.match(/^https?:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/);
        handler(appIdMatch);
    } else if (/v3\/accounts\/.*\/ru\/([A-Za-z0-9]+)$/.test(url)) {
        const appIdMatch = url.match(/v3\/accounts\/.*\/ru\/([A-Za-z0-9]+)$/);
        handler(appIdMatch);
    }

    $done({});
} else {
    !(async () => {
        let ids = $persistentStore.read('APP_ID');
        if (!ids && typeof $argument !== 'undefined' && $argument) {
            let argIds = String($argument).replace(/^APP_ID=/i, '').trim();
            if (argIds) {
                ids = argIds;
                $persistentStore.write(ids, 'APP_ID');
            }
        }

        if (!ids) {
            console.log('[Shadowrocket-TF] Chưa có APP_ID nào trong danh sách theo dõi.');
            $done();
            return;
        }

        let Key = $persistentStore.read('key');
        if (!Key) {
            console.log('[Shadowrocket-TF] Chưa có Token TestFlight. Vui lòng mở ứng dụng TestFlight 1 lần khi đang bật VPN Shadowrocket.');
            $done();
            return;
        }

        ids = ids.split(',').map(i => i.trim()).filter(Boolean);
        let currentIds = [...ids];
        for await (const ID of ids) {
            await autoPost(ID, currentIds);
        }

        if (currentIds.length === 0) {
            $notification.post(
                '🎉 Đã tham gia tất cả TestFlight!',
                'Toàn bộ APP_ID trong danh sách đã được nhận slot thành công.',
                ''
            );
            if (typeof $httpAPI === 'function') {
                $done($httpAPI('POST', '/v1/modules', { 'Giám sát beta công khai': false }));
            } else {
                $done();
            }
        } else {
            $done();
        }
    })();
}

async function autoPost(ID, ids) {
    let Key = $persistentStore.read('key');
    let testurl = `https://testflight.apple.com/v3/accounts/${Key}/ru/`;
    let header = {
        'X-Session-Id': $persistentStore.read('session_id'),
        'X-Session-Digest': $persistentStore.read('session_digest'),
        'X-Request-Id': $persistentStore.read('request_id'),
        'User-Agent': $persistentStore.read('tf_ua') || 'TestFlight/3.5.0 (iPhone; iOS 17.4; Scale/3.00)'
    };

    return new Promise((resolve) => {
        $httpClient.get({ url: testurl + ID, headers: header }, (error, response, data) => {
            if (error) {
                console.log(`[Shadowrocket-TF] ${ID} Yêu cầu mạng thất bại: ${error} (Giữ lại APP_ID)`);
                resolve();
                return;
            }

            if (response.status === 500) {
                console.log(`[Shadowrocket-TF] ${ID} Lỗi máy chủ 500 (Giữ lại APP_ID)`);
                resolve();
                return;
            }

            if (response.status !== 200) {
                console.log(`[Shadowrocket-TF] ${ID} Liên kết không hợp lệ (HTTP ${response.status}) -> Xóa APP_ID`);
                const idx = ids.indexOf(ID);
                if (idx !== -1) ids.splice(idx, 1);
                $persistentStore.write(ids.join(','), 'APP_ID');
                $notification.post('⚠️ Liên kết TestFlight không hợp lệ', `Mã APP_ID: ${ID} đã bị xóa khỏi danh sách`, '');
                resolve();
                return;
            }

            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (parseError) {
                console.log(`[Shadowrocket-TF] ${ID} Lỗi phân tích JSON: ${parseError} (Giữ lại APP_ID)`);
                resolve();
                return;
            }

            if (!jsonData || !jsonData.data) {
                console.log(`[Shadowrocket-TF] ${ID} Chưa thể chấp nhận lời mời (Giữ lại APP_ID)`);
                resolve();
                return;
            }

            if (jsonData.data.status === 'FULL') {
                const appName = (jsonData.data.app && jsonData.data.app.name) ? jsonData.data.app.name : ID;
                console.log(`[Shadowrocket-TF] ${appName} (${ID}) Đang đầy (FULL) -> Tiếp tục chờ slot...`);
                resolve();
                return;
            }

            $httpClient.post({ url: testurl + ID + '/accept', headers: header }, (error, response, body) => {
                if (!error && response.status === 200) {
                    let jsonBody;
                    try {
                        jsonBody = JSON.parse(body);
                    } catch (parseError) {
                        console.log(`[Shadowrocket-TF] ${ID} Phản hồi accept không hợp lệ: ${parseError}`);
                        resolve();
                        return;
                    }

                    const appName = (jsonBody.data && jsonBody.data.name) ? jsonBody.data.name : ID;
                    console.log(`[Shadowrocket-TF] 🎉 ${appName} (${ID}) Đã tham gia TestFlight thành công!`);
                    const idx = ids.indexOf(ID);
                    if (idx !== -1) ids.splice(idx, 1);
                    $persistentStore.write(ids.join(','), 'APP_ID');

                    if (ids.length > 0) {
                        $notification.post(
                            `🎉 Đã tham gia: ${appName}`,
                            `Mã: ${ID} thành công!`,
                            `Đang tiếp tục săn: ${ids.join(',')}`
                        );
                    } else {
                        $notification.post(
                            `🎉 Đã tham gia: ${appName}`,
                            `Mã: ${ID} thành công!`,
                            'Đã hoàn tất toàn bộ danh sách APP_ID!'
                        );
                    }
                } else {
                    console.log(`[Shadowrocket-TF] ${ID} Không thể tham gia: ${error || `HTTP ${response.status}`} (Giữ lại APP_ID)`);
                }
                resolve();
            });
        });
    });
}
