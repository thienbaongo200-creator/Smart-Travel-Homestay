# Hệ thống đặt phòng Homestay kèm cho thuê xe — Quản lý lịch & giá động

Đồ án môn **Thương mại Điện tử**. Nền tảng marketplace kết nối **khách du lịch**, **chủ homestay** và **chủ xe**: khách tìm phòng theo địa điểm/ngày, xem giá chi tiết từng ngày, thuê xe kèm trong cùng đơn, giữ chỗ và đặt cọc; chủ nhà/chủ xe xác nhận đơn và quản lý lịch, giá.

---

## 1. Công nghệ

| Lớp | Công nghệ |
|---|---|
| Backend | Python, Django 5, Django REST Framework |
| Cơ sở dữ liệu | PostgreSQL 16 (`DateRangeField`, `ExclusionConstraint`, extension `btree_gist`) |
| Xác thực | JWT (djangorestframework-simplejwt), phân quyền theo vai trò |
| Frontend | React 18, Vite, React Router, Tailwind CSS |
| Bản đồ | Leaflet + react-leaflet (tile CARTO/OpenStreetMap) |
| Hạ tầng dev | Docker Compose (PostgreSQL) |

## 2. Cấu trúc thư mục

```
homestay_project/
├── docker-compose.yml          # PostgreSQL
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/                 # settings, urls
│   └── apps/
│       ├── accounts/           # User + vai trò, đăng ký, JWT
│       ├── listings/           # Homestay, Room, Vehicle
│       ├── pricing/            # PricingRule + engine giá động
│       ├── bookings/           # Lịch, đặt phòng, thanh toán, tìm kiếm
│       └── host/               # API cổng quản lý của chủ nhà/chủ xe
└── frontend/
    └── src/
        ├── pages/              # Tìm kiếm, chi tiết phòng, đơn của tôi, đăng nhập
        ├── pages/host/         # Host Portal
        └── components/         # Calendar, MapView, QuoteTable, Countdown
```

## 3. Các vai trò (Actor)

| Vai trò | Mã | Quyền chính |
|---|---|---|
| Khách hàng | `CUSTOMER` | Tìm phòng, xem giá, đặt phòng + xe, đặt cọc, theo dõi đơn của mình |
| Chủ homestay | `HOST` | Đăng homestay/phòng, cấu hình giá động, chặn lịch, xác nhận/từ chối đơn, xem thống kê |
| Chủ xe | `VEHICLE_OWNER` | Đăng xe, cấu hình giá/combo, xem lịch xe, xác nhận/từ chối đơn thuê xe |
| Quản trị | `ADMIN` | Duyệt tin đăng, quản lý người dùng (qua Django Admin) |

Đăng ký tự do chỉ cho phép `CUSTOMER`, `HOST`, `VEHICLE_OWNER`; vai trò `ADMIN` không thể tự chọn để tránh leo thang đặc quyền.

---

## 4. Chức năng đã hoàn thành

### 4.1. Tài khoản & phân quyền
- Đăng ký / đăng nhập, mật khẩu được băm (không lưu văn bản thuần), mật khẩu tối thiểu 6 ký tự, email không trùng.
- JWT access/refresh; frontend tự làm mới token khi hết hạn.
- Mọi API quản lý đều kiểm tra vai trò và quyền sở hữu tài nguyên.

### 4.2. Dành cho khách hàng
- **Tìm kiếm homestay** theo địa điểm, ngày nhận/trả, số khách. Chỉ trả về phòng đã được duyệt, còn trống toàn bộ kỳ và đủ sức chứa.
- **Bản đồ tương tác** (Leaflet): ghim hiển thị giá, gom các phòng cùng tọa độ vào một ghim, di chuột vào thẻ phòng thì ghim sáng lên.
- **Trang chi tiết phòng** với lịch chọn ngày trực quan (ngày đã kín bị tô đỏ, không chọn được).
- **Bảng giá chi tiết từng ngày**: mỗi đêm hiển thị rõ các hệ số áp dụng (cuối tuần/lễ/mùa, lấp đầy, đặt sớm/sát ngày) và tổng tiền, tiền cọc.
- **Gợi ý và thuê xe kèm**: chỉ hiện xe còn trống trong toàn bộ kỳ lưu trú; chọn xe sẽ cập nhật giá và giảm giá combo ngay.
- **Giữ chỗ và đặt cọc**: tạo đơn ở trạng thái `HOLD`, đếm ngược 15 phút, thanh toán cọc giả lập (thành công/thất bại).
- **Đơn của tôi**: danh sách đơn, trạng thái, đếm ngược giữ chỗ. Khách chỉ xem được đơn của chính mình.

### 4.3. Dành cho chủ homestay (Host Portal — `/host`)
| Tab | Chức năng |
|---|---|
| Tổng quan | Doanh thu, số đơn đã xác nhận, đơn đang chờ, tỷ lệ lấp đầy 30 ngày tới, biểu đồ doanh thu theo tháng, thống kê đơn theo trạng thái |
| Homestay & phòng | Đăng homestay (chờ admin duyệt), thêm/xóa/bật-tắt phòng, nhập tọa độ để hiện trên bản đồ |
| Lịch phòng | Xem đơn và khóa sắp tới, **chặn lịch thủ công** (bảo trì/không cho thuê), mở lại lịch |
| Giá động | Thêm/bật-tắt/xóa quy tắc giá cho từng homestay |
| Đơn đặt | Danh sách đơn kèm thông tin khách; **Xác nhận** hoặc **Từ chối** (kèm lý do) |

### 4.4. Dành cho chủ xe
- Đăng xe với thông tin: tên, loại (xe máy/ô tô), hộp số (số tự động/số sàn), phân khối, số chỗ, giá/ngày, thành phố; tin chờ admin duyệt.
- Cấu hình giá xe và **quy tắc combo** (giảm giá xe khi khách ở từ N đêm).
- Xem lịch xe (chỉ xem — lịch xe thay đổi thông qua đơn đặt, đúng quy định nghiệp vụ).
- Xác nhận/từ chối đơn thuê xe độc lập với chủ phòng.

### 4.5. Dành cho quản trị
- Django Admin: duyệt/từ chối tin homestay và xe (action "Duyệt tin đã chọn"), quản lý tài khoản, xem booking, lịch và thanh toán.

---

## 5. Thuật toán & cơ chế cốt lõi

### 5.1. Chống đặt trùng (Overbooking) ở cấp cơ sở dữ liệu

Lịch được lưu trong bảng `CalendarSlot` với cột `period` kiểu `daterange` theo quy ước `[check_in, check_out)` (đêm trả phòng không bị tính, nên khách sau có thể nhận phòng đúng ngày khách trước trả).

Hai ràng buộc `EXCLUDE USING gist` của PostgreSQL:

```
no_room_overlap     : (room_id WITH =, period WITH &&)    WHERE status IN (HOLD, PENDING, CONFIRMED, CHECKED_IN, BLOCKED)
no_vehicle_overlap  : (vehicle_id WITH =, period WITH &&) WHERE status IN (HOLD, PENDING, CONFIRMED, CHECKED_IN, BLOCKED)
```

Kết quả: hai request đồng thời cùng đặt một phòng/xe trong khoảng ngày giao nhau thì chỉ một request thành công, request còn lại nhận `IntegrityError` và API trả **HTTP 409**. Đảm bảo nhất quán do chính CSDL thực thi, không phụ thuộc vào logic ứng dụng hay khóa ngoài (Redis).

### 5.2. Vòng đời trạng thái và giữ chỗ tạm (Hold)

```
Khách tạo đơn ──► HOLD (giữ 15 phút, khách thanh toán cọc)
                   │ thanh toán thành công                │ thất bại / hết hạn
                   ▼                                      ▼
                PENDING (chờ chủ xác nhận)             CANCELLED / EXPIRED  → nhả lịch
                   │ chủ xác nhận           │ chủ từ chối
                   ▼                        ▼
               CONFIRMED                 CANCELLED / REJECTED → nhả lịch
```

- Thời gian giữ chỗ cấu hình bằng `HOLD_MINUTES` (mặc định 15).
- Hold hết hạn không bao giờ chặn khách khác: mọi truy vấn lịch đều loại trừ `HOLD` có `expires_at <= now`. Hold quá hạn được dọn lười (lazy) mỗi lần tạo đơn và bằng lệnh `python manage.py expire_holds` (chạy định kỳ bằng cron).
- Slot lịch có thêm trạng thái `BLOCKED` (chủ chặn thủ công), `CHECKED_IN`, `CHECKED_OUT` theo yêu cầu thiết kế.
- Đơn gồm nhiều mục (phòng + xe); mỗi mục có slot và được xác nhận bởi đúng chủ của nó. Nếu chủ phòng từ chối thì cả đơn bị hủy; nếu chỉ xe bị từ chối thì phòng vẫn giữ.

### 5.3. Dynamic Pricing Engine

```
price(d)       = round_1000( base × day_factor(d) × occupancy_factor(d) × lead_factor )
day_factor(d)  = max(weekend(d), holiday(d)) × season(d)
total          = Σ giá phòng + Σ giá xe − giảm giá combo
combo_discount = subtotal_xe × (1 − hệ số combo)      nếu số đêm ≥ N
deposit        = round_1000( total × DEPOSIT_RATE )   (mặc định 30%)
```

| Loại quy tắc | Cách áp dụng |
|---|---|
| `WEEKEND` | Đêm thứ 6, 7, Chủ nhật nhân hệ số (≥ 1.0) |
| `HOLIDAY` | Ngày nằm trong khoảng lễ/Tết nhân hệ số (≥ 1.0); trùng cuối tuần thì lấy hệ số cao hơn |
| `SEASON` | Mùa cao/thấp điểm theo khoảng ngày (có thể < 1 cho mùa thấp điểm) |
| `OCCUPANCY` | Theo tỷ lệ lấp đầy của ngày đó: ngưỡng cao nhất thỏa mãn được chọn (VD ≥70% → ×1.1, ≥80% → ×1.2) |
| `LEAD_TIME` | Theo số ngày từ hôm nay đến ngày nhận phòng (VD ≥30 ngày → ×0.95; 0–1 ngày → ×1.10) |
| `COMBO` | Giảm giá xe khi thuê kèm phòng từ N đêm (VD ×0.9) |

- Rule có phạm vi: toàn hệ thống (mặc định) hoặc riêng từng homestay/xe; chủ có thể bật/tắt từng rule.
- Tính bằng `Decimal`, làm tròn đến 1.000₫.
- Công suất phòng = số phòng đã có đơn/khóa ÷ tổng số phòng đang hoạt động của homestay trong ngày đó; công suất xe tính theo nhóm cùng loại và cùng thành phố.

**Ví dụ:** Phòng A giá gốc 500.000₫, cuối tuần ×1.2. Khách ở 3 đêm Thứ 6 → Chủ nhật và thuê xe máy 150.000₫/ngày, combo −10% từ 3 đêm:

| Hạng mục | Tính | Thành tiền |
|---|---|---|
| Phòng | 500.000 × 1.2 × 3 | 1.800.000₫ |
| Xe máy | 150.000 × 3 | 450.000₫ |
| Giảm combo | −10% × 450.000 | −45.000₫ |
| **Tổng** | | **2.205.000₫** |
| Đặt cọc 30% | | 661.500₫ |

### 5.4. Thanh toán (mức mô phỏng)
- `POST /bookings/{code}/pay/` tạo giao dịch (`Payment`) với `txn_ref` duy nhất.
- Webhook `POST /payments/webhook/` kiểm tra chữ ký **HMAC-SHA256** trên raw body; xử lý **idempotent** (gọi lại nhiều lần cho cùng kết quả); thanh toán thành công khi hold đã hết hạn thì đánh dấu `NEEDS_REFUND`.
- Môi trường dev có `POST /bookings/{code}/mock-pay/` (chỉ khi `DEBUG=True`) để giả lập cổng thanh toán.
- Chưa tích hợp VNPay/MoMo/Stripe thật (đúng phạm vi MVP).

---

## 6. Thiết kế cơ sở dữ liệu (tóm tắt)

| Bảng | Mô tả | Ghi chú |
|---|---|---|
| `accounts_user` | Tài khoản | `role`, `phone`, email duy nhất |
| `listings_homestay` | Homestay | `owner`, địa chỉ, `latitude/longitude`, `status` duyệt |
| `listings_room` | Phòng cho thuê | `base_price`, `max_guests`, `is_active` |
| `listings_vehicle` | Xe cho thuê | loại, hộp số, phân khối, số chỗ, `base_price` |
| `pricing_pricingrule` | Quy tắc giá động | phạm vi homestay/xe/toàn hệ thống, `kind`, `multiplier`, tham số |
| `bookings_booking` | Đơn tổng | `code`, trạng thái, `hold_expires_at`, tổng tiền, cọc, `price_breakdown` (JSON) |
| `bookings_bookingitem` | Từng mục trong đơn | đúng một trong `room` hoặc `vehicle` (CHECK) |
| `bookings_calendarslot` | Lịch phòng/xe | `period` daterange, `status`, 2 ràng buộc EXCLUDE |
| `bookings_payment` | Giao dịch cọc | `txn_ref` duy nhất, trạng thái, payload thô |

Các ràng buộc khác: `CHECK check_in < check_out`, giá > 0, mỗi rule chỉ thuộc một phạm vi, mỗi slot/item thuộc đúng một phòng hoặc xe.

---

## 7. Danh sách API

Tiền tố `/api`. Các endpoint công khai không cần token; còn lại cần `Authorization: Bearer <access>`.

**Xác thực**

| Method | URL | Mô tả |
|---|---|---|
| POST | `/auth/register/` | Đăng ký |
| POST | `/auth/login/` | Đăng nhập, trả access/refresh |
| POST | `/auth/refresh/` | Làm mới access token |
| GET | `/auth/me/` | Thông tin người dùng hiện tại |

**Khách hàng**

| Method | URL | Mô tả |
|---|---|---|
| GET | `/search/?city&check_in&check_out&guests` | Phòng trống + giá + xe gợi ý (công khai) |
| GET | `/rooms/{id}/` | Chi tiết phòng + các đêm đã kín trong 365 ngày (công khai) |
| GET | `/vehicles/suggest/` | Xe trống trong toàn bộ kỳ lưu trú (công khai) |
| POST | `/quote/` | Bảng giá chi tiết từng ngày (công khai) |
| GET / POST | `/bookings/` | Đơn của tôi / tạo đơn combo (trạng thái HOLD) |
| GET | `/bookings/{code}/` | Chi tiết đơn của tôi |
| POST | `/bookings/{code}/pay/` | Khởi tạo thanh toán cọc |
| POST | `/bookings/{code}/mock-pay/` | Giả lập thanh toán (chỉ DEBUG) |
| POST | `/payments/webhook/` | Webhook cổng thanh toán (HMAC) |

**Chủ homestay / chủ xe**

| Method | URL | Mô tả |
|---|---|---|
| GET | `/host/stats/` | Thống kê doanh thu, lấp đầy |
| GET | `/host/inbox/` | Đơn thuộc tài nguyên của tôi (kèm thông tin khách) |
| POST | `/host/items/{id}/decision/` | `{action: confirm/reject, reason}` |
| CRUD | `/host/homestays/`, `/host/rooms/`, `/host/vehicles/` | Quản lý tin đăng |
| GET | `/host/rooms/{id}/calendar/`, `/host/vehicles/{id}/calendar/` | Lịch sắp tới |
| POST | `/host/rooms/{id}/blocks/` | Chặn lịch thủ công |
| DELETE | `/host/blocks/{id}/` | Mở lại lịch đã chặn |
| CRUD | `/host/pricing-rules/` | Quy tắc giá động |

**Quản trị hệ thống** (yêu cầu tài khoản có `role=ADMIN` và quyền staff)

| Method | URL | Mô tả |
|---|---|---|
| GET | `/admin/overview/` | Thống kê người dùng, nội dung, đơn đặt và thanh toán thành công |
| GET | `/admin/users/?q=...` | Tìm kiếm tài khoản |
| PATCH | `/admin/users/{id}/status/` | Khóa/mở tài khoản; không thể tự khóa tài khoản hiện tại |
| GET | `/admin/approvals/` | Danh sách homestay và phương tiện đang chờ duyệt |
| POST | `/admin/approvals/{homestay|vehicle}/{id}/decision/` | Duyệt hoặc từ chối, lưu lý do phản hồi |

---

## 8. Bảo mật

| Rủi ro | Biện pháp |
|---|---|
| **IDOR** khi xem/xử lý đơn | Mọi truy vấn lọc theo chủ sở hữu ngay ở queryset (`customer=request.user`, `room__homestay__owner=...`); người lạ nhận **404** thay vì 403 để không lộ sự tồn tại |
| **Đặt trùng do request đồng thời** | Ràng buộc EXCLUDE ở cấp CSDL (mục 5.1), API trả 409 |
| Leo thang đặc quyền khi đăng ký | Không cho chọn role `ADMIN` |
| Lộ/giả mạo webhook thanh toán | Xác thực chữ ký HMAC-SHA256, so sánh thời gian hằng (`compare_digest`), idempotent |
| Chủ nhà gán rule/phòng vào tài nguyên của người khác | Serializer kiểm tra quyền sở hữu khi tạo/sửa |
| Mật khẩu | Băm bằng hệ thống mật khẩu của Django |
| SQL injection | Dùng ORM, truy vấn tham số hóa |
| Giá thao túng từ client | Giá luôn được tính lại ở server khi tạo đơn, client chỉ gửi ID và ngày |
| Xóa dữ liệu đã có đơn | `PROTECT` ở khóa ngoại, API trả 409 và gợi ý tắt thay vì xóa |

## 9. Quy tắc nghiệp vụ đã cài đặt

| Mã | Nội dung | Nơi thực thi |
|---|---|---|
| BR-01 | Check-in < Check-out, không chọn ngày quá khứ | `create_booking`, CHECK constraint |
| BR-02 | Số khách ≤ sức chứa tối đa của phòng | `create_booking` |
| BR-03 | Chỉ hiện homestay/xe đã được duyệt | tìm kiếm, chi tiết, tạo đơn |
| BR-04 | Tính giá theo từng ngày | pricing engine |
| BR-05 | Hệ số cuối tuần/lễ không thấp hơn 1.0 | `PricingRule.clean()` |
| BR-06 | Ngày vừa lễ vừa cuối tuần lấy hệ số cao hơn | `day_factor` |
| BR-07 / BR-08 | Tạm khóa lịch khi tạo đơn; từ chối/hết hạn tự mở lại | `CalendarSlot`, `expire_stale_holds` |
| BR-09 | Không có 2 đơn giao nhau trên cùng phòng/xe | EXCLUDE constraint |
| BR-10 | Chỉ gợi ý xe trống trong toàn bộ kỳ lưu trú | `suggest_vehicles` |
| BR-12 / BR-14 | Phân quyền theo vai trò và chủ sở hữu | permissions + queryset |
| BR-15 | Thanh toán ở mức mô phỏng | `mock-pay`, webhook mẫu |

---

## 10. Hướng dẫn chạy

### Yêu cầu
Python 3.12/3.13, Node.js 18+, Docker Desktop (hoặc PostgreSQL 16 cài trực tiếp).

### Backend

```powershell
docker compose up -d                       # PostgreSQL (hoặc cài PostgreSQL và tạo DB `homestay`)
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py makemigrations accounts listings pricing bookings
python manage.py migrate
python manage.py seed_demo                 # dữ liệu mẫu
python manage.py runserver                 # http://localhost:8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev                                # http://localhost:5173 (proxy /api -> :8000)
```

### Biến môi trường (backend)

Khi chạy Django, `config/settings.py` tự nạp `backend/.env` nếu file tồn tại.
Các biến môi trường đã được đặt trong hệ điều hành sẽ được ưu tiên hơn giá trị trong `.env`.
Đăng nhập Django dùng `username`; chạy `python manage.py seed_demo` để tạo tài khoản demo trong bảng `accounts_user`.
File gốc `homestay_db.sql` là schema độc lập với bảng `users/password_hash`, không tạo tài khoản đăng nhập cho Django.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT` | `homestay_db` / `postgres` / `123456` / `localhost` / `5432` | Kết nối PostgreSQL |
| `HOLD_MINUTES` | `15` | Thời gian giữ chỗ tạm |
| `DEPOSIT_RATE` | `0.30` | Tỷ lệ đặt cọc |
| `PAYMENT_WEBHOOK_SECRET` | `dev-webhook-secret` | Khóa ký webhook |

### Tài khoản demo (sau `seed_demo`)

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `khach1` | `123456` | Khách hàng |
| `host1` | `123456` | Chủ homestay |
| `xe1` | `123456` | Chủ xe |
| `khach2` | `123456` | Khách hàng |
| `admin` | `admin123` | Quản trị (`/admin/`) |

### Kịch bản demo gợi ý
1. Đăng nhập `host1` → tab *Giá động* xem các quy tắc, *Homestay & phòng* xem phòng.
2. Ở trang chủ tìm "Đà Lạt", chọn ngày Thứ 6 → Chủ nhật → xem bảng giá chi tiết có hệ số cuối tuần.
3. Chọn thuê xe kèm 3 đêm → thấy dòng giảm giá combo.
4. Đăng nhập `khach1`, bấm *Giữ chỗ & đặt cọc* → xem đếm ngược → *Thanh toán cọc (giả lập)*.
5. Đăng nhập `host1` → *Đơn đặt* → **Xác nhận**; đăng nhập `xe1` xác nhận phần xe.
6. Kiểm thử overbooking: mở trình duyệt ẩn danh với tài khoản khác đặt cùng phòng cùng ngày → nhận lỗi 409.
7. Chạy kiểm thử tự động: `python manage.py test apps.bookings` (kiểm tra giá ví dụ 2.205.000₫ và chặn đặt trùng).

---

## 11. Hạn chế và hướng phát triển

- Chưa có: chuyển trạng thái Check-in/Check-out, hủy đơn chủ động và chính sách hoàn cọc, hoàn tiền khi chỉ xe bị từ chối.
- Chưa có đánh giá/bình luận (Reviews) và upload hình ảnh.
- Chưa tích hợp cổng thanh toán thật (VNPay/MoMo/Stripe); mới có webhook mẫu có chữ ký.
- Công suất cho giá động tính theo từng ngày bằng nhiều truy vấn, có thể tối ưu bằng cache hoặc truy vấn gộp khi lượng dữ liệu lớn.
- Hold hết hạn đang dọn lười và bằng lệnh thủ công; triển khai thật nên dùng cron/Celery beat.
- Cần bổ sung rate limiting, kiểm thử tự động cho thêm luồng, CI/CD và triển khai production.