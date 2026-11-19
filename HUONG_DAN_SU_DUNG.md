# 📘 HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG CHI TIẾT — TESTFLIGHT ALL-IN-ONE (`version.5.6.0.0`)

> **Tối ưu chuyên sâu cho:** iPhone chip A9 (`iPhone 6s / 6s Plus / SE 1`) chạy **iOS 15.8.8 Rootless (`/var/jb`) + Tweak `SSL Kill Switch 3`** trên **Loon** *(ưu tiên mạnh nhất)* và **Shadowrocket**.

---

## 1. BẢN ĐỒ GẮN FILE CHÍNH XÁC — FILE NÀO GẮN VÀO MỤC NÀO?

> [!IMPORTANT]
> **Nguyên tắc chống xung đột MITM:** Nếu bạn dùng trung tâm chính **`TF_MultiAccount_Hub v2.1.0.0`**, hãy **TẮT** các plugin/module TestFlight rời cũ *(như `TestFlight.plugin`, `Auto_Join_TF.plugin`, `TF_Subscription_Manager.plugin`, `iRingo`, `NobyDa`)* vì Hub v2.1.0.0 đã gộp toàn bộ chức năng vào cùng 1 lõi duy nhất.

### 🦅 A. Bản đồ gắn file cho **LOON** *(Khuyên dùng mạnh nhất)*

| Tệp trong repo | Link Raw GitHub để Copy dán | Gắn vào đúng mục nào trong App Loon? | Bắt buộc? |
| :--- | :--- | :--- | :---: |
| **`TF_MultiAccount_Hub.plugin`** *(v2.1.0.0 — Trung tâm 4 Tab)* | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/TF_MultiAccount_Hub.plugin` | **Cấu hình (`Config`) ➔ Tiện ích (`Plugins`) ➔ bấm dấu `+` góc phải ➔ dán Link ➔ Lưu & Bật công tắc xanh** | 🟢 **Bắt buộc (Chính)** |
| **`BoxJs.plugin`** *(tùy chọn nếu muốn thêm giao diện BoxJs)* | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Plugin/BoxJs.plugin` | **Cấu hình (`Config`) ➔ Tiện ích (`Plugins`) ➔ dấu `+` ➔ dán Link ➔ Bật** | 🟡 Tùy chọn *(vì Hub đã có sẵn Web UI tại `http://tf-hub.test/`)* |
| **`boxjs.json`** *(danh sách đăng ký BoxJs)* | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json` | Mở Safari vào `http://boxjs.com` ➔ mục **Đăng ký (`Subscribe`)** ➔ dấu `+` ➔ dán Link | 🟡 Tùy chọn |
| **`Loon_All_In_One.conf`** *(nếu muốn nạp trọn bộ cấu hình mẫu)* | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Config/Loon_All_In_One.conf` | **Cấu hình (`Config`) ➔ Quản lý cấu hình ➔ Nhập từ URL (`Import from URL`)** | ⚪ Chỉ dùng khi chưa có Config Loon riêng |
| **`Tool/Loon/Rule/*.list`** *(Rule định tuyến Apple)* | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Loon/Rule/<tên>.list` | **Cấu hình (`Config`) ➔ Quy tắc (`Rules`) ➔ Quy tắc từ xa (`Remote Rules`)** *(đã tự tích hợp sẵn trong `Loon_All_In_One.conf`)* | ⚪ Không cần gắn lẻ nếu đã bật Hub Plugin |

<br>

### 🚀 B. Bản đồ gắn file cho **SHADOWROCKET**

| Tệp trong repo | Link Raw GitHub để Copy dán | Gắn vào đúng mục nào trong App Shadowrocket? | Bắt buộc? |
| :--- | :--- | :--- | :---: |
| **`TF_MultiAccount_Hub.sgmodule`** *(v2.1.0.0 — Trung tâm 4 Tab)* | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/TF_MultiAccount_Hub.sgmodule` | **Cấu hình (`Config`) ➔ Mô-đun (`Modules`) ➔ bấm dấu `+` góc phải ➔ dán Link ➔ Tải về & Tích chọn bật** | 🟢 **Bắt buộc (Chính)** |
| **`BoxJs.sgmodule`** | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/BoxJs.sgmodule` | **Cấu hình (`Config`) ➔ Mô-đun (`Modules`) ➔ dấu `+` ➔ dán Link ➔ Bật** | 🟡 Tùy chọn |
| **`boxjs.json`** | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/boxjs.json` | Safari ➔ `http://boxjs.com` ➔ **Đăng ký (`Subscribe`)** ➔ dấu `+` ➔ dán Link | 🟡 Tùy chọn |
| **`Shadowrocket_All_In_One.conf`** | `https://raw.githubusercontent.com/bunnytaidai/TestFlight-All/master/Tool/Shadowrocket/Shadowrocket_All_In_One.conf` | **Cấu hình (`Config`) ➔ dấu `+` góc phải trên ➔ dán Link ➔ Tải về ➔ bấm vào file chọn *Sử dụng cấu hình (`Use Config`)*** | ⚪ Chỉ dùng khi chưa có Config Shadowrocket riêng |

> [!NOTE]
> Các tệp `.js` nằm trong `Resource/Script/TestFlight/` **KHÔNG cần tự gắn thủ công** — chúng đã được các tệp `.plugin` (Loon) và `.sgmodule` (Shadowrocket) tự động gọi qua `script-path`.

---

## 2. QUY TRÌNH CÀI ĐẶT TỪ A–Z TRÊN A9 iOS 15.8.8 (`SSL KILL SWITCH 3`)

### Bước 1 — Bật giải mã HTTPS (`MITM`) & Chứng chỉ CA
1. **Trên thiết bị Jailbreak iOS 15.8.8:** Đảm bảo Tweak **`SSL Kill Switch 3`** đã bật cho ứng dụng **TestFlight** *(và các app Beta cần theo dõi gói Sandbox)*.
2. **Trên Loon:**
   - Vào **Cấu hình (`Config`) ➔ `MITM`** ➔ Bật công tắc **`MITM`**.
   - Bấm **Tạo chứng chỉ CA mới (`Generate CA`)** ➔ **Cài đặt chứng chỉ (`Install Certificate`)**.
   - Vào **Cài đặt iOS ➔ Đã tải về hồ sơ (`Profile Downloaded`)** ➔ Cài đặt.
   - Vào **Cài đặt iOS ➔ Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ (`Certificate Trust Settings`)** ➔ Gạt **BẬT** cho chứng chỉ Loon.
3. **Trên Shadowrocket:**
   - Vào **Cấu hình (`Config`) ➔ bấm chữ `i` ở file `.conf` đang dùng ➔ Giải mã HTTPS (`HTTPS Decryption`)** ➔ Gạt **BẬT** ➔ **Tạo chứng chỉ CA mới** ➔ Cài hồ sơ & Tin cậy chứng chỉ trong Cài đặt iOS giống bước trên.

### Bước 2 — Gắn Plugin / Module Chính & Cấu hình nhanh trên Loon
1. Gắn **`TF_MultiAccount_Hub.plugin`** *(Loon)* hoặc **`TF_MultiAccount_Hub.sgmodule`** *(Shadowrocket)* theo đúng bảng ở **Mục 1**.
2. **Riêng trên Loon (tính năng `[Argument]` nâng cao):** Bấm thẳng vào tên plugin **`✈️ TF Multi-Account Hub v2.1.0.0`** trong mục *Plugins* để chỉnh nhanh trực tiếp 5 tham số ngay trên giao diện Loon:
   - `HUB_MODE`: `MERGE` *(gộp app mọi nick)* hoặc `PIN` *(khóa 1 nick cố định)*
   - `HUB_COUNTRY`: `US` *(hoặc `VN`, `JP`, `SG`, ...)*
   - `HUB_KEEPALIVE`: `30` *(phút ping nuôi token)*
   - `HUB_AUTO_JOIN`: `true` *(tự động săn & `POST /accept` link `OPEN`)*
   - `HUB_AUTO_UPDATE`: `true` *(tự phát hiện build mới & replay `POST /install`)*
3. Bật kết nối VPN của Loon / Shadowrocket.

### Bước 3 — Nạp Kho Nhiều Nick Apple ID *(Tránh bị hỏi 2FA lại)*
1. Đăng nhập **Apple ID thứ 1** trên máy ➔ mở ứng dụng **TestFlight** và kéo làm mới danh sách 1 lần.
2. Khi thấy thông báo **`TF Hub v2.1 — Đã Chụp Nick Mới`**, Hub đã tự động lưu trọn bộ tham số phiên & thiết bị (`accountId` UUID, `x-session-id`, `x-request-id`, `x-session-digest`, `x-dsid`, `x-apple-i-md*`, `deviceId`, `storefrontId`, `User-Agent`).
3. Lặp lại cho **Apple ID thứ 2, thứ 3...** Sau khi chụp xong, **không cần đăng xuất/đăng nhập lại** — Hub sẽ tự replay đúng bộ fingerprint thiết bị khi chạy ngầm để hạn chế tối đa việc bị Apple thu hồi phiên hoặc yêu cầu 2FA lại.

---

## 3. HƯỚNG DẪN SỬ DỤNG 4 TAB TRÊN GIAO DIỆN WEB (`http://tf-hub.test/`)

Mở **Safari** trên iPhone (khi đang bật Loon/Shadowrocket) và truy cập: **`http://tf-hub.test/`**

| Tab | Chức năng chi tiết | Thao tác chính |
| :--- | :--- | :--- |
| **Tab 1: `🔗 Link TF`** | Quản lý Thêm / Sửa / Xóa & tự động kiểm tra trạng thái Link TestFlight | Dán 1 hoặc nhiều link/mã vào ô nhập ➔ bấm **💾 Thêm & Lưu Link** ➔ bấm **🔍 Quét Trạng Thái Tất Cả** (`OPEN`/`FULL`/`CLOSED`) ➔ bấm **🎯 Tự Tham Gia Toàn Bộ Link OPEN** *(hoặc bấm nút bắn từng link)*. |
| **Tab 2: `👥 Nick & API`** | Quản lý Kho Apple ID, xem đủ tham số Token/Fingerprint (`FP x/7`) & điều khiển API Replay | Xem toàn bộ `accountId` + 3 Token + `DSID`/`Device`/`MD`; bấm **💓 Ping Nuôi & Quét Cập Nhật Toàn Bộ**; bấm **⬇️ Replay `/install`** cho từng app; chuyển `MERGE`/`PIN`; bật/tắt **Lách iOS cũ**, **Ép nút Cài**, **Auto-Join**, **Auto Cập nhật**. |
| **Tab 3: `💳 Sandbox`** | Kiểm tra & quản lý riêng gói đăng ký kiểm thử **Sandbox TestFlight** (StoreKit 1 & 2) theo từng Apple ID | Bấm **🔄 Quét & Kiểm Tra Gia Hạn Sandbox** *(tự replay `verifyReceipt`)*; bấm **🧪 Tài Khoản Sandbox (Cài Đặt iOS)** (`App-Prefs:root=STORE` ➔ App Store ➔ Tài khoản Sandbox) hoặc **🌐 Cổng Quản Lý Sandbox Apple**; tích **☆ Bật nhắc gia hạn** *(Watchlist)*. |
| **Tab 4: `📊 Log`** | Bảng kiểm tra trạng thái hoạt động & kết quả từng hành động của Tool | Lọc theo **`OK` / `WARN` / `ERR`**; xem rõ giờ chạy, tên hành động (`PING_SYNC`, `CHECK_LINK`, `ACCEPT_API`, `INSTALL_API`, `MERGE_LIST`, `SANDBOX_RO`), mã HTTP và độ trễ (`ms`). |

---

## 4. GIẢI NGHĨA NHANH BẢNG LOG & XỬ LÝ SỰ CỐ THƯỜNG GẶP

| Mã HTTP / Trạng thái trong Tab `📊 Log` | Ý nghĩa thực tế | Cách xử lý |
| :--- | :--- | :--- |
| **`200` (`OK`)** | API thành công *(Token sống, tham gia thành công hoặc gửi `/install` thành công)* | Hoạt động bình thường. |
| **`401` (`ERR`)** | Phiên `X-Session-Digest` của nick đó đã bị Apple thu hồi *(hết hạn)* | Mở app TestFlight bằng đúng nick báo `401` kéo làm mới 1 lần để Hub tự nạp đè token mới *(Hub không tự xóa nick)*. |
| **`429` (`WARN`)** | Gửi request quá nhanh, Apple tạm giới hạn tần suất | Tăng `Ping (phút)` lên `30–60` phút và chờ vài phút trước khi quét lại. |
| **Không mở được `http://tf-hub.test/`** | VPN chưa bật hoặc Loon thiếu `force-http-engine-hosts` | Kiểm tra VPN đã bật, gõ đúng `http://` *(không phải `https://`)* và đảm bảo không bật trùng plugin cũ. |
