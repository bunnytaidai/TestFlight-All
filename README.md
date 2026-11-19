### 🚀 Bộ Công Cụ TestFlight Toàn Diện Cho Loon & Shadowrocket (`version.5.2.0.0` — Tối Ưu A9 iOS 15.8.8 Rootless)

* **Tác giả gốc:** [Hely-T](https://github.com/Hely-T) & DecoAri & VirgilClyne — **Nâng cấp Thực Chiến `v5.2.0.0`**
* **Danh sách 5 Link TestFlight cấu hình tự động tham gia sẵn (`APP_ID` & `TF_RADAR_IDS`):**

| STT | Ứng dụng TestFlight Beta | Mã `APP_ID` | Liên kết Tham gia Chính thức |
| :-: | :--- | :---: | :--- |
| 1 | **Google Chrome beta** | `LPQmtkUs` | [https://testflight.apple.com/join/LPQmtkUs](https://testflight.apple.com/join/LPQmtkUs) |
| 2 | **Aloha Browser – Private VPN beta** | `Xh9VNQoA` | [https://testflight.apple.com/join/Xh9VNQoA](https://testflight.apple.com/join/Xh9VNQoA) |
| 3 | **VilaNet beta** | `2mcx1R3I` | [https://testflight.apple.com/join/2mcx1R3I](https://testflight.apple.com/join/2mcx1R3I) |
| 4 | **Notion: Notes, Tasks, AI beta** | `YSo8aVCS` | [https://testflight.apple.com/join/YSo8aVCS](https://testflight.apple.com/join/YSo8aVCS) |
| 5 | **Notion Calendar Next beta** | `CzpZHGuS` | [https://testflight.apple.com/join/CzpZHGuS](https://testflight.apple.com/join/CzpZHGuS) |

---

### 🔥 Những Nâng Cấp Cốt Lõi Giúp Hoạt Động Thật Sự (`version.5.2.0.0`)

1. **Cơ chế Săn Slot 2 Tầng + Tự Đảo Nick Apple ID Thông Minh (`2-Stage + Smart 429 Cooldown Rotation`):**
   - **Tầng 1 (`Public HTML Pre-Check`):** Kiểm tra trạng thái `OPEN / FULL` trực tiếp trên trang công khai `https://testflight.apple.com/join/<ID>` mà **không tốn Token Apple ID** và **chống khóa tài khoản `HTTP 429`**.
   - **Tầng 2 (`Multi-Account Smart Rotation Accept`):** Tự động lưu không giới hạn nick Apple ID (`TF_ACCOUNTS`), xoay vòng Round-Robin qua từng nick, tự động né nick bị `HTTP 429` (nghỉ 60 giây) để nick khỏe tranh slot ngay lập tức.
2. **Quản Lý Gói Đăng Ký TestFlight / Sandbox (`TF_Subscription_Manager` — `http://tf-sub.test/`):**
   - Quan sát **chỉ đọc (`Read-Only`)** các gói đăng ký TestFlight / StoreKit Sandbox theo từng nick Apple ID, cho phép **tích chọn cố định gói cần theo dõi gia hạn** và bắn thông báo đẩy 1 chạm mở thẳng mục Đăng ký trên iOS (`itms-apps://apps.apple.com/account/subscriptions`) khi hết chu kỳ tự gia hạn Sandbox của Apple (6–12 lần).
3. **Bổ sung 5 Plugin / Module TestFlight Thực Chiến (Cho cả Loon `.plugin` & Shadowrocket `.sgmodule`):**

| Tên Plugin / Module | Bảng Web Nội Bộ (Mở bằng Safari khi bật VPN) | Tác Dụng Thực Tế |
| :--- | :--- | :--- |
| **`TF_Subscription_Manager`** | `http://tf-sub.test/` | Xem gói đăng ký TestFlight/Sandbox đã mua theo từng nick Apple ID, chọn gói theo dõi gia hạn & đảo nick 1 chạm. |
| **`TF_Slot_Radar`** | `http://tf-radar.test/` | Radar canh slot công khai **không cần Token / MitM**, quét trực tiếp và mở thẳng `itms-beta://`. |
| **`TF_Expiry_Monitor`** | `http://tf-status.test/` | Đếm ngược hạn dùng **90 ngày** của từng app Beta & báo ngay khi có bản **Build mới** (Chế độ Chỉ Đọc). |
| **`TF_Link_Helper`** | `http://tf-link.test/` | Tự bắt link TestFlight, bóc tách hàng loạt link từ tin nhắn Telegram/Discord & đổi nick 1 chạm Offline. |
| **`TF_Network_Diagnostics`** | `http://tf-diag.test/` | Tối ưu tải nhanh cụm `itms5..itms11` CDN, đo độ trễ `ms` và bắt bệnh thiếu chứng chỉ CA/HTTP2 (ẩn khóa nhạy cảm). |

---

### 🦅 1. Cách sử dụng trên Loon

- **Cách 1 — File Cấu Hình Trọn Gói (`Loon_All_In_One.conf`):**
  - Nhập trực tiếp: [`Tool/Loon/Config/Loon_All_In_One.conf`](./Tool/Loon/Config/Loon_All_In_One.conf)
  - Vào mục **MITM** tạo/cài chứng chỉ CA và bật tin cậy chứng chỉ trong Cài đặt iOS ➔ Bật **MitM** & **HTTP/2** ➔ Bật VPN Loon.
- **Cách 2 — Cài từng Plugin lẻ trong `Tool/Loon/Plugin/`:**
  - Tự động vào TestFlight 2 tầng + Đảo nick: [`Tool/Loon/Plugin/Auto_Join_TF.plugin`](./Tool/Loon/Plugin/Auto_Join_TF.plugin) *(hoặc [`Auto_Join_TF.plugin`](./Auto_Join_TF.plugin))*
  - Quản lý gói đăng ký TestFlight & Đảo nick (`http://tf-sub.test/`): [`Tool/Loon/Plugin/TF_Subscription_Manager.plugin`](./Tool/Loon/Plugin/TF_Subscription_Manager.plugin)
  - Đa tài khoản & Mở khóa thiết bị: [`Tool/Loon/Plugin/TestFlight.plugin`](./Tool/Loon/Plugin/TestFlight.plugin)
  - Radar canh slot không cần Token: [`Tool/Loon/Plugin/TF_Slot_Radar.plugin`](./Tool/Loon/Plugin/TF_Slot_Radar.plugin)
  - Giám sát hạn 90 ngày & Build mới: [`Tool/Loon/Plugin/TF_Expiry_Monitor.plugin`](./Tool/Loon/Plugin/TF_Expiry_Monitor.plugin)
  - Bắt link & Hàng đợi Offline: [`Tool/Loon/Plugin/TF_Link_Helper.plugin`](./Tool/Loon/Plugin/TF_Link_Helper.plugin)
  - Chẩn đoán mạng & Tải nhanh CDN: [`Tool/Loon/Plugin/TF_Network_Diagnostics.plugin`](./Tool/Loon/Plugin/TF_Network_Diagnostics.plugin)
  - Quản lý BoxJs: [`Tool/Loon/Plugin/BoxJs.plugin`](./Tool/Loon/Plugin/BoxJs.plugin)

---

### 🚀 2. Cách sử dụng trên Shadowrocket

- Xem hướng dẫn đầy đủ tại: [`Tool/Shadowrocket/README.md`](./Tool/Shadowrocket/README.md)
- **File Cấu Hình Trọn Gói:** [`Tool/Shadowrocket/Shadowrocket_All_In_One.conf`](./Tool/Shadowrocket/Shadowrocket_All_In_One.conf)
- **Trọn bộ Module lẻ (`.sgmodule`):**
  1. [`Tool/Shadowrocket/Auto_Join_TF.sgmodule`](./Tool/Shadowrocket/Auto_Join_TF.sgmodule)
  2. [`Tool/Shadowrocket/TF_Subscription_Manager.sgmodule`](./Tool/Shadowrocket/TF_Subscription_Manager.sgmodule)
  3. [`Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule`](./Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule)
  3. [`Tool/Shadowrocket/TF_Slot_Radar.sgmodule`](./Tool/Shadowrocket/TF_Slot_Radar.sgmodule)
  4. [`Tool/Shadowrocket/TF_Expiry_Monitor.sgmodule`](./Tool/Shadowrocket/TF_Expiry_Monitor.sgmodule)
  5. [`Tool/Shadowrocket/TF_Link_Helper.sgmodule`](./Tool/Shadowrocket/TF_Link_Helper.sgmodule)
  6. [`Tool/Shadowrocket/TF_Network_Diagnostics.sgmodule`](./Tool/Shadowrocket/TF_Network_Diagnostics.sgmodule)
  7. [`Tool/Shadowrocket/BoxJs.sgmodule`](./Tool/Shadowrocket/BoxJs.sgmodule)
- **Link đăng ký BoxJS (`http://boxjs.com`):**
  `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json`

---

### 🔬 3. Kiểm thử Động QA Chỉ Đọc Bằng Frida 17+ (Tùy chọn cho máy Jailbreak)

- Tệp kịch bản: [`Resource/Script/TestFlight/TF_Frida_Diagnostics.js`](./Resource/Script/TestFlight/TF_Frida_Diagnostics.js)
- Chạy lệnh: `frida -U -n TestFlight -l Resource/Script/TestFlight/TF_Frida_Diagnostics.js` *(100% chỉ đọc, tự che khóa phiên nhạy cảm)*.

---

### ⚡ 4. Surge 5, QuantumultX & Stash

- **Surge 5:** [`Tool/Surge5/Surge/AUTOTF.sgmodule`](./Tool/Surge5/Surge/AUTOTF.sgmodule) & [`Tool/Surge5/Surge/TestFlight.sgmodule`](./Tool/Surge5/Surge/TestFlight.sgmodule)
- **QuantumultX:** [`Tool/QuantumultX/code.txt`](./Tool/QuantumultX/code.txt)
- **Stash:** [`Tool/Stash/code.txt`](./Tool/Stash/code.txt)
