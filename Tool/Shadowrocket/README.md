# 🚀 Hướng Dẫn Sử Dụng Thực Chiến Trên Shadowrocket & Loon (`version.5.1.0.0`)

Thư mục `Tool/Shadowrocket` và `Tool/Loon` chứa trọn bộ **Cấu hình All-In-One (`.conf`)**, **Module (`.sgmodule`)**, **Plugin (`.plugin`)** và **Script (`.js`)** đã được kiểm định & sửa lỗi toàn diện để **hoạt động thật sự ngoài thực tế**:

1. **Săn Slot Thông Minh 2 Tầng Cho Trọn Bộ 5 Ứng Dụng Mặc Định (`rqvYCYOp`, `YSo8aVCS`, `m2kxP5cw`, `LPQmtkUs`, `Xh9VNQoA`):**
   - **Microsoft Edge beta:** `https://testflight.apple.com/join/rqvYCYOp` (`rqvYCYOp`)
   - **Notion: Ghi chép, Nhiệm vụ, AI beta:** `https://testflight.apple.com/join/YSo8aVCS` (`YSo8aVCS`)
   - **Notion Agents beta:** `https://testflight.apple.com/join/m2kxP5cw` (`m2kxP5cw`)
   - **Google Chrome beta:** `https://testflight.apple.com/join/LPQmtkUs` (`LPQmtkUs`)
   - **Aloha Browser – Private VPN beta:** `https://testflight.apple.com/join/Xh9VNQoA` (`Xh9VNQoA`)
   - Kiểm tra trang công khai `https://testflight.apple.com/join/<CODE>` trước tiên (**không tốn Token Apple ID**, không sợ khóa `HTTP 429`), sau đó tự động gọi API `/accept` cho toàn bộ các nick Apple ID trong kho ngay khi có slot mở!
   - Đã vá dứt điểm lỗi tự xóa `APP_ID` khi mạng chập chờn và lỗi treo/văng VPN do Cron 1 giây vượt trần `15MB RAM` trên iOS.
2. **4 Plugin TestFlight Mới Kèm Giao Diện Web Nội Bộ Mở Trực Tiếp Trên Safari (Không Cần Mạng Ngoài):**
   - 📡 **`http://tf-radar.test/`** (`TF_Slot_Radar`): Quét trạng thái Slot công khai (`OPEN` / `FULL`), thêm/xóa mã và bấm mở thẳng `itms-beta://`.
   - ⏳ **`http://tf-status.test/`** (`TF_Expiry_Monitor`): Đếm ngược **hạn 90 ngày** của mọi ứng dụng TestFlight đang cài và báo khi có bản Build mới (Chế độ Chỉ Đọc an toàn).
   - 🔗 **`http://tf-link.test/`** (`TF_Link_Helper`): Dán cả đoạn tin nhắn Telegram/Discord để tự lọc hàng loạt mã `APP_ID`, đổi nick Apple ID 1 chạm Offline.
   - 🩺 **`http://tf-diag.test/`** (`TF_Network_Diagnostics`): Đo độ trễ `ms` tới máy chủ TestFlight/CDN và tự bắt bệnh thiếu chứng chỉ CA/HTTP2 (ẩn toàn bộ Header nhạy cảm).

---

## 📂 Danh Sách Trọn Bộ Tệp Cấu Hình & Plugin (`v5.1.0.0`)

| Nền Tảng | Tên Tệp | Chức Năng Thực Tế |
| :--- | :--- | :--- |
| **Shadowrocket** | [`Shadowrocket_All_In_One.conf`](./Shadowrocket_All_In_One.conf) | **Cấu hình Trọn Gói:** Đã tích hợp sẵn Săn 2 Tầng 5 App Beta mặc định (`rqvYCYOp`, `YSo8aVCS`, `m2kxP5cw`, `LPQmtkUs`, `Xh9VNQoA`), Đa tài khoản, BoxJS và cả 4 Web Dashboard mới. |
| **Shadowrocket** | [`Auto_Join_TF.sgmodule`](./Auto_Join_TF.sgmodule) | **Module Tự Vào TestFlight 2 Tầng & Đổi Nick:** Chu kỳ an toàn 10 giây, chống xóa nhầm `APP_ID`. |
| **Shadowrocket** | [`TestFlight_Unlock_Multi.sgmodule`](./TestFlight_Unlock_Multi.sgmodule) | **Module Đa Tài Khoản, Mở Khóa Khu Vực/Thiết Bị & Tải Nhanh CDN.** |
| **Shadowrocket** | [`TF_Slot_Radar.sgmodule`](./TF_Slot_Radar.sgmodule) | **[MỚI] Radar Canh Slot Công Khai Không Cần Token (`http://tf-radar.test/`).** |
| **Shadowrocket** | [`TF_Expiry_Monitor.sgmodule`](./TF_Expiry_Monitor.sgmodule) | **[MỚI] Giám Sát Hạn 90 Ngày & Báo Build Mới (`http://tf-status.test/`).** |
| **Shadowrocket** | [`TF_Link_Helper.sgmodule`](./TF_Link_Helper.sgmodule) | **[MỚI] Tự Bắt Link, Mở Thẳng App & Quản Lý Hàng Đợi Offline (`http://tf-link.test/`).** |
| **Shadowrocket** | [`TF_Network_Diagnostics.sgmodule`](./TF_Network_Diagnostics.sgmodule) | **[MỚI] Tối Ưu Tải Nhanh CDN & Bắt Bệnh Mạng/MitM (`http://tf-diag.test/`).** |
| **Shadowrocket** | [`BoxJs.sgmodule`](./BoxJs.sgmodule) | **Module BoxJS (`http://boxjs.com`):** Đã gắn `[Host] 127.0.0.1` và sửa lỗi `DIRECT` cho `jsdelivr.net`. |
| **Loon** | [`Loon_All_In_One.conf`](../Loon/Config/Loon_All_In_One.conf) | **Cấu hình Loon Trọn Gói:** Đầy đủ Săn 2 Tầng, Đa tài khoản, DoH IP chống lỗi DNS và 4 Web Dashboard mới. |
| **Loon** | [`Auto_Join_TF.plugin`](../Loon/Plugin/Auto_Join_TF.plugin) | **Plugin Tự Vào TestFlight 2 Tầng & Đổi Nick Apple ID** cho Loon. |
| **Loon** | [`TestFlight.plugin`](../Loon/Plugin/TestFlight.plugin) | **Plugin Đa Tài Khoản, Mở Khóa Thiết Bị & Tải Nhanh CDN** cho Loon. |
| **Loon** | [`TF_Slot_Radar.plugin`](../Loon/Plugin/TF_Slot_Radar.plugin) | **[MỚI] Plugin Radar Canh Slot Công Khai Không Cần Token (`http://tf-radar.test/`).** |
| **Loon** | [`TF_Expiry_Monitor.plugin`](../Loon/Plugin/TF_Expiry_Monitor.plugin) | **[MỚI] Plugin Giám Sát Hạn 90 Ngày & Build Mới (`http://tf-status.test/`).** |
| **Loon** | [`TF_Link_Helper.plugin`](../Loon/Plugin/TF_Link_Helper.plugin) | **[MỚI] Plugin Tự Bắt Link & Quản Lý Hàng Đợi Offline (`http://tf-link.test/`).** |
| **Loon** | [`TF_Network_Diagnostics.plugin`](../Loon/Plugin/TF_Network_Diagnostics.plugin) | **[MỚI] Plugin Chẩn Đoán Kết Nối & Kiểm Định MitM (`http://tf-diag.test/`).** |

---

## 🛠️ BƯỚC CHUẨN BỊ QUAN TRỌNG (CHỨNG CHỈ CA & MITM HTTP/2)

> **Mẹo kiểm tra nhanh:** Sau khi bật VPN trên Loon hoặc Shadowrocket, hãy mở Safari truy cập **`http://tf-diag.test/`** — hệ thống sẽ tự động kiểm tra và báo xanh `🟢` nếu kết nối & Token đã sẵn sàng!

1. **Trên Shadowrocket:**
   - Mở **Shadowrocket** ➔ Tab **Cấu hình (`Config`)** ➔ Nhấn chữ **`i`** cạnh cấu hình đang dùng ➔ **Giải mã HTTPS (`HTTPS Decryption`)**.
   - Bật **Giải mã HTTPS** ➔ **Tạo chứng chỉ CA mới** ➔ **Cài đặt chứng chỉ** ➔ Vào **Cài đặt iOS ➔ Đã tải về hồ sơ** để cài đặt.
   - Vào **Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ (`Certificate Trust Settings`)** ➔ Bật xanh chứng chỉ Shadowrocket.
2. **Trên Loon:**
   - Mở **Loon** ➔ Tab **Profile (`Cấu hình`)** ➔ Mục **MITM** ➔ Cài đặt **CA Certificate** và bật tin cậy trong Cài đặt iOS.
   - Bật công tắc **MITM** và **MITM over HTTP/2**.
   - Mở ứng dụng **TestFlight** 1 lần khi đang bật VPN để hệ thống tự động thu thập Token!
