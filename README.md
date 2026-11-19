# 🚀 Bộ Cấu Hình Full TestFlight Cho Loon & Shadowrocket (`version.5.3.0.0` — A9 iOS 15.8.8 Rootless)

Bộ cấu hình trọn gói giúp **tự động bắt & lưu Token phiên của nhiều nick Apple ID (đã qua OTP/2FA)** để **đảo nick nhanh chạy ngầm không cần xác minh lại OTP/2FA**, thực hiện khép kín 2 hành động:

1. **Tự động đảo nick săn slot 5 link TestFlight mục tiêu** *(2 tầng thông minh + tự né `HTTP 429` 60 giây)*.
2. **Tự động `GET` danh sách ứng dụng TestFlight của từng nick & ghi nhận chỉ đọc gói mua kiểm thử Sandbox** ➔ chọn cố định gói cần theo dõi gia hạn tại `http://tf-sub.test/` và `http://boxjs.com/`.

---

## ❓ NÊN DÙNG BOXJS + WEB DASHBOARD HAY LÀM FILE `.DEB`?

| Tiêu chí | **BoxJS (`http://boxjs.com/`) + Web Nội Bộ (`http://tf-sub.test/`)** *(Khuyên dùng)* | **Tweak `.deb` cài vào Cài đặt iOS** |
| :--- | :--- | :--- |
| **Đọc/ghi Token trực tiếp** | **100% đồng bộ thẳng** vào `$persistentStore` của cả Loon & Shadowrocket. | Phải đọc/ghi xuyên Sandbox container, dễ xung đột khóa DB làm văng VPN. |
| **Độ ổn định trên A9 iOS 15.8.8** | Mở tức thì `0ms` trên Safari, **không cần Respring**, không tốn RAM nền. | Dễ lỗi khi Loon/Shadowrocket cập nhật, phải biên dịch lại theo Rootless `/var/jb`. |
| **Quản lý Token, ID & Gói Sandbox** | Xem/đổi nick 1 chạm, quét (`GET`) app tất cả nick, sao lưu JSON ngay trên Safari. | Khó hiển thị bảng danh sách động và nút gọi API trực tiếp. |

> **Kết luận:** **Không cần tạo file `.deb`.** Bộ đôi **Web Dashboard nội bộ (`http://tf-sub.test/`) + `BoxJS` (`http://boxjs.com/`)** là giải pháp tối ưu, nhẹ và an toàn nhất cho iPhone A9 chạy iOS 15.8.8 Rootless.

---

## 🎯 5 LINK TESTFLIGHT CẤU HÌNH SẴN (`APP_ID`)

| STT | Ứng dụng Beta | Mã `APP_ID` | Link Tham Gia |
| :-: | :--- | :---: | :--- |
| 1 | **Google Chrome beta** | `LPQmtkUs` | https://testflight.apple.com/join/LPQmtkUs |
| 2 | **Aloha Browser – Private VPN beta** | `Xh9VNQoA` | https://testflight.apple.com/join/Xh9VNQoA |
| 3 | **VilaNet beta** | `2mcx1R3I` | https://testflight.apple.com/join/2mcx1R3I |
| 4 | **Notion: Notes, Tasks, AI beta** | `YSo8aVCS` | https://testflight.apple.com/join/YSo8aVCS |
| 5 | **Notion Calendar Next beta** | `CzpZHGuS` | https://testflight.apple.com/join/CzpZHGuS |

---

## 🔐 5 THAM SỐ TOKEN APPLE ID ĐƯỢC TỰ ĐỘNG BẮT & LƯU (CHẠY NGẦM KHÔNG CẦN OTP/2FA)

Khi 1 nick Apple ID đã xác minh OTP/2FA và bạn mở ứng dụng **TestFlight** 1 lần lúc đang bật Loon/Shadowrocket, script sẽ tự động bắt và lưu trọn bộ 5 tham số vào kho `TF_ACCOUNTS`:

1. `key` (`account_id` — UUID 36 ký tự của tài khoản TestFlight)
2. `session_id` (`X-Session-Id`)
3. `session_digest` (`X-Session-Digest`)
4. `request_id` (`X-Request-Id`)
5. `tf_ua` (`User-Agent` của ứng dụng TestFlight)

*Nhờ lưu đủ 5 tham số này, các lượt chạy ngầm (`Cron`) săn 5 link TestFlight và tự động `GET` danh sách app của từng nick sẽ đảo qua lại giữa toàn bộ các nick trong `TF_ACCOUNTS` **mà không phải đăng nhập lại hay nhập mã OTP/2FA** (cho đến khi máy chủ Apple thu hồi phiên trả về `HTTP 401/403`, lúc đó hệ thống sẽ tự báo bạn mở lại TestFlight 1 lần để làm mới).*

---

## 🦅 1. HƯỚNG DẪN CÀI ĐẶT NHANH CHO **LOON**

1. **Nhập File Cấu Hình Full (1 chạm):**
   - Tệp trong repo: [`Tool/Loon/Config/Loon_All_In_One.conf`](./Tool/Loon/Config/Loon_All_In_One.conf)
   - Link Raw dán vào Loon:
     ```text
     https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Config/Loon_All_In_One.conf
     ```
2. **Bật MitM & Chứng chỉ CA:**
   - Vào **Loon ➔ Cấu hình ➔ MITM** ➔ Tạo/Cài chứng chỉ CA ➔ Vào **Cài đặt iOS ➔ Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ** bật xanh chứng chỉ Loon.
   - Bật công tắc **MITM** và **MITM over HTTP/2** ➔ Bật VPN Loon.
3. **Thu thập Token nhiều nick Apple ID:**
   - Mở ứng dụng **TestFlight** 1 lần cho từng nick đã đăng nhập sẵn (sẽ hiện thông báo `🎉 Đã lưu Token Apple ID #...`).
4. **Quản lý trực quan trên Safari (0ms):**
   - **`http://tf-sub.test/`** — Xem kho Token Apple ID, đổi nick 1 chạm, bấm **🔄 Quét (GET) App TestFlight Tất Cả Nick**, và tích chọn các gói mua kiểm thử Sandbox cần theo dõi gia hạn.
   - **`http://boxjs.com/`** — Xem/chỉnh sửa/sao lưu JSON toàn bộ `TF_ACCOUNTS`, `APP_ID`, `TF_SANDBOX_SUBSCRIPTIONS`, `TF_SUB_WATCHLIST`.
   - **`http://tf-radar.test/`** | **`http://tf-link.test/`** | **`http://tf-status.test/`** | **`http://tf-diag.test/`** — Bộ 4 bảng phụ trợ Radar, Hàng đợi, Hạn 90 ngày và Chẩn đoán mạng.

*(Nếu bạn dùng cấu hình Loon riêng, có thể cài lẻ các Plugin trong [`Tool/Loon/Plugin/`](./Tool/Loon/Plugin/): `Auto_Join_TF.plugin`, `TF_Subscription_Manager.plugin`, `TestFlight.plugin`, `TF_Slot_Radar.plugin`, `BoxJs.plugin`.)*

---

## 🚀 2. HƯỚNG DẪN CÀI ĐẶT NHANH CHO **SHADOWROCKET**

- Xem hướng dẫn chi tiết từng bước tại: **[`Tool/Shadowrocket/README.md`](./Tool/Shadowrocket/README.md)**
- **Link Raw Cấu Hình Full Shadowrocket:**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/Shadowrocket_All_In_One.conf
  ```
- **Link Đăng Ký BoxJS (`http://boxjs.com/`):**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json
  ```

---

## 🔬 3. KIỂM THỬ ĐỘNG FRIDA 17+ CHỈ ĐỌC (TÙY CHỌN TRÊN A9 ROOTLESS `/var/jb`)

```bash
frida -U -n TestFlight -l Resource/Script/TestFlight/TF_Frida_Diagnostics.js
```
*(100% chỉ đọc `NSURLSession` + `SKPaymentQueue`, tự động che ẩn mọi Header xác thực nhạy cảm).*
