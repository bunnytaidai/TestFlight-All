# 📘 HƯỚNG DẪN SỬ DỤNG TRỌN BỘ TESTFLIGHT CHO LOON & SHADOWROCKET (`version.5.4.0.0`)

> **Tối ưu riêng cho:** iPhone chip A9 (`iPhone 6s / 6s Plus / SE 1`) chạy **iOS 15.8.8 Rootless (`/var/jb`) + SSL Kill Switch 3**, giữ bộ nhớ `NetworkExtension` nhẹ gọn.

---

## ⭐ 0. TRUNG TÂM ALL-IN-ONE 3 TAB (`TF_MultiAccount_Hub v2.0.0.0` — KHUYÊN DÙNG CHÍNH)

Hợp nhất **`NobyDa` + `iRingo` + `CRUD Link TestFlight` + `Batch Actions` + `StoreKit 1/2 Sandbox`** vào **đúng 1 Plugin Loon / 1 Module Shadowrocket duy nhất** *(lưu ý: tắt các plugin TestFlight/NobyDa/iRingo riêng lẻ trước khi bật để tránh xung đột MITM)*:

- **Loon (`.plugin`):**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/TF_MultiAccount_Hub.plugin
  ```
- **Shadowrocket (`.sgmodule`):**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/TF_MultiAccount_Hub.sgmodule
  ```
- **BoxJs Subscription (`boxjs.json`):**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json
  ```
- **Giao diện Web điều khiển 3 Tab trên Safari:** `http://tf-hub.test/`
  1. **Tab 1 (`Link TF`):** Thêm / Sửa tên / Xóa từng link, kiểm tra trạng thái (`OPEN`/`FULL`/`CLOSED`), bấm cho toàn bộ nick `ALIVE` cùng tham gia.
  2. **Tab 2 (`Nick & API`):** Hiển thị rõ `accountId` (UUID) + 3 Token (`x-session-id`, `x-request-id`, `x-session-digest`), chuyển `MERGE`/`PIN`, ping nuôi token chống die `401`, quét app & gửi `/install`, lách iOS cũ (`modBuild` + `AlwaysShowInstall`) & phá vùng `Storefront`.
  3. **Tab 3 (`Gói Sandbox`):** Theo dõi **chỉ đọc** gói đăng ký kiểm thử StoreKit 1 & 2 theo từng Apple ID, tích Watchlist & nhắc gia hạn 1 chạm.

---

## 🎯 1. DANH SÁCH 5 LINK TESTFLIGHT ĐÃ CẤU HÌNH SẴN (TỰ SĂN SLOT + TỰ ĐẢO NICK)

1. **Google Chrome beta (`LPQmtkUs`):**
   `https://testflight.apple.com/join/LPQmtkUs`
2. **Aloha Browser – Private VPN beta (`Xh9VNQoA`):**
   `https://testflight.apple.com/join/Xh9VNQoA`
3. **VilaNet beta (`2mcx1R3I`):**
   `https://testflight.apple.com/join/2mcx1R3I`
4. **Notion: Notes, Tasks, AI beta (`YSo8aVCS`):**
   `https://testflight.apple.com/join/YSo8aVCS`
5. **Notion Calendar Next beta (`CzpZHGuS`):**
   `https://testflight.apple.com/join/CzpZHGuS`

---

## 🔗 2. TỔNG HỢP TOÀN BỘ LINK RAW CẦN ADD (CHỈ CẦN COPY DÁN)

### 🦅 A. Dành cho **LOON**
* **Link File Cấu Hình Full (Khuyên dùng — chỉ cần add đúng 1 link này):**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Config/Loon_All_In_One.conf
  ```
* *(Tùy chọn)* Nếu dùng cấu hình Loon riêng của bạn, chỉ cần add lẻ các **Plugin** sau:
  * **Tự vào 5 link TestFlight 2 tầng + Tự đảo nick Apple ID:**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/Auto_Join_TF.plugin
    ```
  * **Kho Token Apple ID + Tự `GET` App từng nick + Quản lý gói Sandbox (`http://tf-sub.test/`):**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/TF_Subscription_Manager.plugin
    ```
  * **Đa tài khoản & Mở khóa thiết bị + Tải nhanh CDN:**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/TestFlight.plugin
    ```
  * **Radar canh slot công khai không cần Token (`http://tf-radar.test/`):**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/TF_Slot_Radar.plugin
    ```
  * **BoxJS (`http://boxjs.com/`):**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/BoxJs.plugin
    ```

### 🚀 B. Dành cho **SHADOWROCKET**
* **Link File Cấu Hình Full (Khuyên dùng — chỉ cần add đúng 1 link này):**
  ```text
  https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/Shadowrocket_All_In_One.conf
  ```
* *(Tùy chọn)* Nếu dùng cấu hình Shadowrocket riêng, add lẻ các **Module (`.sgmodule`)** sau:
  * **Tự vào 5 link TestFlight 2 tầng + Tự đảo nick Apple ID:**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/Auto_Join_TF.sgmodule
    ```
  * **Kho Token Apple ID + Tự `GET` App từng nick + Quản lý gói Sandbox (`http://tf-sub.test/`):**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/TF_Subscription_Manager.sgmodule
    ```
  * **Đa tài khoản & Mở khóa thiết bị + Tải nhanh CDN:**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule
    ```
  * **BoxJS (`http://boxjs.com/`):**
    ```text
    https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/BoxJs.sgmodule
    ```

### 📦 C. Link Đăng Ký **BoxJS** (Dán vào `http://boxjs.com/` ➔ Mục Đăng ký / Subscriptions)
```text
https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json
```

---

## 🌐 3. 6 TRANG WEB ĐIỀU KHIỂN NỘI BỘ (MỞ BẰNG SAFARI KHI BẬT VPN — TẢI `0ms`)

| Đường dẫn mở trên Safari | Chức năng chính |
| :--- | :--- |
| `http://tf-sub.test/` | **Trung tâm chính:** Xem kho Token Apple ID đã lưu, đổi nick 1 chạm (không hỏi lại OTP/2FA), bấm **Quét (`GET`) App tất cả nick**, chọn cố định gói mua kiểm thử Sandbox cần theo dõi gia hạn. |
| `http://boxjs.com/` | Xem/chỉnh sửa/sao lưu JSON toàn bộ biến `TF_ACCOUNTS`, `APP_ID`, `TF_SANDBOX_SUBSCRIPTIONS`, `TF_SUB_WATCHLIST`. |
| `http://tf-radar.test/` | Radar canh 5 slot TestFlight công khai (không tốn Token Apple ID). |
| `http://tf-link.test/` | Quản lý hàng đợi link TestFlight & dán nhanh nhiều link cùng lúc. |
| `http://tf-status.test/` | Đếm ngược hạn **90 ngày** của từng app Beta & báo Build mới. |
| `http://tf-diag.test/` | Kiểm tra độ trễ mạng & bắt bệnh thiếu chứng chỉ CA / HTTP2. |

---

## 🛠️ 4. CÁC BƯỚC THIẾT LẬP TỪ A–Z TRÊN IPHONE A9 IOS 15.8.8

### Bước 1: Nhập Cấu Hình Full
* **Trên Loon:** Vào `Configuration File` ➔ bấm dấu **`+`** ➔ **Import from URL** ➔ dán link `Loon_All_In_One.conf` ➔ chọn kích hoạt.
* **Trên Shadowrocket:** Vào tab **Cấu hình** ➔ bấm **`+`** ➔ dán link `Shadowrocket_All_In_One.conf` ➔ bấm **Tải về** ➔ chạm vào tệp chọn **Sử dụng Config**.

### Bước 2: Bật Chứng Chỉ CA & MitM HTTP/2 (Bắt buộc)
1. Tạo & cài đặt chứng chỉ CA trong mục **MITM** (Loon) hoặc **Giải mã HTTPS** (Shadowrocket).
2. Vào **Cài đặt iOS ➔ Đã tải về hồ sơ** ➔ Cài đặt chứng chỉ.
3. Vào **Cài đặt iOS ➔ Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ** ➔ Bật xanh chứng chỉ Loon/Shadowrocket.
4. Bật công tắc **MITM + HTTP/2** rồi **Bật VPN** *(chỉ bật 1 trong 2 app tại một thời điểm)*.

### Bước 3: Lưu Token Nhiều Nick Apple ID (Chạy Ngầm Không Hỏi Lại OTP / 2FA)
1. Đăng nhập sẵn nick Apple ID số 1 *(đã qua OTP/2FA)* ➔ mở ứng dụng **TestFlight** 1 lần.
2. Hệ thống tự động bắt & lưu đủ **5 tham số phiên** vào kho `TF_ACCOUNTS`:
   - `key` (`account_id`), `session_id` (`X-Session-Id`), `session_digest` (`X-Session-Digest`), `request_id` (`X-Request-Id`), `tf_ua` (`User-Agent`).
3. Thấy thông báo **`🎉 Đã lưu Token Apple ID #1`** ➔ lặp lại với nick số 2, số 3...
4. Từ lúc này, Cron chạy ngầm mỗi **10 giây** sẽ **tự đảo qua lại giữa các nick đã lưu để săn 5 link TestFlight** và mỗi **15 phút** tự **`GET` danh sách App TestFlight của từng nick** mà **không cần đăng nhập lại hay nhập OTP/2FA**.

### Bước 4: Quản Lý & Theo Dõi Gia Hạn Gói Kiểm Thử TestFlight
1. Mở Safari vào **`http://tf-sub.test/`** *(có thể bấm nút Chia sẻ ➔ **Thêm vào Màn hình chính** để dùng như 1 app riêng)*.
2. Bấm **`🔄 Quét (GET) App TestFlight Tất Cả Nick`** để kiểm tra sức khỏe Token (`TOKEN SỐNG` / `HẾT HẠN 401`) và danh sách app của từng nick.
3. Khi mở các app TestFlight có gói mua kiểm thử Sandbox, script tự động ghi nhận **chỉ đọc (`Read-Only`)** vào danh sách gói ➔ bạn bấm **`➕ Chọn gia hạn`** để hệ thống theo dõi hạn và báo đẩy 1 chạm mở thẳng `itms-apps://apps.apple.com/account/subscriptions` khi hết chu kỳ Sandbox.

