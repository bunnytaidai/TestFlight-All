/**
 * TFHubInspector — Rootless iOS 15 QA Inspector & Local Web Control Panel (.dylib)
 * Version: 1.0.0 — Optimized for A9 iOS 15.8.8 (ElleKit / TrollFools)
 * Embedded Localhost Dashboard:
 *   - com.apple.TestFlight           -> http://127.0.0.1:18888/
 *   - com.ruikq.decar (Loon)         -> http://127.0.0.1:18889/
 *   - com.liguangming.Shadowrocket   -> http://127.0.0.1:18890/
 *   - Other target beta apps         -> http://127.0.0.1:18891/ (auto-fallback up to 18899)
 */
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <StoreKit/StoreKit.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>

static NSMutableArray<NSDictionary *> *gCapturedRequests = nil;
static NSMutableDictionary<NSString *, NSString *> *gCapturedAuth = nil;
static dispatch_queue_t gStoreQueue = nil;
static uint16_t gBoundPort = 0;

static const NSUInteger kMaxCaptured = 50;
static const NSUInteger kMaxBodyBytes = 8192;

static uint16_t tfhubPreferredPort(void) {
    NSString *bid = [[NSBundle mainBundle] bundleIdentifier] ?: @"";
    if ([bid isEqualToString:@"com.apple.TestFlight"]) return 18888;
    if ([bid isEqualToString:@"com.ruikq.decar"] || [bid isEqualToString:@"com.loon.LoonLite"]) return 18889;
    if ([bid isEqualToString:@"com.liguangming.Shadowrocket"]) return 18890;
    return 18891;
}

static void tfhubRecordRequest(NSURLRequest *request) {
    if (!request || !request.URL) return;
    if ([request.allHTTPHeaderFields objectForKey:@"X-TFHub-Replay"]) return;

    NSString *urlStr = request.URL.absoluteString ?: @"";
    if ([urlStr hasPrefix:@"http://127.0.0.1"] || [urlStr hasPrefix:@"http://localhost"]) return;

    NSString *method = request.HTTPMethod ?: @"GET";
    NSDictionary *headers = request.allHTTPHeaderFields ? [request.allHTTPHeaderFields copy] : @{};
    NSString *bodyStr = @"";
    if (request.HTTPBody.length > 0) {
        NSUInteger len = MIN(request.HTTPBody.length, kMaxBodyBytes);
        NSData *slice = [request.HTTPBody subdataWithRange:NSMakeRange(0, len)];
        bodyStr = [[NSString alloc] initWithData:slice encoding:NSUTF8StringEncoding] ?: [slice base64EncodedStringWithOptions:0];
    }

    NSDateFormatter *fmt = [[NSDateFormatter alloc] init];
    fmt.dateFormat = @"HH:mm:ss";
    NSString *ts = [fmt stringFromDate:[NSDate date]];

    NSDictionary *entry = @{
        @"ts": ts ?: @"",
        @"method": method,
        @"url": urlStr,
        @"headers": headers,
        @"body": bodyStr ?: @""
    };

    dispatch_async(gStoreQueue, ^{
        [gCapturedRequests insertObject:entry atIndex:0];
        if (gCapturedRequests.count > kMaxCaptured) {
            [gCapturedRequests removeLastObject];
        }
        // Extract relevant session headers for QA inspection
        for (NSString *k in headers) {
            NSString *lk = k.lowercaseString;
            if ([lk isEqualToString:@"x-session-id"] ||
                [lk isEqualToString:@"x-request-id"] ||
                [lk isEqualToString:@"x-session-digest"] ||
                [lk isEqualToString:@"x-dsid"] ||
                [lk isEqualToString:@"x-apple-i-md"] ||
                [lk isEqualToString:@"x-apple-i-md-m"] ||
                [lk isEqualToString:@"user-agent"]) {
                gCapturedAuth[lk] = [NSString stringWithFormat:@"%@", headers[k]];
            }
        }
    });
}

static NSDictionary *tfhubAppInfo(void) {
    NSBundle *b = [NSBundle mainBundle];
    NSURL *receiptURL = [b appStoreReceiptURL];
    NSData *receiptData = receiptURL ? [NSData dataWithContentsOfURL:receiptURL] : nil;
    NSString *receiptB64 = @"";
    if (receiptData.length > 0) {
        NSString *full = [receiptData base64EncodedStringWithOptions:0];
        receiptB64 = full.length > 256 ? [[full substringToIndex:256] stringByAppendingString:@"..."] : full;
    }
    return @{
        @"version": @"1.0.0",
        @"bundleId": b.bundleIdentifier ?: @"",
        @"appName": [b objectForInfoDictionaryKey:@"CFBundleDisplayName"] ?: [b objectForInfoDictionaryKey:@"CFBundleName"] ?: @"",
        @"appVersion": [b objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"",
        @"buildVersion": [b objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @"",
        @"port": @(gBoundPort),
        @"receiptExists": @(receiptData.length > 0),
        @"receiptBytes": @(receiptData.length),
        @"receiptPreview": receiptB64
    };
}

static NSData *tfhubHttpResponse(int code, NSString *statusText, NSString *contentType, NSData *bodyData) {
    NSString *hdr = [NSString stringWithFormat:
        @"HTTP/1.1 %d %@\r\n"
         "Content-Type: %@\r\n"
         "Content-Length: %lu\r\n"
         "Access-Control-Allow-Origin: *\r\n"
         "Cache-Control: no-store\r\n"
         "Connection: close\r\n\r\n",
        code, statusText, contentType, (unsigned long)bodyData.length];
    NSMutableData *resp = [[hdr dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];
    if (bodyData.length > 0) [resp appendData:bodyData];
    return resp;
}

static NSData *tfhubJsonResponse(int code, id obj) {
    NSData *json = [NSJSONSerialization dataWithJSONObject:obj options:0 error:nil] ?: [@"{}" dataUsingEncoding:NSUTF8StringEncoding];
    return tfhubHttpResponse(code, code == 200 ? @"OK" : @"Error", @"application/json; charset=utf-8", json);
}

static NSString *tfhubDashboardHtml(void) {
    return @"<!DOCTYPE html><html lang='vi'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>TFHubInspector Dylib</title>"
            "<style>"
            "body{margin:0;padding:12px;background:#0b1120;color:#f1f5f9;font-family:-apple-system,sans-serif;font-size:13px;}"
            "h1{font-size:17px;color:#38bdf8;margin:0 0 8px;}.card{background:#151f32;border:1px solid #26344d;border-radius:10px;padding:10px;margin-bottom:10px;}"
            "button{padding:6px 10px;border:0;border-radius:7px;background:#38bdf8;color:#062033;font-weight:700;font-size:12px;margin:2px;}"
            "button.ok{background:#22c55e;color:#052e16;}button.err{background:#ef4444;color:#fff;}"
            ".kv{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all;background:#0f172a;padding:5px;border-radius:6px;margin:4px 0;}"
            "input,textarea{width:100%;box-sizing:border-box;background:#0f172a;color:#f1f5f9;border:1px solid #26344d;border-radius:6px;padding:6px;margin:4px 0;font-size:12px;}"
            "</style></head><body>"
            "<h1>🛠️ TFHubInspector (.dylib Rootless)</h1>"
            "<div class='card'><div id='info'>Đang tải...</div>"
            "<button class='ok' onclick='loadAll()'>🔄 Làm mới</button>"
            "<button onclick='restoreSK()'>💳 Đồng bộ StoreKit Sandbox</button>"
            "<button class='err' onclick='clearReqs()'>🗑️ Xóa gói tin</button></div>"
            "<div class='card'><b>🔑 Tham số phiên đã bắt trong RAM</b><div id='auth'></div></div>"
            "<div class='card'><b>📡 Gói tin HTTP đã bắt (Bấm Replay để gửi lại)</b><div id='reqs'></div></div>"
            "<script>"
            "const api=(p,b)=>fetch(p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{}).then(r=>r.json());"
            "let REQS=[];"
            "async function loadAll(){"
            " const s=await api('/api/state');"
            " document.getElementById('info').innerHTML='<div class=kv><b>App:</b> '+s.info.appName+' ('+s.info.bundleId+') v'+s.info.appVersion+' | Port: '+s.info.port+'<br><b>Receipt Sandbox:</b> '+(s.info.receiptExists?s.info.receiptBytes+' bytes':'Chưa có')+'</div>';"
            " const a=s.auth||{}; const ak=Object.keys(a);"
            " document.getElementById('auth').innerHTML=ak.length?ak.map(k=>'<div class=kv><b>'+k+':</b> '+a[k]+'</div>').join(''):'<div class=kv>Chưa bắt được header phiên.</div>';"
            " REQS=s.requests||[];"
            " document.getElementById('reqs').innerHTML=REQS.length?REQS.map((r,i)=>'<div class=kv>['+r.ts+'] <b>'+r.method+'</b> '+r.url+'<br><button onclick=\"replay('+i+')\">🚀 Replay API</button></div>').join(''):'<div class=kv>Chưa có request nào.</div>';"
            "}"
            "async function replay(i){const r=REQS[i]; const res=await api('/api/replay',{url:r.url,method:r.method,headers:r.headers,body:r.body}); alert('HTTP '+res.status+' ('+res.durationMs+'ms)\\n'+(res.body||'').slice(0,400));}"
            "async function restoreSK(){const r=await api('/api/storekit/restore',{}); alert(r.message||'OK');}"
            "async function clearReqs(){await api('/api/clear',{}); loadAll();}"
            "loadAll();"
            "</script></body></html>";
}

static void tfhubHandleClient(int clientFd) {
    NSMutableData *raw = [NSMutableData data];
    uint8_t buf[4096];
    struct timeval tv = {2, 0};
    setsockopt(clientFd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    ssize_t n = recv(clientFd, buf, sizeof(buf), 0);
    if (n > 0) [raw appendBytes:buf length:(NSUInteger)n];
    if (raw.length == 0) { close(clientFd); return; }

    NSString *reqStr = [[NSString alloc] initWithData:raw encoding:NSUTF8StringEncoding] ?: @"";
    NSArray<NSString *> *parts = [reqStr componentsSeparatedByString:@"\r\n\r\n"];
    NSString *head = parts.count > 0 ? parts[0] : @"";
    NSString *bodyStr = parts.count > 1 ? parts[1] : @"";
    NSArray<NSString *> *lines = [head componentsSeparatedByString:@"\r\n"];
    NSArray<NSString *> *reqLine = lines.count > 0 ? [lines[0] componentsSeparatedByString:@" "] : @[];
    NSString *path = reqLine.count > 1 ? reqLine[1] : @"/";

    NSData *resp = nil;
    if ([path isEqualToString:@"/"] || [path isEqualToString:@"/index.html"]) {
        resp = tfhubHttpResponse(200, @"OK", @"text/html; charset=utf-8", [tfhubDashboardHtml() dataUsingEncoding:NSUTF8StringEncoding]);
    } else if ([path isEqualToString:@"/api/state"]) {
        __block NSArray *reqsCopy = nil;
        __block NSDictionary *authCopy = nil;
        dispatch_sync(gStoreQueue, ^{
            reqsCopy = [gCapturedRequests copy];
            authCopy = [gCapturedAuth copy];
        });
        resp = tfhubJsonResponse(200, @{ @"info": tfhubAppInfo(), @"auth": authCopy ?: @{}, @"requests": reqsCopy ?: @[] });
    } else if ([path isEqualToString:@"/api/clear"]) {
        dispatch_sync(gStoreQueue, ^{ [gCapturedRequests removeAllObjects]; });
        resp = tfhubJsonResponse(200, @{ @"ok": @YES });
    } else if ([path isEqualToString:@"/api/storekit/restore"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [[SKPaymentQueue defaultQueue] restoreCompletedTransactions];
        });
        resp = tfhubJsonResponse(200, @{ @"ok": @YES, @"message": @"Đã gọi SKPaymentQueue.restoreCompletedTransactions()" });
    } else if ([path isEqualToString:@"/api/replay"]) {
        NSDictionary *j = [NSJSONSerialization JSONObjectWithData:[bodyStr dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        NSURL *u = j[@"url"] ? [NSURL URLWithString:j[@"url"]] : nil;
        if (!u) {
            resp = tfhubJsonResponse(400, @{ @"ok": @NO, @"error": @"Missing url" });
        } else {
            NSMutableURLRequest *mreq = [NSMutableURLRequest requestWithURL:u];
            mreq.HTTPMethod = j[@"method"] ?: @"GET";
            mreq.timeoutInterval = 12.0;
            NSDictionary *hdrs = [j[@"headers"] isKindOfClass:[NSDictionary class]] ? j[@"headers"] : @{};
            for (NSString *k in hdrs) {
                if ([k.lowercaseString isEqualToString:@"content-length"] || [k.lowercaseString isEqualToString:@"host"]) continue;
                [mreq setValue:[NSString stringWithFormat:@"%@", hdrs[k]] forHTTPHeaderField:k];
            }
            [mreq setValue:@"1" forHTTPHeaderField:@"X-TFHub-Replay"];
            if ([j[@"body"] isKindOfClass:[NSString class]] && [j[@"body"] length] > 0) {
                mreq.HTTPBody = [j[@"body"] dataUsingEncoding:NSUTF8StringEncoding];
            }
            dispatch_semaphore_t sem = dispatch_semaphore_create(0);
            __block NSInteger statusCode = 0;
            __block NSString *respBody = @"";
            NSDate *start = [NSDate date];
            [[[NSURLSession sharedSession] dataTaskWithRequest:mreq completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
                if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                    statusCode = ((NSHTTPURLResponse *)response).statusCode;
                }
                if (data.length > 0) {
                    NSData *sl = [data subdataWithRange:NSMakeRange(0, MIN(data.length, kMaxBodyBytes))];
                    respBody = [[NSString alloc] initWithData:sl encoding:NSUTF8StringEncoding] ?: @"(binary)";
                } else if (error) {
                    respBody = error.localizedDescription ?: @"Request failed";
                }
                dispatch_semaphore_signal(sem);
            }] resume];
            dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(13 * NSEC_PER_SEC)));
            NSInteger ms = (NSInteger)([[NSDate date] timeIntervalSinceDate:start] * 1000.0);
            resp = tfhubJsonResponse(200, @{ @"ok": @(statusCode >= 200 && statusCode < 300), @"status": @(statusCode), @"durationMs": @(ms), @"body": respBody ?: @"" });
        }
    } else {
        resp = tfhubJsonResponse(404, @{ @"error": @"Not Found" });
    }

    if (resp.length > 0) send(clientFd, resp.bytes, resp.length, 0);
    close(clientFd);
}

static void tfhubStartLocalServer(void) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0), ^{
        uint16_t basePort = tfhubPreferredPort();
        int serverFd = -1;
        for (uint16_t p = basePort; p <= 18899; p++) {
            int fd = socket(AF_INET, SOCK_STREAM, 0);
            if (fd < 0) continue;
            int yes = 1;
            setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
            struct sockaddr_in addr;
            memset(&addr, 0, sizeof(addr));
            addr.sin_family = AF_INET;
            addr.sin_port = htons(p);
            addr.sin_addr.s_addr = inet_addr("127.0.0.1");
            if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) == 0 && listen(fd, 8) == 0) {
                serverFd = fd;
                gBoundPort = p;
                break;
            }
            close(fd);
        }
        if (serverFd < 0) return;

        while (1) {
            struct sockaddr_in cli;
            socklen_t len = sizeof(cli);
            int cfd = accept(serverFd, (struct sockaddr *)&cli, &len);
            if (cfd < 0) continue;
            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
                tfhubHandleClient(cfd);
            });
        }
    });
}

%hook NSURLSession

- (NSURLSessionDataTask *)dataTaskWithRequest:(NSURLRequest *)request {
    tfhubRecordRequest(request);
    return %orig;
}

- (NSURLSessionDataTask *)dataTaskWithRequest:(NSURLRequest *)request completionHandler:(void (^)(NSData *data, NSURLResponse *response, NSError *error))completionHandler {
    tfhubRecordRequest(request);
    return %orig;
}

%end

%ctor {
    gCapturedRequests = [NSMutableArray array];
    gCapturedAuth = [NSMutableDictionary dictionary];
    gStoreQueue = dispatch_queue_create("com.antidv.tfhubinspector.store", DISPATCH_QUEUE_SERIAL);
    tfhubStartLocalServer();
}

