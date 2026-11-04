/*
 * Script: revenuecat.js (StoreKit 1 & Multi-Apple-ID RevenueCat Schema Validator - v4.6.0.0)
 * Hỗ trợ: Loon, Shadowrocket, Surge, Stash, Quantumult X
 * Nguyên lý cốt lõi (Cách A):
 * 1. Pha http-request: Xóa triệt để header X-RevenueCat-ETag, If-None-Match, If-Modified-Since để chống lỗi 304 Not Modified, ép máy chủ trả về toàn bộ JSON gốc (200 OK).
 * 2. Pha http-response: Đọc User-Agent / bundle_id, ánh xạ vào bảng cấu hình (APP_MAPPING) với gói mục tiêu com.google.chrome.ios.30tb.ai.pro.m.iog và bơm đối tượng JSON chứa entitlements + subscriptions đã kiểm duyệt chặt chẽ theo StoreKit 1 Schema.
 */

const SCHEMA_CONSTANTS = Object.freeze({
  EXPIRES_DATE: '2099-09-09T09:09:09Z',
  PURCHASE_DATE: '2023-09-09T09:09:09Z',
  ORIGINAL_PURCHASE_DATE: '2023-09-09T09:09:09Z',
  OWNERSHIP_TYPE: 'PURCHASED',
  STORE: 'app_store',
  PERIOD_TYPE: 'normal'
});

// Bảng ánh xạ (Mapping) User-Agent / Bundle ID -> Cấu hình gói cước (Giữ nguyên 100% các app cũ & bổ sung gói com.google.chrome.ios.30tb.ai.pro.m.iog)
const APP_MAPPING = {
  Chrome: {
    name: 'Google Chrome iOS AI Pro (30TB)',
    entitlements: ['pro', 'ai_pro', 'vip', 'premium'],
    product_identifier: 'com.google.chrome.ios.30tb.ai.pro.m.iog'
  },
  CriOS: {
    name: 'Google Chrome iOS AI Pro (30TB)',
    entitlements: ['pro', 'ai_pro', 'vip', 'premium'],
    product_identifier: 'com.google.chrome.ios.30tb.ai.pro.m.iog'
  },
  'com.google.chrome.ios': {
    name: 'Google Chrome iOS AI Pro (30TB)',
    entitlements: ['pro', 'ai_pro', 'vip', 'premium'],
    product_identifier: 'com.google.chrome.ios.30tb.ai.pro.m.iog'
  },
  GoodNotes: {
    name: 'GoodNotes 6',
    entitlements: ['apple_access', 'GoodNotes_6', 'pro'],
    product_identifier: 'com.goodnotes.gn6_one_time_unlock_3999'
  },
  Notability: {
    name: 'Notability',
    entitlements: ['Notability', 'pro', 'plus'],
    product_identifier: 'com.gingerlabs.Notability.premium_subscription'
  },
  CamScanner: {
    name: 'CamScanner',
    entitlements: ['CamScanner_Pro', 'pro', 'vip'],
    product_identifier: 'com.intsig.camscanner.yearly'
  },
  DEFAULT: {
    name: 'Default / Target App (Chrome AI Pro 30TB)',
    entitlements: ['pro'],
    product_identifier: 'com.google.chrome.ios.30tb.ai.pro.m.iog'
  }
};

// Danh sách quyền lợi phổ biến luôn được giữ nguyên 100% để tương thích ngược mọi ứng dụng cũ
const COMMON_ENTITLEMENTS = [
  'pro',
  'vip',
  'premium',
  'plus',
  'gold',
  'all_access',
  'unlimited',
  'apple_access',
  'GoodNotes_6',
  'Notability',
  'CamScanner_Pro'
];

function getHeaderCaseInsensitive(headers, targetKey) {
  if (!headers || typeof headers !== 'object') return '';
  const lowerTarget = targetKey.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lowerTarget) {
      return headers[k] || '';
    }
  }
  return '';
}

function stripETagHeaders(rawHeaders) {
  const headers = Object.assign({}, rawHeaders || {});
  const forbiddenKeys = ['x-revenuecat-etag', 'if-none-match', 'if-modified-since'];
  for (const key of Object.keys(headers)) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      delete headers[key];
    }
  }
  return headers;
}

function buildValidatedSubscription(existingSub = {}) {
  const payload = Object.assign({}, existingSub, {
    is_sandbox: false,
    ownership_type: SCHEMA_CONSTANTS.OWNERSHIP_TYPE,
    billing_issues_detected_at: null,
    period_type: SCHEMA_CONSTANTS.PERIOD_TYPE,
    expires_date: SCHEMA_CONSTANTS.EXPIRES_DATE,
    grace_period_expires_date: null,
    unsubscribe_detected_at: null,
    original_purchase_date: SCHEMA_CONSTANTS.ORIGINAL_PURCHASE_DATE,
    purchase_date: SCHEMA_CONSTANTS.PURCHASE_DATE,
    store: SCHEMA_CONSTANTS.STORE
  });

  // Kiểm duyệt Schema StoreKit 1 bắt buộc trước khi trả về
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (
    !iso8601Regex.test(payload.expires_date) ||
    !iso8601Regex.test(payload.purchase_date) ||
    !iso8601Regex.test(payload.original_purchase_date) ||
    payload.ownership_type !== 'PURCHASED' ||
    payload.store !== 'app_store'
  ) {
    throw new Error('StoreKit1 Subscription Schema Validation Failed');
  }
  return payload;
}

function buildValidatedEntitlement(existingEnt = {}, productId) {
  const payload = Object.assign({}, existingEnt, {
    grace_period_expires_date: null,
    purchase_date: SCHEMA_CONSTANTS.PURCHASE_DATE,
    product_identifier: productId,
    expires_date: SCHEMA_CONSTANTS.EXPIRES_DATE
  });

  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (
    !iso8601Regex.test(payload.expires_date) ||
    !iso8601Regex.test(payload.purchase_date) ||
    !payload.product_identifier ||
    typeof payload.product_identifier !== 'string'
  ) {
    throw new Error('StoreKit1 Entitlement Schema Validation Failed');
  }
  return payload;
}

function resolveAppConfig(reqHeaders) {
  const ua = getHeaderCaseInsensitive(reqHeaders, 'user-agent');
  const bundleId = getHeaderCaseInsensitive(reqHeaders, 'x-client-bundle-id');
  const combined = `${ua} ${bundleId}`.trim();

  for (const key of Object.keys(APP_MAPPING)) {
    if (key === 'DEFAULT') continue;
    if (combined.toLowerCase().includes(key.toLowerCase())) {
      return APP_MAPPING[key];
    }
  }
  return APP_MAPPING.DEFAULT;
}

if (typeof $response === 'undefined') {
  // Giai đoạn 1 (http-request): Xóa triệt để X-RevenueCat-ETag & If-None-Match chống lỗi 304 Not Modified
  const cleanedHeaders = stripETagHeaders($request && $request.headers);
  $done({ headers: cleanedHeaders });
} else {
  // Giai đoạn 2 (http-response): Ánh xạ User-Agent / Bundle ID & bơm JSON StoreKit 1 đã kiểm duyệt Schema
  let body = $response.body || '';
  try {
    let obj = JSON.parse(body);
    if (obj && obj.subscriber) {
      obj.subscriber.subscriptions = obj.subscriber.subscriptions || {};
      obj.subscriber.entitlements = obj.subscriber.entitlements || {};

      const reqHeaders = ($request && $request.headers) || {};
      const matchedConfig = resolveAppConfig(reqHeaders);
      const targetProductId = matchedConfig.product_identifier; // Mặc định: com.google.chrome.ios.30tb.ai.pro.m.iog

      // 1. Luôn bơm gói mục tiêu (com.google.chrome.ios.30tb.ai.pro.m.iog) vào subscriptions
      obj.subscriber.subscriptions[targetProductId] = buildValidatedSubscription(
        obj.subscriber.subscriptions[targetProductId]
      );

      // 2. Nâng cấp toàn bộ các gói subscriptions sẵn có trong phản hồi (nếu có) theo chuẩn Schema
      Object.keys(obj.subscriber.subscriptions).forEach((prodKey) => {
        obj.subscriber.subscriptions[prodKey] = buildValidatedSubscription(
          obj.subscriber.subscriptions[prodKey]
        );
      });

      // 3. Gộp danh sách quyền lợi mục tiêu + quyền lợi có sẵn trong response + quyền lợi phổ biến
      const existingEntKeys = Object.keys(obj.subscriber.entitlements);
      const allEntitlements = Array.from(
        new Set([
          ...matchedConfig.entitlements,
          ...existingEntKeys,
          ...COMMON_ENTITLEMENTS
        ])
      );

      allEntitlements.forEach((entKey) => {
        const cleanKey = entKey.trim();
        if (!cleanKey) return;
        obj.subscriber.entitlements[cleanKey] = buildValidatedEntitlement(
          obj.subscriber.entitlements[cleanKey],
          targetProductId
        );
      });

      body = JSON.stringify(obj);
    }
  } catch (e) {
    // Fallback regex an toàn nếu body không phải JSON tiêu chuẩn
    var re = /"expires_date":\w{4}/g;
    var re2 = /"period_type":".*?"/g;
    body = body
      .replace(re, '"expires_date":"2099-09-09T09:09:09Z"')
      .replace(re2, '"period_type":"normal"');
  }
  $done({ body });
}
