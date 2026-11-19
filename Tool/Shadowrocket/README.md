# 🚀 Hướng Dẫn Chi Tiết Cho Shadowrocket & Loon (`version.5.3.0.0` — A9 iOS 15.8.8 Rootless)

Bộ cấu hình **thuần TestFlight** được tinh gọn tối đa (giữ RAM `PacketTunnel` dưới `15MB` trên iPhone chip A9 iOS 15.8.8) để hoàn thành trọn vẹn **2 hành động cốt lõi**:

1. **Tự động lưu Token phiên nhiều nick Apple ID** *(đã qua OTP/2FA)* ➔ **Tự đảo nick chạy ngầm không hỏi lại OTP/2FA** để săn 5 link TestFlight:
   - `LPQmtkUs` (**Google Chrome beta**)
   - `Xh9VNQoA` (**Aloha Browser – Private VPN beta**)
   - `2mcx1R3I` (**VilaNet beta**)
   - `YSo8aVCS` (**Notion: Notes, Tasks, AI beta**)
   - `CzpZHGuS` (**Notion Calendar Next beta**)
2. **Tự động `GET` danh sách App TestFlight của từng nick Apple ID** & **ghi nhận chỉ đọc gói mua kiểm thử Sandbox** ➔ chọn cố định gói cần theo dõi gia hạn tại `http://tf-sub.test/` và `http://boxjs.com/`.

---

## 📦 TỆP CẤU HÌNH FULL & MODULE LẺ

| Nền tảng | Tệp | Link Raw Nhập Trực Tiếp |
| :--- | :--- | :--- |
| **Shadowrocket (Full)** | [`Shadowrocket_All_In_One.conf`](./Shadowrocket_All_In_One.conf) | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/Shadowrocket_All_In_One.conf` |
| **Loon (Full)** | [`Loon_All_In_One.conf`](../Loon/Config/Loon_All_In_One.conf) | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Config/Loon_All_In_One.conf` |
| **BoxJS Subscription** | [`boxjs.json`](./boxjs.json) | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json` |

### Danh sách Module lẻ cho Shadowrocket (`.sgmodule`)
1. [`Auto_Join_TF.sgmodule`](./Auto_Join_TF.sgmodule) — Bắt 5 tham số Token Apple ID, săn 5 link 2 tầng & tự đảo nick chống `HTTP 429`.
2. [`TF_Subscription_Manager.sgmodule`](./TF_Subscription_Manager.sgmodule) — Kho Token Apple ID, tự `GET` app từng nick & quản lý gói mua kiểm thử Sandbox (`http://tf-sub.test/`).
3. [`TestFlight_Unlock_Multi.sgmodule`](./TestFlight_Unlock_Multi.sgmodule) — Đổi nick 1 chạm `/v1/devices`, mở khóa thiết bị/khu vực & tải nhanh CDN.
4. [`TF_Slot_Radar.sgmodule`](./TF_Slot_Radar.sgmodule) — Radar canh slot công khai (`http://tf-radar.test/`).
5. [`TF_Expiry_Monitor.sgmodule`](./TF_Expiry_Monitor.sgmodule) — Theo dõi hạn 90 ngày & Build mới (`http://tf-status.test/`).
6. [`TF_Link_Helper.sgmodule`](./TF_Link_Helper.sgmodule) — Bắt link & quản lý hàng đợi (`http://tf-link.test/`).
7. [`TF_Network_Diagnostics.sgmodule`](./TF_Network_Diagnostics.sgmodule) — Kiểm tra độ trễ & bắt bệnh MitM (`http://tf-diag.test/`).
8. [`BoxJs.sgmodule`](./BoxJs.sgmodule) — Bảng cài đặt & sao lưu biến `http://boxjs.com/`.

---

## 🛠️ HƯỚNG DẪN CÀI ĐẶT TỪNG BƯỚC TRÊN SHADOWROCKET (IOS 15.8.8 A9)

### Bước 1: Nhập cấu hình Full
1. Mở **Shadowrocket** ➔ Tab **Cấu hình (`Config`)** ➔ Bấm dấu **`+`** góc trên phải.
2. Dán link Raw của `Shadowrocket_All_In_One.conf` ➔ bấm **Tải về (`Download`)** ➔ chạm vào tệp vừa tải chọn **Sử dụng cấu hình (`Use Config`)**.

### Bước 2: Bật Giải mã HTTPS (MitM + HTTP/2)
1. Nhấn chữ **`i`** cạnh cấu hình `Shadowrocket_All_In_One.conf` ➔ chọn **Giải mã HTTPS (`HTTPS Decryption`)**.
2. Bật **Giải mã HTTPS** ➔ chọn **Tạo chứng chỉ CA mới (`Generate New CA Certificate`)** ➔ bấm **Cài đặt chứng chỉ (`Install Certificate`)**.
3. Mở **Cài đặt iOS ➔ Đã tải về hồ sơ** ➔ Cài đặt hồ sơ chứng chỉ.
4. Vào **Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ (`Certificate Trust Settings`)** ➔ bật xanh chứng chỉ Shadowrocket.
5. Quay lại Shadowrocket ➔ Bật công tắc kết nối VPN ở màn hình chính.

### Bước 3: Lưu Token nhiều nick Apple ID (Không bị hỏi lại OTP/2FA)
1. Đăng nhập sẵn nick Apple ID số 1 (đã qua OTP/2FA) ➔ mở ứng dụng **TestFlight** 1 lần khi VPN đang bật.
2. Khi thấy thông báo **`🎉 Đã lưu Token Apple ID #1`**, hệ thống đã lưu đủ 5 tham số (`account_id`, `X-Session-Id`, `X-Session-Digest`, `X-Request-Id`, `User-Agent`) vào kho `TF_ACCOUNTS`.
3. Lặp lại cho nick số 2, số 3... Từ lúc này về sau, Cron chạy ngầm mỗi 10 giây sẽ **tự đảo qua lại giữa các nick đã lưu để săn 5 link TestFlight và tự `GET` danh sách app của từng nick mà không hỏi lại OTP/2FA**.

### Bước 4: Quản lý trên Safari (`http://tf-sub.test/` & `http://boxjs.com/`)
1. Mở Safari truy cập **`http://tf-sub.test/`**:
   - Xem toàn bộ nick Apple ID đã lưu & trạng thái Token (`TOKEN SỐNG` / `HẾT HẠN 401`).
   - Bấm **`🔄 Quét (GET) App TestFlight Tất Cả Nick`** để lấy danh sách app TestFlight của từng nick.
   - Tích **`➕ Chọn gia hạn`** trên các gói mua kiểm thử Sandbox đã phát hiện (hoặc thêm thủ công `Product ID`) để nhận thông báo 1 chạm mở thẳng `itms-apps://apps.apple.com/account/subscriptions` khi hết chu kỳ Sandbox.
2. Mở **`http://boxjs.com/`** ➔ dán link `boxjs.json` vào mục **Đăng ký (`Subscriptions`)** để xem/sao lưu toàn bộ dữ liệu dạng JSON mà **không cần cài thêm bất kỳ file `.deb` nào**.
