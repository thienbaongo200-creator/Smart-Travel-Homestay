# Frontend (React + Vite + Tailwind + Leaflet)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxy /api -> http://127.0.0.1:8000)
```
Cần Django đang chạy ở cổng 8000 và đã cài `apps/bookings/views_public.py` (xem hướng dẫn backend).

Trang: `/` tìm kiếm + bản đồ giá · `/rooms/:id` lịch + bảng giá từng ngày + chọn xe · `/bookings` đơn của tôi + đếm ngược giữ chỗ + thanh toán giả lập · `/login`.
