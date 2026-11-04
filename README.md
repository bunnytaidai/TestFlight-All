### 🚀 Script Auto Join TestFlight & Tự Động Đổi Nick Apple ID (`version.4.6.0.0`)
 * **Script By [Hely-T](https://github.com/Hely-T)** — Bản nâng cấp đồng bộ cho **Loon** & **Shadowrocket**
- **Link mục tiêu mặc định đã cấu hình sẵn:** **[Tham gia Google Chrome beta - TestFlight - Apple](https://testflight.apple.com/join/LPQmtkUs)** (Mã `APP_ID`: **`LPQmtkUs`**)
- Không sử dụng proxy cho `testflight.apple.com` (đã ép `DIRECT` tự động để bắt slot nhanh nhất và không bị lỗi mạng).
- Vui lòng cài **Certificate (Chứng chỉ CA)** và bật **Trust (Tin cậy chứng chỉ)** trong Cài đặt chung của máy trước khi sử dụng.
- **Tính năng mới (`v4.6.0.0`):**
  1. Tự động nạp sẵn mã **`LPQmtkUs` (Google Chrome beta)** ngay từ đầu — không cần nhập thủ công.
  2. Tự động lưu **nhiều tài khoản Apple ID (`Multi-Account Pool`)** khi mở TestFlight và **tự động xoay vòng đổi nick Apple ID** để đăng ký gói beta TestFlight cho tất cả các nick.
  3. Chạm vào **biểu tượng Tài khoản góc trên bên phải** trong ứng dụng TestFlight (`/v1/devices`) để **đổi nhanh sang nick Apple ID tiếp theo**.
  4. Tự động làm mới `ETag` và mở khóa gói cước VIP (`RevenueCat`, `GoodNotes 6`, `Notability`, `Picsart`, `CamScanner`, `Fantastical`, `Slidebox`, `Meitu`) mỗi khi đổi nick Apple ID.

---

### 🦅 1. Cách sử dụng trên Loon (Đã tối ưu All-In-One & Tự Đổi Nick Apple ID)

- **Cách 1 — Dùng File Cấu Hình Trọn Gói (`Loon_All_In_One.conf`):**
  - Nhập trực tiếp file cấu hình: [`Tool/Loon/Config/Loon_All_In_One.conf`](./Tool/Loon/Config/Loon_All_In_One.conf) (`https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Config/Loon_All_In_One.conf`)
  - Bật **MitM** và **MitM qua HTTP/2** ➔ Bật VPN Loon ➔ Mở ứng dụng **TestFlight**. Hệ thống tự lấy Token và tự động săn ngay **Google Chrome beta (`LPQmtkUs`)**!

- **Cách 2 — Nhập Plugin lẻ trên Loon:**
  - **Plugin Tự động vào Google Chrome beta (`LPQmtkUs`) & Đổi Nick Apple ID:**
    `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/Auto_Join_TF.plugin` *(hoặc [`Auto_Join_TF.plugin`](./Auto_Join_TF.plugin) ở thư mục gốc)*
  - **Plugin Đa Tài Khoản TestFlight + Mở Khóa Thiết Bị + Tải Nhanh CDN:**
    `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/TestFlight.plugin`
  - **Plugin Mở Khóa Gói Đăng Ký VIP Khi Đổi Nick Apple ID:**
    `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/Auto_Subscription_Unlock.plugin`
  - **Plugin BoxJs Quản Lý Đa Tài Khoản (`http://boxjs.com`):**
    `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/BoxJs.plugin`

---

### 🚀 2. Cách sử dụng trên Shadowrocket (Đã tối ưu All-In-One & Tự Đổi Nick Apple ID)

- **Xem hướng dẫn chi tiết tại:** [`Tool/Shadowrocket/README.md`](./Tool/Shadowrocket/README.md)
- **Cách 1 — Dùng File Cấu Hình Trọn Gói (`Shadowrocket_All_In_One.conf`):**
  - Nhập file [`Tool/Shadowrocket/Shadowrocket_All_In_One.conf`](./Tool/Shadowrocket/Shadowrocket_All_In_One.conf) vào tab `Config` của Shadowrocket ➔ Bật **HTTPS Decryption (Giải mã HTTPS)** ➔ Bật VPN và mở app **TestFlight**.
- **Cách 2 — Thêm các Module `.sgmodule` vào tab `Module` của Shadowrocket:**
  1. **Tự động vào Google Chrome beta (`LPQmtkUs`) & Xoay vòng Apple ID:** [`Tool/Shadowrocket/Auto_Join_TF.sgmodule`](./Tool/Shadowrocket/Auto_Join_TF.sgmodule)
  2. **Đa tài khoản Apple ID & Đổi nick 1 chạm (`/v1/devices`):** [`Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule`](./Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule)
  3. **Tự động đổi nick Apple ID đăng ký gói VIP (Subscription Unlock):** [`Tool/Shadowrocket/Auto_Subscription_Unlock.sgmodule`](./Tool/Shadowrocket/Auto_Subscription_Unlock.sgmodule)
  4. **Quản lý BoxJS (`http://boxjs.com`):** [`Tool/Shadowrocket/BoxJs.sgmodule`](./Tool/Shadowrocket/BoxJs.sgmodule)
- **Link đăng ký BoxJS (`Subscriptions` trên `http://boxjs.com`):**
  `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json`

---

### ⚡ 3. Cách sử dụng Surge 5

- Vào MitM - Chọn Hostname -> add: `testflight.apple.com` -> Done
- Vào **Code [Click vào đây](https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Surge5/Code.txt)** hoặc thêm trực tiếp module [`Tool/Surge5/Surge/AUTOTF.sgmodule`](./Tool/Surge5/Surge/AUTOTF.sgmodule) và [`Tool/Surge5/Surge/TestFlight.sgmodule`](./Tool/Surge5/Surge/TestFlight.sgmodule).
- Mặc định `APP_ID` đã được điền sẵn `LPQmtkUs` (Google Chrome beta).

---

### 🌐 4. Cách sử dụng QuantumultX & Stash

- **QuantumultX:** Xem câu lệnh tại [`Tool/QuantumultX/code.txt`](./Tool/QuantumultX/code.txt)
- **Stash:** Xem câu lệnh tại [`Tool/Stash/code.txt`](./Tool/Stash/code.txt)
