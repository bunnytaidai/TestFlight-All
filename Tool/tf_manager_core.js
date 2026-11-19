/**
 * Tên tệp: tf_manager_core.js
 * Tương thích: Loon & Shadowrocket (iOS 15.8.8 Rootless + SSL Kill Switch 3)
 * Chức năng:
 *   1. Bắt và lưu đa tài khoản Apple ID (Session Pool) không ghi đè.
 *   2. Đảo nick theo vòng tròn (Round-Robin) tự động tham gia 5 link TestFlight.
 *   3. Kiểm tra các mục đăng ký đã mua (StoreKit 1 & StoreKit 2 JWS) và lọc gói cố định cần gia hạn.
 */

'use strict';

// ================= CẤU HÌNH MẶC ĐỊNH (DÀNH CHO SHADOWROCKET HOẶC KHI CHƯA NHẬP ARGUMENT) =================
const DEFAULT_CONFIG = {
  // Danh sách cố định 5 mã TestFlight từ yêu cầu của Thỏ
  tfCodes: [
    "LPQmtkUs",
    "Xh9VNQoA",
    "2mcx1R3I",
    "YSo8aVCS",
    "CzpZHGuS"
  ],
  // Nhập mã Product ID gói đăng ký cần giữ gia hạn (cách nhau dấu phẩy), hoặc để "*" để chọn tất cả gói đã mua
  targetRenewProducts: "*",
  // false = Hễ 1 nick chiếm được slot mã nào thì dừng mã đó; true = Ép tất cả các nick đã lưu cùng vào cả 5 mã
  joinAllAccounts: false,
  // Bật thông báo chi tiết khi phát hiện lưu nick hoặc gói sắp hết hạn
  verboseNotify: true
};

// Khóa lưu trữ bền vững trong bộ nhớ Loon / Shadowrocket
const STORAGE_KEYS = {
  ACCOUNTS: "rabbit_tf_accounts_pool_v1",
  JOINED_MAP: "rabbit_tf_joined_map_v1",
  ROTATION_IDX: "rabbit_tf_rotation_idx_v1",
  SUBSCRIPTIONS: "rabbit_tf_subs_db_v1",
  LAST_ALERT_TS: "rabbit_tf_renew_alert_ts_v1"
};

// ================= BỘ TƯƠNG THÍCH ĐA NỀN TẢNG (LOON & SHADOWROCKET) =================
const Env = (() => {
  const isLoon = typeof $loon !== "undefined";
  const isSurgeOrSR = typeof $httpClient !== "undefined" && !isLoon;

  function read(key) {
    if (typeof $persistentStore !== "undefined") {
      return $persistentStore.read(key);
    }
    return null;
  }

  function write(key, val) {
    if (typeof $persistentStore !== "undefined") {
      return $persistentStore.write(String(val), key);
    }
    return false;
  }

  function readJSON(key, fallback) {
    try {
      const raw = read(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, obj) {
    return write(key, JSON.stringify(obj));
  }

  function notify(title, subtitle, body, openUrl) {
    if (typeof $notification === "undefined") return;
    if (openUrl) {
      if (isLoon) {
        $notification.post(title, subtitle, body, { openUrl: openUrl });
      } else {
        $notification.post(title, subtitle, body, openUrl);
      }
    } else {
      $notification.post(title, subtitle, body);
    }
  }

  function httpRequest(method, options) {
    return new Promise((resolve) => {
      const fn = method.toLowerCase() === "post" ? $httpClient.post : $httpClient.get;
      fn(options, (err, resp, data) => {
        resolve({
          error: err,
          status: resp ? (resp.status || resp.statusCode || 0) : 0,
          headers: resp ? resp.headers : {},
          body: data || ""
        });
      });
    });
  }

  function getRuntimeConfig() {
    const cfg = {
      tfCodes: DEFAULT_CONFIG.tfCodes.slice(),
      targetRenewProducts: DEFAULT_CONFIG.targetRenewProducts,
      joinAllAccounts: DEFAULT_CONFIG.joinAllAccounts
    };

    if (typeof $argument !== "undefined" && $argument) {
      let argObj = {};
      if (typeof $argument === "object") {
        argObj = $argument;
      } else if (typeof $argument === "string") {
        // Hỗ trợ cả chuỗi query key=val&key2=val2
        $argument.split("&").forEach((pair) => {
          const idx = pair.indexOf("=");
          if (idx > 0) {
            const k = decodeURIComponent(pair.slice(0, idx).trim());
            const v = decodeURIComponent(pair.slice(idx + 1).trim());
            argObj[k] = v;
          }
        });
      }

      if (argObj.TF_CODES && String(argObj.TF_CODES).trim().length > 0) {
        cfg.tfCodes = String(argObj.TF_CODES)
          .split(",")
          .map((s) => s.trim().replace(/^https?:\/\/testflight\.apple\.com\/join\//i, ""))
          .filter(Boolean);
      }
      if (argObj.TARGET_PRODUCTS && String(argObj.TARGET_PRODUCTS).trim().length > 0) {
        cfg.targetRenewProducts = String(argObj.TARGET_PRODUCTS).trim();
      }
      if (typeof argObj.JOIN_ALL !== "undefined") {
        cfg.joinAllAccounts = String(argObj.JOIN_ALL) === "true" || argObj.JOIN_ALL === true;
      }
    }
    return cfg;
  }

  function done(val) {
    if (typeof $done !== "undefined") {
      $done(val || {});
    }
  }

  return { isLoon, isSurgeOrSR, read, write, readJSON, writeJSON, notify, httpRequest, getRuntimeConfig, done };
})();

// ================= HÀM TIỆN ÍCH CHUẨN HÓA & GIẢI MÃ JWS =================
function getHeaderCaseInsensitive(headers, targetKey) {
  if (!headers) return "";
  const lower = targetKey.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return "";
}

function generateUUIDv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Giải mã Base64URL thuần JavaScript (an toàn 100% trên JavaScriptCore iOS 15.8.8 không cần atob)
function decodeBase64UrlToUtf8(input) {
  try {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let str = String(input).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4 !== 0) str += "=";

    const bytes = [];
    for (let i = 0; i < str.length; i += 4) {
      const c1 = chars.indexOf(str.charAt(i));
      const c2 = chars.indexOf(str.charAt(i + 1));
      const c3 = str.charAt(i + 2) === "=" ? 64 : chars.indexOf(str.charAt(i + 2));
      const c4 = str.charAt(i + 3) === "=" ? 64 : chars.indexOf(str.charAt(i + 3));
      if (c1 < 0 || c2 < 0) break;

      bytes.push((c1 << 2) | (c2 >> 4));
      if (c3 !== 64 && c3 >= 0) bytes.push(((c2 & 15) << 4) | (c3 >> 2));
      if (c4 !== 64 && c4 >= 0) bytes.push(((c3 & 3) << 6) | c4);
    }

    let encoded = "";
    for (let j = 0; j < bytes.length; j++) {
      encoded += "%" + ("00" + bytes[j].toString(16)).slice(-2);
    }
    return decodeURIComponent(encoded);
  } catch (e) {
    return null;
  }
}

function isTargetProduct(productId, targetSpec) {
  if (!productId) return false;
  if (!targetSpec || targetSpec === "*") return true;
  const list = targetSpec.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.indexOf(String(productId).toLowerCase()) !== -1;
}

// ================= 1. LUỒNG BẮT VÀ LƯU CẤU HÌNH ĐA NICK APPLE ID =================
function handleCaptureAppleIdSession() {
  const url = $request.url || "";
  const match = url.match(/\/v[23]\/accounts\/([0-9a-fA-F-]+)\/apps/i);
  if (!match) {
    return Env.done({});
  }

  const accountId = match[1];
  const reqHeaders = $request.headers || {};
  const sessionId = getHeaderCaseInsensitive(reqHeaders, "x-session-id");
  const sessionDigest = getHeaderCaseInsensitive(reqHeaders, "x-session-digest");

  if (!sessionId || !sessionDigest) {
    console.log("[TF-Capture] Thiếu X-Session-Id hoặc X-Session-Digest, bỏ qua.");
    return Env.done({});
  }

  const cleanHeaders = {
    "X-Session-Id": sessionId,
    "X-Session-Digest": sessionDigest,
    "User-Agent": getHeaderCaseInsensitive(reqHeaders, "user-agent") || "Oasis/3.5.1 OasisBuild/430.2 iOS/15.8.8 model/iPhone8,1",
    "X-Apple-Store-Front": getHeaderCaseInsensitive(reqHeaders, "x-apple-store-front") || "143494-42,29",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  const amd = getHeaderCaseInsensitive(reqHeaders, "x-apple-i-md");
  const amdm = getHeaderCaseInsensitive(reqHeaders, "x-apple-i-md-m");
  const cookie = getHeaderCaseInsensitive(reqHeaders, "cookie");
  const dsid = getHeaderCaseInsensitive(reqHeaders, "x-dsid");

  if (amd) cleanHeaders["X-Apple-I-MD"] = amd;
  if (amdm) cleanHeaders["X-Apple-I-MD-M"] = amdm;
  if (cookie) cleanHeaders["Cookie"] = cookie;
  if (dsid) cleanHeaders["X-Dsid"] = dsid;

  const pool = Env.readJSON(STORAGE_KEYS.ACCOUNTS, []);
  const existingIdx = pool.findIndex((item) => item.accountId === accountId);
  const shortId = accountId.slice(0, 8);
  const record = {
    accountId: accountId,
    shortId: shortId,
    headers: cleanHeaders,
    updatedAt: Date.now()
  };

  if (existingIdx >= 0) {
    pool[existingIdx] = record;
    Env.writeJSON(STORAGE_KEYS.ACCOUNTS, pool);
    console.log(`[TF-Capture] Đã làm mới phiên cho nick ${shortId}. Tổng số nick: ${pool.length}`);
  } else {
    pool.push(record);
    Env.writeJSON(STORAGE_KEYS.ACCOUNTS, pool);
    Env.notify(
      "Đã lưu Apple ID TestFlight mới",
      `Mã nick: ${shortId} (Tổng kho: ${pool.length} nick)`,
      "Hệ thống sẽ tự động đưa nick này vào vòng quay săn 5 link TestFlight."
    );
  }

  return Env.done({});
}

// ================= 2. LUỒNG BẮT & KIỂM TRA CÁC GÓI ĐĂNG KÝ ĐÃ MUA TESTFLIGHT =================
function handleInspectTestFlightSubscriptions() {
  const bodyStr = $response && $response.body ? $response.body : "";
  if (!bodyStr) return Env.done({});

  const cfg = Env.getRuntimeConfig();
  const subsDb = Env.readJSON(STORAGE_KEYS.SUBSCRIPTIONS, {});
  let updatedCount = 0;

  try {
    const data = JSON.parse(bodyStr);

    // Nhánh A: Cấu trúc biên lai StoreKit 1 (verifyReceipt - Sandbox / Status 21007)
    if (Array.isArray(data.latest_receipt_info)) {
      const renewalMap = {};
      if (Array.isArray(data.pending_renewal_info)) {
        data.pending_renewal_info.forEach((r) => {
          if (r.product_id) renewalMap[r.product_id] = String(r.auto_renew_status || "0");
        });
      }

      data.latest_receipt_info.forEach((item) => {
        const pid = item.product_id;
        if (!pid) return;
        const expMs = Number(item.expires_date_ms || 0);
        const prev = subsDb[pid];
        if (!prev || expMs >= prev.expiresMs) {
          subsDb[pid] = {
            productId: pid,
            originalTxId: item.original_transaction_id || "",
            expiresMs: expMs,
            autoRenewStatus: renewalMap[pid] || "0",
            environment: data.environment || "Sandbox",
            source: "StoreKit1",
            selectedForAutoRenew: isTargetProduct(pid, cfg.targetRenewProducts),
            updatedAt: Date.now()
          };
          updatedCount++;
        }
      });
    }

    // Nhánh B: Quét chữ ký JWS ES256 của StoreKit 2 (signedTransactionInfo / signedRenewalInfo)
    const jwsRegex = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
    const matches = bodyStr.match(jwsRegex) || [];
    const jwsRenewMap = {};
    const jwsTxList = [];

    matches.forEach((token) => {
      const parts = token.split(".");
      if (parts.length !== 3) return;
      const decodedStr = decodeBase64UrlToUtf8(parts[1]);
      if (!decodedStr) return;
      try {
        const payload = JSON.parse(decodedStr);
        if (typeof payload.autoRenewStatus !== "undefined" && payload.productId) {
          jwsRenewMap[payload.productId] = String(payload.autoRenewStatus);
        } else if (payload.productId && (payload.expiresDate || payload.purchaseDate)) {
          jwsTxList.push(payload);
        }
      } catch (_) {}
    });

    jwsTxList.forEach((tx) => {
      const pid = tx.productId;
      const expMs = Number(tx.expiresDate || 0);
      subsDb[pid] = {
        productId: pid,
        originalTxId: String(tx.originalTransactionId || ""),
        expiresMs: expMs,
        autoRenewStatus: jwsRenewMap[pid] || "1",
        environment: tx.environment || "Sandbox",
        source: "StoreKit2-JWS",
        selectedForAutoRenew: isTargetProduct(pid, cfg.targetRenewProducts),
        updatedAt: Date.now()
      };
      updatedCount++;
    });

    if (updatedCount > 0) {
      Env.writeJSON(STORAGE_KEYS.SUBSCRIPTIONS, subsDb);
      const selectedList = Object.values(subsDb).filter((s) => s.selectedForAutoRenew);
      console.log(`[TF-Subs] Đã cập nhật ${updatedCount} mục đăng ký. Số gói cố định đang theo dõi: ${selectedList.length}`);

      if (selectedList.length > 0 && DEFAULT_CONFIG.verboseNotify) {
        const summary = selectedList
          .map((s) => `${s.productId} (Tự gia hạn: ${s.autoRenewStatus === "1" ? "BẬT" : "TẮT"})`)
          .join("\n");
        Env.notify(
          "Đã kiểm tra Gói Đăng ký TestFlight",
          `Đang ghim ${selectedList.length} gói cố định cần giữ gia hạn`,
          summary
        );
      }
    }
  } catch (err) {
    console.log("[TF-Subs] Gói tin không phải JSON biên lai chuẩn: " + err.message);
  }

  return Env.done({});
}

// ================= 3. LUỒNG CRON: TỰ ĐẢO NICK SĂN 5 LINK & KIỂM TRA GIA HẠN =================
async function handleCronRotationAndRenew() {
  const cfg = Env.getRuntimeConfig();
  const accounts = Env.readJSON(STORAGE_KEYS.ACCOUNTS, []);

  if (accounts.length === 0) {
    console.log("[TF-Cron] Kho Apple ID đang trống. Hãy mở ứng dụng TestFlight làm mới 1 lần.");
  } else {
    // 3A. Đảo nick Apple ID theo cơ chế xoay vòng tròn (Round-Robin)
    let rotIdx = Number(Env.read(STORAGE_KEYS.ROTATION_IDX) || 0);
    if (isNaN(rotIdx) || rotIdx < 0) rotIdx = 0;

    const activeAccount = accounts[rotIdx % accounts.length];
    Env.write(STORAGE_KEYS.ROTATION_IDX, String((rotIdx + 1) % accounts.length));

    const joinedMap = Env.readJSON(STORAGE_KEYS.JOINED_MAP, {});
    const pendingCodes = cfg.tfCodes.filter((code) => {
      const joinedAccounts = joinedMap[code] || [];
      if (cfg.joinAllAccounts) {
        return joinedAccounts.indexOf(activeAccount.accountId) === -1;
      }
      return joinedAccounts.length === 0;
    });

    console.log(`[TF-Cron] Đang dùng nick ${activeAccount.shortId} (${(rotIdx % accounts.length) + 1}/${accounts.length}) quét ${pendingCodes.length} mã TestFlight.`);

    for (const appCode of pendingCodes) {
      const acceptUrl = `https://testflight.apple.com/v3/accounts/${activeAccount.accountId}/ru/${appCode}/accept`;
      const reqHeaders = Object.assign({}, activeAccount.headers, {
        "X-Request-Id": generateUUIDv4()
      });

      const res = await Env.httpRequest("POST", {
        url: acceptUrl,
        headers: reqHeaders,
        body: "{}",
        timeout: 10
      });

      if (res.status === 200) {
        let appName = appCode;
        try {
          const parsed = JSON.parse(res.body);
          if (parsed && parsed.data && parsed.data.name) {
            appName = parsed.data.name;
          }
        } catch (_) {}

        if (!joinedMap[appCode]) joinedMap[appCode] = [];
        if (joinedMap[appCode].indexOf(activeAccount.accountId) === -1) {
          joinedMap[appCode].push(activeAccount.accountId);
        }
        Env.writeJSON(STORAGE_KEYS.JOINED_MAP, joinedMap);

        Env.notify(
          "CHIẾM SLOT TESTFLIGHT THÀNH CÔNG",
          `Ứng dụng: ${appName} (${appCode})`,
          `Tài khoản chiến thắng: ${activeAccount.shortId}`,
          `itms-beta://testflight.apple.com/join/${appCode}`
        );
      } else if (res.status === 401 || res.status === 403) {
        Env.notify(
          "Phiên Apple ID hết hạn",
          `Mã nick: ${activeAccount.shortId} (HTTP ${res.status})`,
          "Hãy đăng nhập lại nick này trong TestFlight để làm mới phiên."
        );
        break;
      } else {
        console.log(`[TF-Cron] Mã ${appCode} chưa mở slot (HTTP ${res.status}) với nick ${activeAccount.shortId}.`);
      }
    }
  }

  // 3B. Kiểm tra các gói cố định đã chọn để đảm bảo gia hạn tự động không bị đứt quãng
  const subsDb = Env.readJSON(STORAGE_KEYS.SUBSCRIPTIONS, {});
  const now = Date.now();
  const lastAlertMap = Env.readJSON(STORAGE_KEYS.LAST_ALERT_TS, {});
  let stateUpdated = false;

  for (const pid of Object.keys(subsDb)) {
    const sub = subsDb[pid];
    sub.selectedForAutoRenew = isTargetProduct(pid, cfg.targetRenewProducts);
    if (!sub.selectedForAutoRenew) continue;

    const remainMs = (sub.expiresMs || 0) - now;
    const needRenewalAction = sub.autoRenewStatus === "0" || (sub.expiresMs > 0 && remainMs < 300000);
    const lastAlert = Number(lastAlertMap[pid] || 0);

    // Chống lặp thông báo dày đặc: chỉ nhắc lại mỗi 10 phút cho cùng 1 gói
    if (needRenewalAction && now - lastAlert > 600000) {
      lastAlertMap[pid] = now;
      stateUpdated = true;
      const reason = sub.autoRenewStatus === "0"
        ? "Trạng thái tự gia hạn đang TẮT trên máy chủ Sandbox"
        : "Gói thử nghiệm sắp hết chu kỳ trong dưới 5 phút";

      Env.notify(
        "Cần kích hoạt lại Gói Đăng ký Cố định",
        `Mã gói: ${pid}`,
        `${reason}. Chạm vào thông báo này để mở thẳng trang Quản lý Gói Đăng ký hoặc mở lại App Beta.`,
        "itms-apps://apps.apple.com/account/subscriptions"
      );
    }
  }

  if (stateUpdated) {
    Env.writeJSON(STORAGE_KEYS.LAST_ALERT_TS, lastAlertMap);
  }

  return Env.done({});
}

// ================= ĐIỀU PHỐI NGỮ CẢNH THỰC THI =================
(async () => {
  try {
    if (typeof $response !== "undefined") {
      handleInspectTestFlightSubscriptions();
    } else if (typeof $request !== "undefined") {
      handleCaptureAppleIdSession();
    } else {
      await handleCronRotationAndRenew();
    }
  } catch (err) {
    console.log("[TF-Core-Fatal] Lỗi ngoại lệ: " + (err && err.message ? err.message : String(err)));
    Env.done({});
  }
})();
