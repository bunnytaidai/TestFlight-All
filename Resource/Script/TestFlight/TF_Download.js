/*
 * Script: TF_Download.js
 * Tác giả: NobyDa & Hely-T (Nâng cấp version.5.0.0.0 cho Loon & Shadowrocket)
 * Tác dụng: Ghi đè storefrontId chuẩn khi bấm Cài đặt (Install) trên TestFlight để vượt lỗi "Không khả dụng tại quốc gia/khu vực" và tối ưu đường tải CDN.
 */

const STOREFRONT_MAP = {
    US: '143441-19,29',
    VN: '143471-52,29',
    SG: '143464-19,29',
    JP: '143462-9,29',
    TW: '143470-18,29',
    GB: '143444-2,29',
    KR: '143466-15,29'
};

function resolveStorefront() {
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            const region = typeof $argument === 'object'
                ? String($argument.CountryCode || $argument.Region || 'US').toUpperCase()
                : String($argument).replace(/.*(?:CountryCode|Region)=([A-Za-z]{2}).*/i, '$1').trim().toUpperCase();
            if (STOREFRONT_MAP[region]) return STOREFRONT_MAP[region];
        }
    } catch (e) {}
    return STOREFRONT_MAP.US;
}

if (typeof $request === 'undefined' || !$request || !$request.body) {
    $done({});
} else {
    try {
        const app = JSON.parse($request.body);
        if (app && typeof app === 'object') {
            app.storefrontId = resolveStorefront();
            $done({ body: JSON.stringify(app) });
        } else {
            $done({});
        }
    } catch (e) {
        $done({});
    }
}
