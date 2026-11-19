/*
 * Script: TF_Frida_Diagnostics.js (Kịch bản Kiểm thử Động Chỉ Đọc cho com.apple.TestFlight — Chuẩn Frida 17+)
 * Phiên bản: version.5.0.0.0
 * Cách chạy trên máy tính kết nối iPhone Jailbreak (Rootless /var/jb):
 *   frida -U -n TestFlight -l Resource/Script/TestFlight/TF_Frida_Diagnostics.js
 *
 * Cam kết an toàn (Authorized QA & Zero-Offense):
 * - 100% CHỈ ĐỌC (Read-Only): Chỉ ghi log phiên bản ứng dụng TestFlight, mã máy storefront và đường dẫn URL yêu cầu.
 * - TUYỆT ĐỐI KHÔNG can thiệp SSL Pinning, KHÔNG sửa body/receipt, và TỰ ĐỘNG CHE (Redact) mọi Header phiên nhạy cảm.
 * - Tuân thủ nghiêm ngặt API Frida 17+: dùng `ptr.readUtf8String()`, `.isNull()`, `Module.findGlobalExportByName` và bọc `try/catch`.
 */

'use strict';

const REDACT_HEADER_PATTERN = /^(authorization|cookie|set-cookie|x-session-id|x-session-digest|x-apple-.*|x-ds-.*)$/i;

function resolveExport(moduleName, symbolName) {
    if (typeof Module.findGlobalExportByName === 'function') {
        if (moduleName) {
            const mod = Process.findModuleByName(moduleName);
            if (mod) {
                const found = mod.findExportByName(symbolName);
                if (found && !found.isNull()) return found;
            }
        }
        const globalSym = Module.findGlobalExportByName(symbolName);
        return (globalSym && !globalSym.isNull()) ? globalSym : null;
    }
    if (typeof Module.findExportByName === 'function') {
        const legacySym = Module.findExportByName(moduleName, symbolName);
        return (legacySym && !legacySym.isNull()) ? legacySym : null;
    }
    return null;
}

function maskAccountUuid(urlStr) {
    if (!urlStr) return '';
    return String(urlStr).replace(/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}/g, '<APPLE-ACCOUNT-UUID>');
}

function dumpSafeHeaders(nsDict) {
    const out = {};
    if (!nsDict || nsDict.isNull()) return out;
    try {
        const keys = nsDict.allKeys();
        const count = keys.count().valueOf();
        for (let i = 0; i < count; i++) {
            const kObj = keys.objectAtIndex_(i);
            const kStr = kObj.toString();
            const vObj = nsDict.objectForKey_(kObj);
            const vStr = vObj ? vObj.toString() : '';
            if (REDACT_HEADER_PATTERN.test(kStr)) {
                out[kStr] = vStr.length > 6 ? `[REDACTED len=${vStr.length}]` : '[REDACTED]';
            } else {
                out[kStr] = vStr;
            }
        }
    } catch (err) {
        out._err = String(err);
    }
    return out;
}

function printBundleMetadata() {
    try {
        const NSBundle = ObjC.classes.NSBundle;
        const main = NSBundle.mainBundle();
        const info = main.infoDictionary();
        const bundleId = main.bundleIdentifier() ? main.bundleIdentifier().toString() : 'unknown';
        const shortVer = info.objectForKey_('CFBundleShortVersionString');
        const buildVer = info.objectForKey_('CFBundleVersion');
        console.log(`[TF-Frida-QA] ✈️ Đã gắn chỉ đọc vào ${bundleId} | Version: ${shortVer ? shortVer.toString() : '?'} (${buildVer ? buildVer.toString() : '?'})`);
    } catch (err) {
        console.log(`[TF-Frida-QA] Lỗi đọc NSBundle: ${err}`);
    }
}

function attachReadOnlyUrlSessionObserver() {
    try {
        const NSURLSession = ObjC.classes.NSURLSession;
        if (!NSURLSession) {
            console.log('[TF-Frida-QA] Không tìm thấy lớp NSURLSession.');
            return;
        }

        const sel = '- dataTaskWithRequest:completionHandler:';
        const method = NSURLSession[sel];
        if (!method || !method.implementation) {
            console.log(`[TF-Frida-QA] Selector ${sel} không khả dụng trên phiên bản iOS này.`);
            return;
        }

        Interceptor.attach(method.implementation, {
            onEnter(args) {
                try {
                    const reqPtr = args[2];
                    if (!reqPtr || reqPtr.isNull()) return;
                    const req = new ObjC.Object(reqPtr);
                    const urlObj = req.URL();
                    if (!urlObj || urlObj.isNull()) return;

                    const rawUrl = urlObj.absoluteString().toString();
                    if (!/testflight\.apple\.com|beta\.apple\.com/i.test(rawUrl)) return;

                    const httpMethod = req.HTTPMethod() ? req.HTTPMethod().toString() : 'GET';
                    const safeUrl = maskAccountUuid(rawUrl);
                    const safeHeaders = dumpSafeHeaders(req.allHTTPHeaderFields());

                    console.log(`[TF-Frida-QA] 🌐 [${httpMethod}] ${safeUrl}`);
                    console.log(`[TF-Frida-QA]    Headers (Redacted): ${JSON.stringify(safeHeaders)}`);
                } catch (innerErr) {
                    console.log(`[TF-Frida-QA] onEnter được bảo vệ: ${innerErr}`);
                }
            }
        });

        console.log('[TF-Frida-QA] ✅ Đã kích hoạt bộ quan sát chỉ đọc NSURLSession (Redacted Headers).');
    } catch (err) {
        console.log(`[TF-Frida-QA] Lỗi gắn Interceptor: ${err}`);
    }
}

function watchDelayedFrameworkLoad() {
    try {
        const dlopenPtr = resolveExport(null, 'dlopen');
        if (!dlopenPtr || dlopenPtr.isNull()) return;

        let hookedOasis = false;
        Interceptor.attach(dlopenPtr, {
            onEnter(args) {
                try {
                    this.libPath = (!args[0] || args[0].isNull()) ? '' : args[0].readUtf8String();
                } catch (e) {
                    this.libPath = '';
                }
            },
            onLeave(retval) {
                try {
                    if (!hookedOasis && retval && !retval.isNull() && this.libPath && /TestFlightServices|AppStoreKit/i.test(this.libPath)) {
                        hookedOasis = true;
                        console.log(`[TF-Frida-QA] 📦 Phát hiện nạp động framework: ${this.libPath}`);
                    }
                } catch (e) {}
            }
        });
    } catch (err) {
        console.log(`[TF-Frida-QA] Lỗi theo dõi dlopen: ${err}`);
    }
}

function attachReadOnlyStoreKitObserver() {
    try {
        const SKPaymentQueue = ObjC.classes.SKPaymentQueue;
        if (!SKPaymentQueue) return;
        const sel = '- finishTransaction:';
        const method = SKPaymentQueue[sel];
        if (!method || !method.implementation) return;

        Interceptor.attach(method.implementation, {
            onEnter(args) {
                try {
                    const txPtr = args[2];
                    if (!txPtr || txPtr.isNull()) return;
                    const tx = new ObjC.Object(txPtr);
                    const payment = tx.payment();
                    const productId = (payment && !payment.isNull() && payment.productIdentifier())
                        ? payment.productIdentifier().toString()
                        : 'unknown';
                    const txId = tx.transactionIdentifier() ? tx.transactionIdentifier().toString() : '-';
                    const state = tx.transactionState ? tx.transactionState().valueOf() : -1;
                    console.log(`[TF-Frida-QA] 🧾 [StoreKit Read-Only] productId=${productId} | txId=${txId} | state=${state}`);
                } catch (e) {}
            }
        });
        console.log('[TF-Frida-QA] ✅ Đã kích hoạt bộ quan sát chỉ đọc StoreKit SKPaymentQueue (iOS 15.8.8 A9).');
    } catch (err) {
        console.log(`[TF-Frida-QA] Lỗi gắn StoreKit observer: ${err}`);
    }
}

if (typeof ObjC !== 'undefined' && ObjC.available) {
    printBundleMetadata();
    attachReadOnlyUrlSessionObserver();
    attachReadOnlyStoreKitObserver();
    watchDelayedFrameworkLoad();
} else {
    console.log('[TF-Frida-QA] ⚠️ Môi trường Objective-C Runtime không khả dụng trên tiến trình này.');
}
