# Homestay + Thuê xe — Django / PostgreSQL

## Chạy dự án
```bash
docker compose up -d                      # PostgreSQL 16
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                      # (export biến môi trường hoặc dùng direnv)
python manage.py makemigrations accounts listings pricing bookings
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
python manage.py test apps.bookings       # cần PostgreSQL (EXCLUDE constraint)
```
Admin: http://localhost:8000/admin (admin/admin123) — duyệt homestay/xe bằng action "Duyệt tin đã chọn".

## Kiến trúc
- `accounts`: User + role (CUSTOMER/HOST/VEHICLE_OWNER/ADMIN), JWT.
- `listings`: Homestay → Room, Vehicle (trạng thái duyệt).
- `pricing`: PricingRule + engine `services.build_quote()`.
- `bookings`: Booking/BookingItem/CalendarSlot/Payment + `services.py` (availability, hold, payment, host decision).

## Chống overbooking
`CalendarSlot` có 2 `ExclusionConstraint` (GiST, cần `btree_gist`): cùng room/vehicle không được có 2 slot
đang "chặn" (HOLD/PENDING/CONFIRMED/CHECKED_IN/BLOCKED) với `period` giao nhau (`[check_in, check_out)`).
Hai request đồng thời → request thứ hai nhận `IntegrityError` → API trả 409. Không cần Redis cho MVP.
HOLD hết hạn: `expire_stale_holds()` chạy lazily khi tạo đơn + `manage.py expire_holds` chạy cron mỗi phút;
mọi truy vấn lịch đều lọc `~(HOLD & expires_at <= now)` nên hold hết hạn không bao giờ chặn khách.

## Ví dụ giá
Phòng 500k, T6→CN (3 đêm, hệ số 1.2) = 1.800.000; xe máy 150k × 3 = 450k, combo −10% = −45k;
**Tổng 2.205.000**, cọc 30% = 661.500.

## API
| Method | URL | Mô tả |
|---|---|---|
| POST | /api/auth/register/, /api/auth/login/ | Đăng ký / JWT |
| GET | /api/search/?city&check_in&check_out&guests | Phòng trống + giá + xe gợi ý |
| POST | /api/quote/ | Bảng giá từng ngày |
| POST/GET | /api/bookings/ | Tạo đơn combo (HOLD) / đơn của tôi |
| POST | /api/bookings/{code}/pay/ | Khởi tạo thanh toán cọc |
| POST | /api/payments/webhook/ | Webhook (HMAC `X-Signature`) |
| GET | /api/host/orders/ | Đơn thuộc phòng/xe của host |
| POST | /api/host/items/{id}/decision/ | `{action: confirm|reject, reason}` |
| POST | /api/host/rooms/{id}/blocks/ | Chặn lịch thủ công |
| CRUD | /api/host/pricing-rules/ | Cấu hình giá động |

## TODO tiếp theo
Check-in/Check-out transition, hoàn tiền khi xe bị từ chối, hủy đơn + chính sách hoàn cọc, Review,
upload ảnh, tích hợp VNPay thật, frontend (React + Leaflet), thống kê doanh thu host.
