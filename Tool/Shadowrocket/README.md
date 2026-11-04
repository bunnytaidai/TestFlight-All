# 🚀 Hướng Dẫn Sử Dụng Trên Shadowrocket & Loon (Tự Động Vào Google Chrome Beta `LPQmtkUs` & Tự Động Đổi Nick Apple ID Đăng Ký Gói — `version.4.6.0.0`)

Thư mục `Tool/Shadowrocket` và `Tool/Loon` chứa trọn bộ **Cấu hình All-In-One (`.conf`)**, **Module (`.sgmodule`)**, **Plugin (`.plugin`)** và **Script (`.js`)** đã được nâng cấp toàn diện cho **Shadowrocket** và **Loon**:
1. **Tích hợp sẵn mục tiêu mặc định:** **[Tham gia Google Chrome beta - TestFlight - Apple](https://testflight.apple.com/join/LPQmtkUs)** (Mã `APP_ID = LPQmtkUs`). Không cần nhập tay, chỉ cần mở app TestFlight là tự động canh và vào ngay!
2. **Tự động lưu & xoay vòng đổi nick Apple ID (`Multi-Account Apple ID Pool`):**
   - Mỗi khi bạn đăng nhập một tài khoản Apple ID mới vào TestFlight, hệ thống tự động gom và lưu Token vào kho đa tài khoản (`TF_ACCOUNTS` + `chavy_boxjs_sessions` + `iRingo.TestFlight.Caches`).
   - Khi chạy ngầm (`Cron`), script tự động xoay vòng qua **tất cả các nick Apple ID** đã lưu để đăng ký gói beta **Google Chrome beta (`LPQmtkUs`)** cho từng nick.
   - Bấm vào **biểu tượng Tài khoản (góc trên bên phải)** trong ứng dụng TestFlight (`/v1/devices`) để **tự động đổi sang nick Apple ID tiếp theo** ngay lập tức mà không cần đăng nhập lại!
3. **Tự động đổi nick Apple ID đăng ký gói VIP (`Auto Subscription / RevenueCat Unlock`):** Tự động xóa `X-RevenueCat-ETag` & `If-None-Match` khi đổi nick Apple ID để chống lỗi `304 Not Modified`, giúp kích hoạt gói VIP/Pro hạn tới năm `2099` cho mọi nick Apple ID.

---

## 📂 Danh Sách Tệp Cấu Hình Cho Shadowrocket & Loon

| Nền Tảng | Tên Tệp | Chức Năng Chính |
| :--- | :--- | :--- |
| **Shadowrocket** | [`Shadowrocket_All_In_One.conf`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Shadowrocket_All_In_One.conf) | **File Cấu Hình Trọn Gói (All-In-One):** Gộp sẵn `DIRECT` rule, tự vào `LPQmtkUs`, tự đổi nick Apple ID, BoxJS và mở khóa gói VIP. |
| **Shadowrocket** | [`Auto_Join_TF.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Auto_Join_TF.sgmodule) | **Module Tự Động Vào Google Chrome Beta (`LPQmtkUs`) & Xoay Vòng Apple ID:** Chạy ngầm mỗi giây để săn slot cho toàn bộ các nick Apple ID. |
| **Shadowrocket** | [`TestFlight_Unlock_Multi.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule) | **Module Đa Tài Khoản & Mở Khóa Thiết Bị:** Tự động đổi nick khi bấm icon Tài khoản (`/v1/devices`), vượt giới hạn iOS/iPadOS/macOS và tải nhanh CDN. |
| **Shadowrocket** | [`Auto_Subscription_Unlock.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Auto_Subscription_Unlock.sgmodule) | **Module Mở Khóa Gói Đăng Ký VIP Khi Đổi Nick Apple ID:** Hỗ trợ RevenueCat, GoodNotes 6, Notability, Picsart, CamScanner, Fantastical, Slidebox, Meitu. |
| **Loon** | [`Loon_All_In_One.conf`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Config/Loon_All_In_One.conf) | **File Cấu Hình Loon Trọn Gói (All-In-One):** Đầy đủ tự động vào `LPQmtkUs`, tự đổi nick Apple ID, BoxJs và mở khóa gói VIP. |
| **Loon** | [`Auto_Join_TF.plugin`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Plugin/Auto_Join_TF.plugin) | **Plugin Tự Động Vào Google Chrome Beta (`LPQmtkUs`) & Đổi Nick Apple ID** chuẩn hóa cho Loon (`DIRECT`). |
| **Loon** | [`TestFlight.plugin`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Plugin/TestFlight.plugin) | **Plugin Đa Tài Khoản Apple ID + Tự Vào `LPQmtkUs` + Tải Nhanh CDN** cho Loon. |
| **Loon** | [`Auto_Subscription_Unlock.plugin`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Plugin/Auto_Subscription_Unlock.plugin) | **Plugin Mở Khóa Gói Đăng Ký VIP Khi Đổi Nick Apple ID** cho Loon. |

---

## 🛠️ PHẦN 1: BƯỚC CHUẨN BỊ BẮT BUỘC (BẬT GIẢI MÃ HTTPS / MITM & HTTP/2)

1. **Trên Shadowrocket:**
   - Mở **Shadowrocket** ➔ Tab **Cấu hình (`Config`)** ➔ Nhấn chữ **`i`** cạnh cấu hình đang dùng ➔ Chọn **Giải mã HTTPS (`HTTPS Decryption`)**.
   - Bật **Giải mã HTTPS**, chọn **Tạo chứng chỉ CA mới (`Generate New CA Certificate`)** ➔ **Cài đặt chứng chỉ (`Install Certificate`)**.
   - Vào **Cài đặt iOS ➔ Đã tải về hồ sơ ➔ Cài đặt**, sau đó vào **Cài đặt chung ➔ Giới thiệu ➔ Cài đặt tin cậy chứng chỉ (`Certificate Trust Settings`)** ➔ Bật xanh chứng chỉ Shadowrocket.
2. **Trên Loon:**
   - Mở **Loon** ➔ Tab **Cấu hình (`Profile`)** ➔ Mục **MITM** ➔ Nhấn **Cài đặt chứng chỉ (`CA Certificate`)** và bật tin cậy chứng chỉ trong Cài đặt iOS.
   - Bật công tắc **MITM** và **MITM over HTTP/2**.

---

## ✈️ PHẦN 2: CÁCH TỰ ĐỘNG VÀO GOOGLE CHROME BETA (`LPQmtkUs`) & TỰ ĐỔI NICK APPLE ID

### Bước 1: Nạp Cấu hình hoặc Module/Plugin
- **Cách nhanh nhất (Khuyên dùng):** Nhập trực tiếp file [`Shadowrocket_All_In_One.conf`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Shadowrocket_All_In_One.conf) (cho Shadowrocket) hoặc [`Loon_All_In_One.conf`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Config/Loon_All_In_One.conf) (cho Loon).
- **Hoặc cài theo Module/Plugin lẻ:**
  - Trên **Shadowrocket**: Thêm [`Auto_Join_TF.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Auto_Join_TF.sgmodule) + [`TestFlight_Unlock_Multi.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/TestFlight_Unlock_Multi.sgmodule) + [`Auto_Subscription_Unlock.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Auto_Subscription_Unlock.sgmodule).
  - Trên **Loon**: Thêm [`TestFlight.plugin`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Plugin/TestFlight.plugin) + [`Auto_Subscription_Unlock.plugin`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Plugin/Auto_Subscription_Unlock.plugin).

### Bước 2: Tự động gom nhiều nick Apple ID & Tự động vào Google Chrome beta (`LPQmtkUs`)
1. Bật VPN trên **Loon** hoặc **Shadowrocket**.
2. Mở ứng dụng **TestFlight** trên iPhone:
   - Hệ thống tự động bắt Token của tài khoản Apple ID thứ nhất, lưu vào kho **`TF_ACCOUNTS` (`Nick Apple ID #1`)** và tự động nạp sẵn mã **`LPQmtkUs`** (**[Tham gia Google Chrome beta - TestFlight - Apple](https://testflight.apple.com/join/LPQmtkUs)**).
3. Nếu bạn muốn thêm nhiều nick Apple ID vào kho tự động:
   - Đăng nhập nick Apple ID thứ 2, thứ 3... vào Media & Mục mua / TestFlight ➔ Mở app TestFlight. Hệ thống tự động cộng dồn vào danh sách (`Nick Apple ID #2`, `Nick Apple ID #3`...).
4. **Cách hoạt động của chế độ Tự Động Đổi Nick Apple ID:**
   - **Tự động xoay vòng ngầm (`Cron` mỗi giây):** Script tự động đổi lần lượt qua từng nick Apple ID trong kho để gửi yêu cầu tham gia gói **Google Chrome beta (`LPQmtkUs`)** cho đến khi tất cả các nick đều nhận được slot!
   - **Đổi nick 1 chạm trong app TestFlight:** Bất kỳ lúc nào bạn mở app TestFlight và chạm vào **biểu tượng Tài khoản (ở góc trên bên phải màn hình)**, đường dẫn `/v1/devices` sẽ kích hoạt bộ chuyển đổi đổi ngay sang nick Apple ID tiếp theo và thông báo tên nick đang dùng!

---

## 💎 PHẦN 3: TỰ ĐỘNG ĐỔI NICK APPLE ID ĐĂNG KÝ GÓI VIP (`SUBSCRIPTION UNLOCK`)

Khi bạn đổi sang bất kỳ nick Apple ID nào trên máy để tải ứng dụng và đăng ký gói VIP:
1. Đảm bảo đã bật [`Auto_Subscription_Unlock.sgmodule`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Shadowrocket/Auto_Subscription_Unlock.sgmodule) (Shadowrocket) hoặc [`Auto_Subscription_Unlock.plugin`](file:///c:/Users/Antidv/Desktop/testflight-all/Tool/Loon/Plugin/Auto_Subscription_Unlock.plugin) (Loon).
2. Mở ứng dụng cần đăng ký gói (**GoodNotes 6, Notability, Picsart, CamScanner, Fantastical, Slidebox, Meitu** hoặc bất kỳ ứng dụng nào dùng **RevenueCat**).
3. Nhấn **Khôi phục giao dịch mua (`Restore Purchases`)**:
   - Pha `http-request` tự động xóa `X-RevenueCat-ETag` & `If-None-Match` của nick cũ để làm mới phiên.
   - Pha `http-response` tự động cấp quyền `PURCHASED` / `active` (hết hạn `2099-12-31`) cho đúng tài khoản Apple ID mới vừa chuyển sang!
