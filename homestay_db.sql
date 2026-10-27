-- =====================================================================
-- HỆ THỐNG ĐẶT PHÒNG HOMESTAY KÈM THUÊ XE - QUẢN LÝ LỊCH & GIÁ ĐỘNG
-- PostgreSQL 14 trở lên (đã chạy thử trên 16)
-- File: Database/homestay_db.sql
--
-- Cách chạy bằng psql (tự tạo CSDL homestay_db rồi chuyển vào):
--     psql -U postgres -f homestay_db.sql
-- Đây là schema SQL độc lập/legacy, không phải schema Django. Django đăng nhập
-- qua accounts_user (password); bảng users/password_hash trong file này không
-- được Django Authentication sử dụng. Tạo tài khoản demo Django bằng:
--     cd backend && python manage.py seed_demo
-- CẢNH BÁO: script phía dưới DROP các bảng legacy rồi tạo lại; sao lưu trước
-- khi chạy nếu database đang chứa dữ liệu cần giữ.
-- Nếu dùng pgAdmin hoặc DBeaver: tạo sẵn CSDL homestay_db, kết nối vào đó,
-- bỏ hai dòng \gexec và \connect bên dưới rồi chạy phần còn lại.
--
-- Nội dung: 1) tạo bảng  2) chỉ mục  3) hàm và trigger  4) dữ liệu mẫu.
-- Script chạy lại được nhiều lần (xóa bảng cũ trước khi tạo).
--
-- Quy ước: tên bảng, cột snake_case tiếng Anh theo ERD ở mục 4 của tài liệu;
-- khóa chính id bigint tự tăng; tiền VND numeric(12,0); thời điểm timestamptz;
-- trạng thái là text kèm CHECK (dễ sửa hơn kiểu ENUM).
-- Khóa ngoại để mặc định NO ACTION: chặn xóa dữ liệu đã phát sinh đơn.
--
-- Mã lỗi nghiệp vụ (SQLSTATE) do hàm và trigger ném ra:
--   HS001 phòng không còn trống        HS002 xe không còn trống
--   HS003 chuyển trạng thái đơn sai    HS004 số khách vượt sức chứa phòng
--   HS005 phòng/xe không thuộc homestay của đơn
--   HS006 ngày thuê xe ngoài khoảng cho phép
--   HS007 đánh giá không hợp lệ        HS008 chủ homestay phải có vai trò HOST
--   HS009 giấy phép lái xe không phù hợp
--   HS010 không tìm thấy đối tượng     HS011 khoảng ngày không hợp lệ
-- =====================================================================

SELECT 'CREATE DATABASE homestay_db ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homestay_db')\gexec
\connect homestay_db

SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 0. DỌN DẸP (xóa theo thứ tự ngược với khóa ngoại)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS
    reviews, payments, vehicle_calendar, room_calendar,
    booking_vehicle_days, booking_vehicles, booking_room_nights, booking_rooms,
    bookings, cancellation_policies, promotions, holidays, pricing_rules,
    vehicles, vehicle_types, rooms, homestay_amenities, amenities,
    homestays, users
CASCADE;
DROP SEQUENCE IF EXISTS booking_code_seq;

-- ---------------------------------------------------------------------
-- 1. TẠO BẢNG (20 bảng, theo thứ tự phụ thuộc)
-- ---------------------------------------------------------------------

-- 1.1 Người dùng: khách, chủ homestay, quản trị viên
CREATE TABLE users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    full_name     text NOT NULL,
    phone         text,
    role          text NOT NULL DEFAULT 'GUEST',
    status        text NOT NULL DEFAULT 'ACTIVE',
    license_class text,
    CONSTRAINT ck_users_email   CHECK (email = lower(email)),
    CONSTRAINT ck_users_role    CHECK (role IN ('GUEST', 'HOST', 'ADMIN')),
    CONSTRAINT ck_users_status  CHECK (status IN ('ACTIVE', 'LOCKED')),
    CONSTRAINT ck_users_license CHECK (license_class IN ('A1', 'A2', 'B1', 'B2'))
);

-- 1.2 Homestay. Các cột cuối là tham số cấu hình của từng homestay (mục 1.2.4).
CREATE TABLE homestays (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id            bigint NOT NULL REFERENCES users (id),
    name                text NOT NULL,
    address             text NOT NULL,
    city                text NOT NULL,
    description         text,
    checkin_time        time NOT NULL DEFAULT '14:00',
    checkout_time       time NOT NULL DEFAULT '12:00',
    auto_confirm        boolean NOT NULL DEFAULT true,
    status              text NOT NULL DEFAULT 'PENDING',
    hold_minutes        int NOT NULL DEFAULT 15,    -- thời gian giữ chỗ chờ thanh toán
    deposit_percent     int NOT NULL DEFAULT 30,    -- phần trăm đặt cọc
    price_floor_percent int NOT NULL DEFAULT 50,    -- giá thấp nhất so với giá cơ bản
    price_cap_percent   int NOT NULL DEFAULT 300,   -- giá cao nhất so với giá cơ bản
    vehicle_extra_days  int NOT NULL DEFAULT 1,     -- được thuê xe quá ngày trả phòng
    CONSTRAINT uq_homestays_owner_name UNIQUE (owner_id, name),
    CONSTRAINT ck_homestays_status  CHECK (status IN ('PENDING', 'ACTIVE', 'HIDDEN')),
    CONSTRAINT ck_homestays_hold    CHECK (hold_minutes BETWEEN 1 AND 120),
    CONSTRAINT ck_homestays_deposit CHECK (deposit_percent BETWEEN 1 AND 100),
    CONSTRAINT ck_homestays_floor   CHECK (price_floor_percent BETWEEN 1 AND 100),
    CONSTRAINT ck_homestays_cap     CHECK (price_cap_percent >= 100),
    CONSTRAINT ck_homestays_vextra  CHECK (vehicle_extra_days >= 0)
);

-- 1.3 Tiện nghi và liên kết với homestay
CREATE TABLE amenities (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE
);

CREATE TABLE homestay_amenities (
    homestay_id bigint NOT NULL REFERENCES homestays (id) ON DELETE CASCADE,
    amenity_id  bigint NOT NULL REFERENCES amenities (id),
    PRIMARY KEY (homestay_id, amenity_id)
);

-- 1.4 Phòng
CREATE TABLE rooms (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    homestay_id bigint NOT NULL REFERENCES homestays (id),
    name        text NOT NULL,
    capacity    int NOT NULL,
    base_price  numeric(12,0) NOT NULL,
    status      text NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT uq_rooms_homestay_name UNIQUE (homestay_id, name),
    CONSTRAINT ck_rooms_capacity CHECK (capacity > 0),
    CONSTRAINT ck_rooms_price    CHECK (base_price >= 0),
    CONSTRAINT ck_rooms_status   CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 1.5 Loại xe và xe cụ thể
CREATE TABLE vehicle_types (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    homestay_id      bigint NOT NULL REFERENCES homestays (id),
    name             text NOT NULL,
    category         text NOT NULL,
    seats            int NOT NULL,
    license_class    text,
    base_daily_price numeric(12,0) NOT NULL,
    deposit          numeric(12,0) NOT NULL DEFAULT 0,
    CONSTRAINT uq_vehicle_types_homestay_name UNIQUE (homestay_id, name),
    CONSTRAINT ck_vehicle_types_category CHECK (category IN ('MOTORBIKE', 'CAR', 'BICYCLE')),
    CONSTRAINT ck_vehicle_types_seats    CHECK (seats > 0),
    CONSTRAINT ck_vehicle_types_license  CHECK (license_class IN ('A1', 'A2', 'B1', 'B2')),
    CONSTRAINT ck_vehicle_types_price    CHECK (base_daily_price >= 0),
    CONSTRAINT ck_vehicle_types_deposit  CHECK (deposit >= 0)
);

CREATE TABLE vehicles (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_type_id bigint NOT NULL REFERENCES vehicle_types (id),
    plate_no        text NOT NULL UNIQUE,
    status          text NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT ck_vehicles_status CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'RETIRED'))
);

-- 1.6 Quy tắc giá động. Một dòng là một quy tắc của một homestay, áp cho phòng hoặc xe.
--   day_of_week_mask: bit 0 = thứ Hai ... bit 6 = Chủ nhật (thứ Sáu + thứ Bảy = 16 + 32 = 48)
--   Các cột điều kiện chỉ dùng cho loại quy tắc tương ứng (xem ck_pricing_rules_params).
CREATE TABLE pricing_rules (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    homestay_id         bigint NOT NULL REFERENCES homestays (id),
    name                text NOT NULL,
    target              text NOT NULL,
    rule_type           text NOT NULL,
    start_date          date,
    end_date            date,
    day_of_week_mask    int,
    min_nights          int,
    lead_days_min       int,
    lead_days_max       int,
    occupancy_threshold numeric(4,3),
    adjust_type         text NOT NULL,
    adjust_value        numeric(12,2) NOT NULL,
    priority            int NOT NULL DEFAULT 0,
    active              boolean NOT NULL DEFAULT true,
    CONSTRAINT ck_pricing_rules_target CHECK (target IN ('ROOM', 'VEHICLE')),
    CONSTRAINT ck_pricing_rules_type   CHECK (rule_type IN
        ('SEASON', 'WEEKEND', 'HOLIDAY', 'EARLY', 'LAST_MINUTE', 'OCCUPANCY', 'LONG_STAY')),
    CONSTRAINT ck_pricing_rules_adjust CHECK (adjust_type IN ('PERCENT', 'FIXED')),
    CONSTRAINT ck_pricing_rules_pct    CHECK (adjust_type <> 'PERCENT' OR adjust_value > -100),
    CONSTRAINT ck_pricing_rules_dates  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
    CONSTRAINT ck_pricing_rules_occ    CHECK (occupancy_threshold IS NULL OR occupancy_threshold BETWEEN 0 AND 1),
    CONSTRAINT ck_pricing_rules_params CHECK (
        CASE rule_type
            WHEN 'SEASON'      THEN start_date IS NOT NULL AND end_date IS NOT NULL
            WHEN 'WEEKEND'     THEN COALESCE(day_of_week_mask, 0) BETWEEN 1 AND 127
            WHEN 'HOLIDAY'     THEN true
            WHEN 'EARLY'       THEN lead_days_min IS NOT NULL
            WHEN 'LAST_MINUTE' THEN lead_days_max IS NOT NULL
            WHEN 'OCCUPANCY'   THEN occupancy_threshold IS NOT NULL
            WHEN 'LONG_STAY'   THEN min_nights IS NOT NULL
        END)
);

-- 1.7 Ngày lễ, khuyến mãi, chính sách hủy
CREATE TABLE holidays (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    day  date NOT NULL UNIQUE,
    name text NOT NULL
);

CREATE TABLE promotions (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    homestay_id   bigint REFERENCES homestays (id),   -- NULL: dùng cho mọi homestay
    code          text NOT NULL UNIQUE,
    discount_type text NOT NULL,
    value         numeric(12,2) NOT NULL,
    start_date    date NOT NULL,
    end_date      date NOT NULL,
    usage_limit   int,                                 -- NULL: không giới hạn
    used_count    int NOT NULL DEFAULT 0,
    CONSTRAINT ck_promotions_code  CHECK (code = upper(code)),
    CONSTRAINT ck_promotions_type  CHECK (discount_type IN ('PERCENT', 'FIXED')),
    CONSTRAINT ck_promotions_value CHECK (value > 0 AND (discount_type <> 'PERCENT' OR value <= 100)),
    CONSTRAINT ck_promotions_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_promotions_usage CHECK (used_count >= 0 AND (usage_limit IS NULL OR used_count <= usage_limit))
);

CREATE TABLE cancellation_policies (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    homestay_id    bigint NOT NULL REFERENCES homestays (id),
    days_before    int NOT NULL,       -- hủy khi còn từ days_before ngày trở lên đến ngày nhận phòng
    refund_percent int NOT NULL,
    CONSTRAINT uq_cancel_policy UNIQUE (homestay_id, days_before),
    CONSTRAINT ck_cancel_days   CHECK (days_before >= 0),
    CONSTRAINT ck_cancel_refund CHECK (refund_percent BETWEEN 0 AND 100)
);

-- 1.8 Đơn đặt và chi tiết
CREATE SEQUENCE booking_code_seq;

CREATE TABLE bookings (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            text NOT NULL UNIQUE
        DEFAULT ('HS' || to_char(now(), 'YYMMDD') || lpad(nextval('booking_code_seq')::text, 5, '0')),
    guest_id        bigint NOT NULL REFERENCES users (id),
    homestay_id     bigint NOT NULL REFERENCES homestays (id),
    promotion_id    bigint REFERENCES promotions (id),
    check_in        date NOT NULL,
    check_out       date NOT NULL,
    guests          int NOT NULL,
    status          text NOT NULL DEFAULT 'HELD',
    subtotal        numeric(12,0) NOT NULL DEFAULT 0,
    discount        numeric(12,0) NOT NULL DEFAULT 0,
    tax             numeric(12,0) NOT NULL DEFAULT 0,
    total           numeric(12,0) NOT NULL DEFAULT 0,
    hold_expires_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_bookings_dates    CHECK (check_out > check_in),
    CONSTRAINT ck_bookings_guests   CHECK (guests > 0),
    CONSTRAINT ck_bookings_status   CHECK (status IN
        ('HELD', 'DEPOSITED', 'PAID', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_bookings_amounts  CHECK (subtotal >= 0 AND discount >= 0 AND tax >= 0 AND discount <= subtotal),
    CONSTRAINT ck_bookings_total    CHECK (total = subtotal - discount + tax),
    CONSTRAINT ck_bookings_hold     CHECK (status <> 'HELD' OR hold_expires_at IS NOT NULL)
);

CREATE TABLE booking_rooms (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id bigint NOT NULL REFERENCES bookings (id),
    room_id    bigint NOT NULL REFERENCES rooms (id),
    guests     int NOT NULL,                           -- số khách ở phòng này
    CONSTRAINT uq_booking_rooms UNIQUE (booking_id, room_id),
    CONSTRAINT ck_booking_rooms_guests CHECK (guests > 0)
);

-- Giá từng đêm được chép vào đơn lúc giữ chỗ; đổi quy tắc về sau không ảnh hưởng đơn cũ.
CREATE TABLE booking_room_nights (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_room_id bigint NOT NULL REFERENCES booking_rooms (id),
    night           date NOT NULL,
    price           numeric(12,0) NOT NULL,
    applied_rules   text NOT NULL DEFAULT '',
    CONSTRAINT uq_booking_room_nights UNIQUE (booking_room_id, night),
    CONSTRAINT ck_booking_room_nights_price CHECK (price >= 0)
);

CREATE TABLE booking_vehicles (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id bigint NOT NULL REFERENCES bookings (id),
    vehicle_id bigint NOT NULL REFERENCES vehicles (id),
    start_date date NOT NULL,
    end_date   date NOT NULL,
    deposit    numeric(12,0) NOT NULL DEFAULT 0,
    pickup_km  int,
    return_km  int,
    pickup_fuel int,                                   -- mức xăng, phần trăm
    return_fuel int,
    extra_fee  numeric(12,0) NOT NULL DEFAULT 0,       -- phụ phí trễ hạn, hư hỏng
    CONSTRAINT uq_booking_vehicles UNIQUE (booking_id, vehicle_id),
    CONSTRAINT ck_booking_vehicles_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_booking_vehicles_money CHECK (deposit >= 0 AND extra_fee >= 0),
    CONSTRAINT ck_booking_vehicles_km    CHECK (pickup_km >= 0 AND return_km >= 0
                                                AND (pickup_km IS NULL OR return_km IS NULL OR return_km >= pickup_km)),
    CONSTRAINT ck_booking_vehicles_fuel  CHECK (pickup_fuel BETWEEN 0 AND 100 AND return_fuel BETWEEN 0 AND 100)
);

CREATE TABLE booking_vehicle_days (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_vehicle_id bigint NOT NULL REFERENCES booking_vehicles (id),
    day                date NOT NULL,
    price              numeric(12,0) NOT NULL,
    applied_rules      text NOT NULL DEFAULT '',
    CONSTRAINT uq_booking_vehicle_days UNIQUE (booking_vehicle_id, day),
    CONSTRAINT ck_booking_vehicle_days_price CHECK (price >= 0)
);

-- 1.9 Lịch theo từng ngày. UNIQUE (phòng, ngày) và (xe, ngày) là chốt cuối chống trùng lịch.
CREATE TABLE room_calendar (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id        bigint NOT NULL REFERENCES rooms (id),
    day            date NOT NULL,
    status         text NOT NULL DEFAULT 'AVAILABLE',
    price_override numeric(12,0),
    booking_id     bigint REFERENCES bookings (id),
    CONSTRAINT uq_room_calendar UNIQUE (room_id, day),
    CONSTRAINT ck_room_calendar_status CHECK (status IN
        ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED', 'MAINTENANCE')),
    CONSTRAINT ck_room_calendar_price  CHECK (price_override IS NULL OR price_override >= 0),
    -- HELD và BOOKED phải gắn với một đơn; các trạng thái khác thì không
    CONSTRAINT ck_room_calendar_link   CHECK ((status IN ('HELD', 'BOOKED')) = (booking_id IS NOT NULL))
);

CREATE TABLE vehicle_calendar (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id         bigint NOT NULL REFERENCES vehicles (id),
    day                date NOT NULL,
    status             text NOT NULL DEFAULT 'AVAILABLE',
    price_override     numeric(12,0),
    booking_vehicle_id bigint REFERENCES booking_vehicles (id),
    CONSTRAINT uq_vehicle_calendar UNIQUE (vehicle_id, day),
    CONSTRAINT ck_vehicle_calendar_status CHECK (status IN
        ('AVAILABLE', 'HELD', 'BOOKED', 'MAINTENANCE')),
    CONSTRAINT ck_vehicle_calendar_price  CHECK (price_override IS NULL OR price_override >= 0),
    CONSTRAINT ck_vehicle_calendar_link   CHECK ((status IN ('HELD', 'BOOKED')) = (booking_vehicle_id IS NOT NULL))
);

-- 1.10 Thanh toán và đánh giá
CREATE TABLE payments (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id  bigint NOT NULL REFERENCES bookings (id),
    type        text NOT NULL,
    amount      numeric(12,0) NOT NULL,
    method      text NOT NULL,
    status      text NOT NULL DEFAULT 'PENDING',
    gateway_ref text,
    paid_at     timestamptz,
    CONSTRAINT ck_payments_type   CHECK (type IN ('DEPOSIT', 'FULL', 'REFUND')),
    CONSTRAINT ck_payments_amount CHECK (amount > 0),
    CONSTRAINT ck_payments_method CHECK (method IN ('CARD', 'BANK_TRANSFER', 'E_WALLET', 'CASH')),
    CONSTRAINT ck_payments_status CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    CONSTRAINT ck_payments_paid   CHECK (status <> 'SUCCESS' OR paid_at IS NOT NULL)
);

CREATE TABLE reviews (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id  bigint NOT NULL UNIQUE REFERENCES bookings (id),   -- mỗi đơn một đánh giá
    guest_id    bigint NOT NULL REFERENCES users (id),
    homestay_id bigint NOT NULL REFERENCES homestays (id),
    rating      int NOT NULL,
    comment     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_reviews_rating CHECK (rating BETWEEN 1 AND 5)
);

-- ---------------------------------------------------------------------
-- 2. CHỈ MỤC (khóa chính và UNIQUE đã tự có chỉ mục)
-- ---------------------------------------------------------------------
-- Tác vụ nền nhả giữ chỗ hết hạn: chỉ quét các đơn đang giữ chỗ
CREATE INDEX ix_bookings_hold         ON bookings (hold_expires_at) WHERE status = 'HELD';
CREATE INDEX ix_bookings_guest        ON bookings (guest_id);
CREATE INDEX ix_bookings_homestay_in  ON bookings (homestay_id, check_in);
-- Tìm phòng và xe trống theo ngày
CREATE INDEX ix_room_calendar_day     ON room_calendar (day, status);
CREATE INDEX ix_room_calendar_booking ON room_calendar (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX ix_vehicle_calendar_day  ON vehicle_calendar (day, status);
CREATE INDEX ix_vehicle_calendar_bv   ON vehicle_calendar (booking_vehicle_id) WHERE booking_vehicle_id IS NOT NULL;
-- Tra cứu danh mục
CREATE INDEX ix_homestays_city        ON homestays (city) WHERE status = 'ACTIVE';
CREATE INDEX ix_rooms_homestay        ON rooms (homestay_id);
CREATE INDEX ix_vehicle_types_hs      ON vehicle_types (homestay_id);
CREATE INDEX ix_vehicles_type         ON vehicles (vehicle_type_id);
CREATE INDEX ix_pricing_rules_active  ON pricing_rules (homestay_id, target) WHERE active;
-- Chi tiết đơn, thanh toán, đánh giá
CREATE INDEX ix_booking_rooms_room    ON booking_rooms (room_id);
CREATE INDEX ix_booking_vehicles_veh  ON booking_vehicles (vehicle_id);
CREATE INDEX ix_payments_booking      ON payments (booking_id);
CREATE UNIQUE INDEX ux_payments_gateway_ref ON payments (gateway_ref) WHERE gateway_ref IS NOT NULL;
CREATE INDEX ix_reviews_homestay      ON reviews (homestay_id);

-- ---------------------------------------------------------------------
-- 3. HÀM VÀ TRIGGER
-- ---------------------------------------------------------------------

-- 3.1 Sinh lịch cho phòng và xe (mặc định 365 ngày kể từ hôm nay) ------------
CREATE OR REPLACE FUNCTION fn_gen_room_calendar(
    p_room_id bigint, p_from date DEFAULT current_date, p_days int DEFAULT 365)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    INSERT INTO room_calendar (room_id, day)
    SELECT p_room_id, p_from + g FROM generate_series(0, p_days - 1) AS g
    ON CONFLICT (room_id, day) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

CREATE OR REPLACE FUNCTION fn_gen_vehicle_calendar(
    p_vehicle_id bigint, p_from date DEFAULT current_date, p_days int DEFAULT 365)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    INSERT INTO vehicle_calendar (vehicle_id, day)
    SELECT p_vehicle_id, p_from + g FROM generate_series(0, p_days - 1) AS g
    ON CONFLICT (vehicle_id, day) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- Bổ sung lịch cho mọi phòng và xe đang hoạt động (chạy định kỳ, ví dụ mỗi đêm bằng cron)
CREATE OR REPLACE FUNCTION fn_extend_calendars(p_days int DEFAULT 365)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int := 0; m int;
BEGIN
    INSERT INTO room_calendar (room_id, day)
    SELECT r.id, current_date + g
    FROM rooms r CROSS JOIN generate_series(0, p_days - 1) AS g
    WHERE r.status = 'ACTIVE'
    ON CONFLICT (room_id, day) DO NOTHING;
    GET DIAGNOSTICS m = ROW_COUNT;
    n := n + m;

    INSERT INTO vehicle_calendar (vehicle_id, day)
    SELECT v.id, current_date + g
    FROM vehicles v CROSS JOIN generate_series(0, p_days - 1) AS g
    WHERE v.status = 'ACTIVE'
    ON CONFLICT (vehicle_id, day) DO NOTHING;
    GET DIAGNOSTICS m = ROW_COUNT;
    RETURN n + m;
END $$;

CREATE OR REPLACE FUNCTION trg_rooms_gen_calendar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_gen_room_calendar(NEW.id);
    RETURN NEW;
END $$;
CREATE TRIGGER trg_rooms_gen_calendar AFTER INSERT ON rooms
    FOR EACH ROW EXECUTE FUNCTION trg_rooms_gen_calendar();

CREATE OR REPLACE FUNCTION trg_vehicles_gen_calendar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_gen_vehicle_calendar(NEW.id);
    RETURN NEW;
END $$;
CREATE TRIGGER trg_vehicles_gen_calendar AFTER INSERT ON vehicles
    FOR EACH ROW EXECUTE FUNCTION trg_vehicles_gen_calendar();

-- 3.2 Tỷ lệ lấp đầy phòng và tỷ lệ sử dụng xe của một homestay trong một ngày (0..1) ---
CREATE OR REPLACE FUNCTION fn_occupancy_rate(p_homestay_id bigint, p_day date)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        count(*) FILTER (WHERE c.status IN ('HELD', 'BOOKED'))::numeric / NULLIF(count(*), 0), 0)
    FROM room_calendar c
    JOIN rooms r ON r.id = c.room_id
    WHERE r.homestay_id = p_homestay_id AND r.status = 'ACTIVE' AND c.day = p_day;
$$;

CREATE OR REPLACE FUNCTION fn_vehicle_utilization(p_homestay_id bigint, p_day date)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        count(*) FILTER (WHERE c.status IN ('HELD', 'BOOKED'))::numeric / NULLIF(count(*), 0), 0)
    FROM vehicle_calendar c
    JOIN vehicles v       ON v.id = c.vehicle_id
    JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
    WHERE vt.homestay_id = p_homestay_id AND v.status = 'ACTIVE' AND c.day = p_day;
$$;

-- 3.3 Giá động ----------------------------------------------------------------
-- Áp lần lượt các quy tắc đang bật theo độ ưu tiên giảm dần (bằng nhau thì theo id):
--   PERCENT: giá = giá x (1 + giá_trị / 100);  FIXED: giá = giá + giá_trị.
-- Sau đó kẹp trong [giá cơ bản x floor%, giá cơ bản x cap%] và làm tròn đến 1.000 đồng.
-- Nếu mọi quy tắc FIXED có độ ưu tiên thấp hơn quy tắc PERCENT thì kết quả khớp công thức ở mục 1.2.3.
--   p_day          ngày (đêm) cần tính giá
--   p_check_in     ngày nhận phòng của đơn (để tính quy tắc đặt sớm, đặt sát ngày)
--   p_booking_date ngày khách đặt
--   p_units        số đêm ở (phòng) hoặc số ngày thuê (xe), cho quy tắc LONG_STAY
--   p_occupancy    tỷ lệ lấp đầy của ngày đó, cho quy tắc OCCUPANCY
CREATE OR REPLACE FUNCTION fn_apply_pricing(
    p_base numeric, p_homestay_id bigint, p_target text, p_day date,
    p_check_in date, p_booking_date date, p_units int, p_occupancy numeric)
RETURNS TABLE (final_price numeric, applied_rules text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    h     homestays%ROWTYPE;
    r     pricing_rules%ROWTYPE;
    v     numeric := p_base;
    lead  int := p_check_in - p_booking_date;
    dow   int := extract(isodow FROM p_day)::int;      -- 1 = thứ Hai ... 7 = Chủ nhật
    names text[] := ARRAY[]::text[];
BEGIN
    SELECT * INTO h FROM homestays WHERE id = p_homestay_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Homestay % không tồn tại', p_homestay_id USING ERRCODE = 'HS010';
    END IF;

    FOR r IN
        SELECT pr.* FROM pricing_rules pr
        WHERE pr.homestay_id = p_homestay_id AND pr.target = p_target AND pr.active
        ORDER BY pr.priority DESC, pr.id
    LOOP
        -- khoảng ngày hiệu lực (nếu có) áp cho mọi loại quy tắc
        IF r.start_date IS NOT NULL AND p_day < r.start_date THEN CONTINUE; END IF;
        IF r.end_date   IS NOT NULL AND p_day > r.end_date   THEN CONTINUE; END IF;

        CASE r.rule_type
            WHEN 'WEEKEND' THEN
                IF (r.day_of_week_mask & (1 << (dow - 1))) = 0 THEN CONTINUE; END IF;
            WHEN 'HOLIDAY' THEN
                IF NOT EXISTS (SELECT 1 FROM holidays hd WHERE hd.day = p_day) THEN CONTINUE; END IF;
            WHEN 'EARLY', 'LAST_MINUTE' THEN
                IF lead < COALESCE(r.lead_days_min, 0)
                   OR (r.lead_days_max IS NOT NULL AND lead > r.lead_days_max) THEN CONTINUE; END IF;
            WHEN 'OCCUPANCY' THEN
                IF p_occupancy <= r.occupancy_threshold THEN CONTINUE; END IF;   -- chỉ khi vượt ngưỡng
            WHEN 'LONG_STAY' THEN
                IF p_units < r.min_nights THEN CONTINUE; END IF;
            ELSE
                NULL;   -- SEASON: đã lọc theo khoảng ngày ở trên
        END CASE;

        IF r.adjust_type = 'PERCENT' THEN
            v := v * (1 + r.adjust_value / 100);
        ELSE
            v := v + r.adjust_value;
        END IF;
        names := names || (r.rule_type || '#' || r.id);
    END LOOP;

    v := LEAST(GREATEST(v, p_base * h.price_floor_percent / 100.0),
               p_base * h.price_cap_percent / 100.0);
    v := round(v / 1000) * 1000;
    RETURN QUERY SELECT v, array_to_string(names, ',');
END $$;

-- Giá một đêm của phòng. Giá riêng của ngày (price_override) được dùng nguyên, bỏ qua quy tắc.
CREATE OR REPLACE FUNCTION fn_price_room_night(
    p_room_id bigint, p_night date, p_check_in date DEFAULT NULL,
    p_booking_date date DEFAULT current_date, p_nights int DEFAULT 1)
RETURNS TABLE (final_price numeric, applied_rules text)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_hs bigint; v_base numeric; v_override numeric;
BEGIN
    SELECT r.homestay_id, r.base_price, c.price_override INTO v_hs, v_base, v_override
    FROM rooms r
    LEFT JOIN room_calendar c ON c.room_id = r.id AND c.day = p_night
    WHERE r.id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Phòng % không tồn tại', p_room_id USING ERRCODE = 'HS010';
    END IF;
    IF v_override IS NOT NULL THEN
        RETURN QUERY SELECT v_override, 'OVERRIDE'::text;
        RETURN;
    END IF;
    RETURN QUERY
        SELECT * FROM fn_apply_pricing(v_base, v_hs, 'ROOM', p_night,
            COALESCE(p_check_in, p_night), p_booking_date, p_nights,
            fn_occupancy_rate(v_hs, p_night));
END $$;

-- Giá một ngày thuê xe (cùng cách tính với phòng)
CREATE OR REPLACE FUNCTION fn_price_vehicle_day(
    p_vehicle_id bigint, p_day date, p_check_in date DEFAULT NULL,
    p_booking_date date DEFAULT current_date, p_days int DEFAULT 1)
RETURNS TABLE (final_price numeric, applied_rules text)
LANGUAGE plpgsql STABLE AS $$
DECLARE v_hs bigint; v_base numeric; v_override numeric;
BEGIN
    SELECT vt.homestay_id, vt.base_daily_price, c.price_override INTO v_hs, v_base, v_override
    FROM vehicles v
    JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
    LEFT JOIN vehicle_calendar c ON c.vehicle_id = v.id AND c.day = p_day
    WHERE v.id = p_vehicle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Xe % không tồn tại', p_vehicle_id USING ERRCODE = 'HS010';
    END IF;
    IF v_override IS NOT NULL THEN
        RETURN QUERY SELECT v_override, 'OVERRIDE'::text;
        RETURN;
    END IF;
    RETURN QUERY
        SELECT * FROM fn_apply_pricing(v_base, v_hs, 'VEHICLE', p_day,
            COALESCE(p_check_in, p_day), p_booking_date, p_days,
            fn_vehicle_utilization(v_hs, p_day));
END $$;

-- Báo giá cả kỳ ở: mỗi đêm từ ngày nhận đến trước ngày trả một dòng
CREATE OR REPLACE FUNCTION fn_quote_room_stay(
    p_room_id bigint, p_check_in date, p_check_out date, p_booking_date date DEFAULT current_date)
RETURNS TABLE (night date, final_price numeric, applied_rules text)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'Ngày trả phải sau ngày nhận' USING ERRCODE = 'HS011';
    END IF;
    RETURN QUERY
        SELECT p_check_in + g, q.final_price, q.applied_rules
        FROM generate_series(0, p_check_out - p_check_in - 1) AS g
        CROSS JOIN LATERAL fn_price_room_night(
            p_room_id, p_check_in + g, p_check_in, p_booking_date, p_check_out - p_check_in) AS q;
END $$;

-- Báo giá thuê xe: mỗi ngày từ ngày bắt đầu đến hết ngày kết thúc một dòng
CREATE OR REPLACE FUNCTION fn_quote_vehicle_rental(
    p_vehicle_id bigint, p_start date, p_end date, p_booking_date date DEFAULT current_date)
RETURNS TABLE (day date, final_price numeric, applied_rules text)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_end < p_start THEN
        RAISE EXCEPTION 'Ngày kết thúc thuê xe không được trước ngày bắt đầu' USING ERRCODE = 'HS011';
    END IF;
    RETURN QUERY
        SELECT p_start + g, q.final_price, q.applied_rules
        FROM generate_series(0, p_end - p_start) AS g
        CROSS JOIN LATERAL fn_price_vehicle_day(
            p_vehicle_id, p_start + g, p_start, p_booking_date, p_end - p_start + 1) AS q;
END $$;

-- 3.4 Khuyến mãi: trả về số tiền giảm, hoặc NULL nếu mã không dùng được ------------
CREATE OR REPLACE FUNCTION fn_promo_discount(
    p_code text, p_homestay_id bigint, p_subtotal numeric, p_date date DEFAULT current_date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE p promotions%ROWTYPE; d numeric;
BEGIN
    SELECT * INTO p FROM promotions WHERE code = upper(p_code);
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF p_date < p.start_date OR p_date > p.end_date THEN RETURN NULL; END IF;
    IF p.homestay_id IS NOT NULL AND p.homestay_id <> p_homestay_id THEN RETURN NULL; END IF;
    IF p.usage_limit IS NOT NULL AND p.used_count >= p.usage_limit THEN RETURN NULL; END IF;
    IF p.discount_type = 'PERCENT' THEN
        d := round(p_subtotal * p.value / 100);
    ELSE
        d := p.value;
    END IF;
    RETURN LEAST(d, p_subtotal);
END $$;

-- 3.5 Chính sách hủy: phần trăm hoàn tiền theo số ngày còn lại đến ngày nhận phòng ----
CREATE OR REPLACE FUNCTION fn_refund_percent(
    p_homestay_id bigint, p_check_in date, p_cancel_date date DEFAULT current_date)
RETURNS int LANGUAGE sql STABLE AS $$
    SELECT COALESCE((
        SELECT cp.refund_percent FROM cancellation_policies cp
        WHERE cp.homestay_id = p_homestay_id AND cp.days_before <= (p_check_in - p_cancel_date)
        ORDER BY cp.days_before DESC LIMIT 1), 0);
$$;

-- Số tiền khách đã thanh toán thực (đặt cọc + thanh toán toàn phần - hoàn tiền)
CREATE OR REPLACE FUNCTION fn_booking_paid_amount(p_booking_id bigint)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT COALESCE(sum(CASE WHEN type = 'REFUND' THEN -amount ELSE amount END), 0)
    FROM payments WHERE booking_id = p_booking_id AND status = 'SUCCESS';
$$;

-- 3.6 Tìm kiếm ----------------------------------------------------------------
-- Phòng còn trống đủ mọi đêm trong khoảng ngày, đủ sức chứa, kèm tổng giá dự kiến
CREATE OR REPLACE FUNCTION fn_search_available_rooms(
    p_city text, p_check_in date, p_check_out date, p_guests int)
RETURNS TABLE (homestay_id bigint, homestay_name text, room_id bigint, room_name text,
               capacity int, base_price numeric, est_total numeric)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'Ngày trả phải sau ngày nhận' USING ERRCODE = 'HS011';
    END IF;
    RETURN QUERY
        SELECT h.id, h.name, r.id, r.name, r.capacity, r.base_price,
               (SELECT sum(q.final_price) FROM fn_quote_room_stay(r.id, p_check_in, p_check_out) q)
        FROM rooms r
        JOIN homestays h ON h.id = r.homestay_id
        WHERE h.status = 'ACTIVE' AND r.status = 'ACTIVE'
          AND r.capacity >= p_guests
          AND (p_city IS NULL OR h.city ILIKE '%' || p_city || '%')
          AND (SELECT count(*) FROM room_calendar c
               WHERE c.room_id = r.id AND c.day >= p_check_in AND c.day < p_check_out
                 AND c.status = 'AVAILABLE') = (p_check_out - p_check_in)
        ORDER BY 7, 3;
END $$;

-- Một xe cùng loại còn trống đủ mọi ngày trong khoảng ngày (NULL nếu hết xe)
CREATE OR REPLACE FUNCTION fn_find_free_vehicle(
    p_vehicle_type_id bigint, p_start date, p_end date)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT v.id FROM vehicles v
    WHERE v.vehicle_type_id = p_vehicle_type_id AND v.status = 'ACTIVE'
      AND (SELECT count(*) FROM vehicle_calendar c
           WHERE c.vehicle_id = v.id AND c.day BETWEEN p_start AND p_end
             AND c.status = 'AVAILABLE') = (p_end - p_start + 1)
    ORDER BY v.id LIMIT 1;
$$;

-- 3.7 Giữ chỗ chống đặt trùng -----------------------------------------------------
-- Gọi trong cùng transaction với việc tạo đơn. Khóa các dòng lịch theo thứ tự ngày
-- (tránh deadlock), rồi chuyển AVAILABLE thành HELD. Thiếu một ngày trống thì ném lỗi
-- và toàn bộ transaction được rollback. Hai khách cùng đặt: người đến sau chờ người
-- trước commit, rồi thấy phòng đã HELD và nhận lỗi HS001.
CREATE OR REPLACE FUNCTION fn_hold_room_days(
    p_booking_id bigint, p_room_id bigint, p_check_in date, p_check_out date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    PERFORM 1 FROM room_calendar
    WHERE room_id = p_room_id AND day >= p_check_in AND day < p_check_out
    ORDER BY day FOR UPDATE;

    UPDATE room_calendar SET status = 'HELD', booking_id = p_booking_id
    WHERE room_id = p_room_id AND day >= p_check_in AND day < p_check_out
      AND status = 'AVAILABLE';
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n <> (p_check_out - p_check_in) THEN
        RAISE EXCEPTION 'Phòng % không còn trống đủ % đêm từ % đến %',
            p_room_id, p_check_out - p_check_in, p_check_in, p_check_out
            USING ERRCODE = 'HS001';
    END IF;
END $$;

-- Giữ lịch xe theo từng ngày, tính cả ngày bắt đầu và ngày kết thúc
CREATE OR REPLACE FUNCTION fn_hold_vehicle_days(
    p_booking_vehicle_id bigint, p_vehicle_id bigint, p_start date, p_end date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
    PERFORM 1 FROM vehicle_calendar
    WHERE vehicle_id = p_vehicle_id AND day BETWEEN p_start AND p_end
    ORDER BY day FOR UPDATE;

    UPDATE vehicle_calendar SET status = 'HELD', booking_vehicle_id = p_booking_vehicle_id
    WHERE vehicle_id = p_vehicle_id AND day BETWEEN p_start AND p_end
      AND status = 'AVAILABLE';
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n <> (p_end - p_start + 1) THEN
        RAISE EXCEPTION 'Xe % không còn trống đủ % ngày từ % đến %',
            p_vehicle_id, p_end - p_start + 1, p_start, p_end
            USING ERRCODE = 'HS002';
    END IF;
END $$;

-- Thanh toán thành công: lịch HELD của đơn chuyển thành BOOKED
CREATE OR REPLACE FUNCTION fn_confirm_calendar(p_booking_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE room_calendar SET status = 'BOOKED'
    WHERE booking_id = p_booking_id AND status = 'HELD';

    UPDATE vehicle_calendar SET status = 'BOOKED'
    WHERE status = 'HELD'
      AND booking_vehicle_id IN (SELECT bv.id FROM booking_vehicles bv WHERE bv.booking_id = p_booking_id);
END $$;

-- Hủy hoặc hết hạn: trả lịch phòng và lịch xe của đơn về AVAILABLE
CREATE OR REPLACE FUNCTION fn_release_calendar(p_booking_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE room_calendar SET status = 'AVAILABLE', booking_id = NULL
    WHERE booking_id = p_booking_id;

    UPDATE vehicle_calendar SET status = 'AVAILABLE', booking_vehicle_id = NULL
    WHERE booking_vehicle_id IN (SELECT bv.id FROM booking_vehicles bv WHERE bv.booking_id = p_booking_id);
END $$;

-- Tác vụ nền (cron mỗi phút): đơn giữ chỗ quá hạn chuyển EXPIRED và nhả lịch. Trả về số đơn đã nhả.
CREATE OR REPLACE FUNCTION fn_release_expired_holds()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE b record; n int := 0;
BEGIN
    FOR b IN
        SELECT id FROM bookings
        WHERE status = 'HELD' AND hold_expires_at < now()
        ORDER BY id FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE bookings SET status = 'EXPIRED' WHERE id = b.id;
        PERFORM fn_release_calendar(b.id);
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;

-- 3.8 Trigger bảo vệ quy tắc nghiệp vụ ---------------------------------------------
-- Đơn mới ở trạng thái HELD tự có hạn giữ chỗ theo cấu hình của homestay
CREATE OR REPLACE FUNCTION trg_bookings_set_hold() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m int;
BEGIN
    IF NEW.status = 'HELD' AND NEW.hold_expires_at IS NULL THEN
        SELECT hold_minutes INTO m FROM homestays WHERE id = NEW.homestay_id;
        NEW.hold_expires_at := now() + make_interval(mins => COALESCE(m, 15));
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_bookings_set_hold BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION trg_bookings_set_hold();

-- Chuyển trạng thái đơn đúng theo biểu đồ trạng thái ở mục 2.3
CREATE OR REPLACE FUNCTION trg_bookings_status_flow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT (
        (OLD.status = 'HELD'      AND NEW.status IN ('DEPOSITED', 'PAID', 'EXPIRED', 'CANCELLED')) OR
        (OLD.status = 'DEPOSITED' AND NEW.status IN ('PAID', 'CHECKED_IN', 'CANCELLED')) OR
        (OLD.status = 'PAID'      AND NEW.status IN ('CHECKED_IN', 'CANCELLED')) OR
        (OLD.status = 'CHECKED_IN' AND NEW.status = 'COMPLETED')
    ) THEN
        RAISE EXCEPTION 'Không thể chuyển trạng thái đơn từ % sang %', OLD.status, NEW.status
            USING ERRCODE = 'HS003';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_bookings_status_flow BEFORE UPDATE OF status ON bookings
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trg_bookings_status_flow();

-- Chủ homestay phải có vai trò HOST
CREATE OR REPLACE FUNCTION trg_homestays_owner_is_host() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT role FROM users WHERE id = NEW.owner_id) IS DISTINCT FROM 'HOST' THEN
        RAISE EXCEPTION 'Chủ homestay phải có vai trò HOST' USING ERRCODE = 'HS008';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_homestays_owner_is_host BEFORE INSERT OR UPDATE OF owner_id ON homestays
    FOR EACH ROW EXECUTE FUNCTION trg_homestays_owner_is_host();

-- Phòng trong đơn: cùng homestay với đơn, số khách không vượt sức chứa
CREATE OR REPLACE FUNCTION trg_booking_rooms_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cap int; v_hs bigint;
BEGIN
    SELECT capacity, homestay_id INTO v_cap, v_hs FROM rooms WHERE id = NEW.room_id;
    IF v_hs IS DISTINCT FROM (SELECT homestay_id FROM bookings WHERE id = NEW.booking_id) THEN
        RAISE EXCEPTION 'Phòng % không thuộc homestay của đơn', NEW.room_id USING ERRCODE = 'HS005';
    END IF;
    IF NEW.guests > v_cap THEN
        RAISE EXCEPTION 'Số khách % vượt sức chứa % của phòng %', NEW.guests, v_cap, NEW.room_id
            USING ERRCODE = 'HS004';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_booking_rooms_check BEFORE INSERT OR UPDATE OF room_id, guests, booking_id ON booking_rooms
    FOR EACH ROW EXECUTE FUNCTION trg_booking_rooms_check();

-- Xe trong đơn: cùng homestay, ngày thuê trong khoảng ở (kéo dài tối đa vehicle_extra_days),
-- giấy phép lái xe của khách phù hợp loại xe (B2 được thuê xe yêu cầu B1)
CREATE OR REPLACE FUNCTION trg_booking_vehicles_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    b bookings%ROWTYPE; v_hs bigint; v_lic text; v_extra int; g_lic text;
BEGIN
    SELECT * INTO b FROM bookings WHERE id = NEW.booking_id;
    SELECT vt.homestay_id, vt.license_class INTO v_hs, v_lic
    FROM vehicles v JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
    WHERE v.id = NEW.vehicle_id;

    IF v_hs IS DISTINCT FROM b.homestay_id THEN
        RAISE EXCEPTION 'Xe % không thuộc homestay của đơn', NEW.vehicle_id USING ERRCODE = 'HS005';
    END IF;

    SELECT vehicle_extra_days INTO v_extra FROM homestays WHERE id = b.homestay_id;
    IF NEW.start_date < b.check_in OR NEW.end_date > b.check_out + v_extra THEN
        RAISE EXCEPTION 'Ngày thuê xe phải nằm trong % đến % (kéo dài tối đa % ngày)',
            b.check_in, b.check_out, v_extra USING ERRCODE = 'HS006';
    END IF;

    IF v_lic IS NOT NULL THEN
        SELECT license_class INTO g_lic FROM users WHERE id = b.guest_id;
        IF g_lic IS NULL OR NOT (g_lic = v_lic OR (v_lic = 'B1' AND g_lic = 'B2')) THEN
            RAISE EXCEPTION 'Giấy phép lái xe % của khách không phù hợp xe yêu cầu %', g_lic, v_lic
                USING ERRCODE = 'HS009';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_booking_vehicles_check
    BEFORE INSERT OR UPDATE OF vehicle_id, booking_id, start_date, end_date ON booking_vehicles
    FOR EACH ROW EXECUTE FUNCTION trg_booking_vehicles_check();

-- Đánh giá: chỉ khi đơn đã hoàn thành, đúng khách và đúng homestay của đơn
CREATE OR REPLACE FUNCTION trg_reviews_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b bookings%ROWTYPE;
BEGIN
    SELECT * INTO b FROM bookings WHERE id = NEW.booking_id;
    IF b.status IS DISTINCT FROM 'COMPLETED' THEN
        RAISE EXCEPTION 'Chỉ được đánh giá đơn đã hoàn thành (đơn đang ở trạng thái %)', b.status
            USING ERRCODE = 'HS007';
    END IF;
    IF b.guest_id <> NEW.guest_id OR b.homestay_id <> NEW.homestay_id THEN
        RAISE EXCEPTION 'Đánh giá phải đúng khách và đúng homestay của đơn' USING ERRCODE = 'HS007';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_reviews_check BEFORE INSERT ON reviews
    FOR EACH ROW EXECUTE FUNCTION trg_reviews_check();

-- ---------------------------------------------------------------------
-- 4. DỮ LIỆU MẪU
-- Tài khoản demo schema SQL: admin/admin123; host1, khach1, khach2/123456.
-- Các mật khẩu được lưu bằng Django PBKDF2 nhưng bảng này không dùng để đăng nhập Django.
-- Ngày lễ là dữ liệu mẫu, cần cập nhật theo lịch nghỉ nhà nước công bố hằng năm.
-- Các đơn mẫu dùng ngày tương đối so với ngày chạy script.
-- ---------------------------------------------------------------------
INSERT INTO users (username, email, password_hash, full_name, phone, role, license_class) VALUES
    ('admin', 'admin@example.com', 'pbkdf2_sha256$1000000$f4NNdejPvJtbNtSFOQhTDv$XKMfQsQNRj2f0MNJcmLjJ9IGrhhxcin+yzAB3l8yt9s=', 'Quản trị viên', '0900000001', 'ADMIN', NULL),
    ('host1', 'host1@example.com', 'pbkdf2_sha256$1000000$otN7yKS2f8qGeqop9TMmgi$UDzz5zGf/0P1JrkGAhJdShMMV9K0FZFGFqxALKzirmE=', 'Nguyễn Văn Chủ', '0900000002', 'HOST', NULL),
    ('khach1', 'khach1@example.com', 'pbkdf2_sha256$1000000$otN7yKS2f8qGeqop9TMmgi$UDzz5zGf/0P1JrkGAhJdShMMV9K0FZFGFqxALKzirmE=', 'Trần Minh An', '0900000003', 'GUEST', 'A1'),
    ('khach2', 'khach2@example.com', 'pbkdf2_sha256$1000000$vRIwL9IFfsxk6h5P7XTfrc$H9ECrGOaPV/gNxmtn0/ZaDnGYeDxggwRlO5Sxjv/ULA=', 'Lê Hoàng Bình', '0900000004', 'GUEST', 'B1');

INSERT INTO homestays (owner_id, name, address, city, description, auto_confirm, status) VALUES
    ((SELECT id FROM users WHERE email = 'host1@example.com'),
     'Phố Núi Homestay', '12 Hoàng Hoa Thám', 'Đà Lạt', 'Homestay gỗ giữa đồi thông, có bếp và ban công.', true, 'ACTIVE'),
    ((SELECT id FROM users WHERE email = 'host1@example.com'),
     'Biển Xanh Homestay', '45 Võ Nguyên Giáp', 'Đà Nẵng', 'Cách biển 200 m, chủ nhà duyệt đơn thủ công.', false, 'ACTIVE');

INSERT INTO amenities (name) VALUES
    ('Wifi'), ('Điều hòa'), ('Bếp'), ('Ban công'), ('Bãi đỗ xe'), ('Máy giặt');

INSERT INTO homestay_amenities (homestay_id, amenity_id)
SELECT h.id, a.id FROM homestays h, amenities a
WHERE (h.name = 'Phố Núi Homestay'   AND a.name IN ('Wifi', 'Bếp', 'Ban công', 'Bãi đỗ xe'))
   OR (h.name = 'Biển Xanh Homestay' AND a.name IN ('Wifi', 'Điều hòa', 'Bãi đỗ xe', 'Máy giặt'));

-- Thêm phòng và xe sẽ tự sinh lịch 365 ngày (trigger)
INSERT INTO rooms (homestay_id, name, capacity, base_price)
SELECT h.id, v.name, v.capacity, v.base_price
FROM (VALUES
    ('Phố Núi Homestay',   'Phòng Hoa Mai',   2,  600000),
    ('Phố Núi Homestay',   'Phòng Thông Xanh', 3,  800000),
    ('Phố Núi Homestay',   'Phòng Gia Đình',  4, 1200000),
    ('Biển Xanh Homestay', 'Sóng Biển 101',   2,  700000),
    ('Biển Xanh Homestay', 'Sóng Biển 102',   3,  900000),
    ('Biển Xanh Homestay', 'Hải Âu 201',      5, 1500000)
) AS v (hs, name, capacity, base_price)
JOIN homestays h ON h.name = v.hs;

INSERT INTO vehicle_types (homestay_id, name, category, seats, license_class, base_daily_price, deposit)
SELECT h.id, v.name, v.category, v.seats, v.license_class, v.price, v.deposit
FROM (VALUES
    ('Phố Núi Homestay',   'Honda Wave Alpha', 'MOTORBIKE', 2, 'A1', 150000, 1000000),
    ('Phố Núi Homestay',   'Toyota Vios',      'CAR',       4, 'B1', 800000, 3000000),
    ('Biển Xanh Homestay', 'Honda Vision',     'MOTORBIKE', 2, 'A1', 180000, 1000000)
) AS v (hs, name, category, seats, license_class, price, deposit)
JOIN homestays h ON h.name = v.hs;

INSERT INTO vehicles (vehicle_type_id, plate_no)
SELECT vt.id, v.plate
FROM (VALUES
    ('Honda Wave Alpha', '49B1-123.45'),
    ('Honda Wave Alpha', '49B1-678.90'),
    ('Toyota Vios',      '49A-456.78'),
    ('Honda Vision',     '43B1-111.22')
) AS v (type_name, plate)
JOIN vehicle_types vt ON vt.name = v.type_name;

INSERT INTO holidays (day, name) VALUES
    ('2027-01-01', 'Tết Dương lịch'),
    ('2027-02-05', 'Tết Nguyên Đán (dữ liệu mẫu)'),
    ('2027-02-06', 'Tết Nguyên Đán (dữ liệu mẫu)'),
    ('2027-02-07', 'Tết Nguyên Đán (dữ liệu mẫu)'),
    ('2027-02-08', 'Tết Nguyên Đán (dữ liệu mẫu)'),
    ('2027-02-09', 'Tết Nguyên Đán (dữ liệu mẫu)'),
    ('2027-04-30', 'Ngày Giải phóng miền Nam'),
    ('2027-05-01', 'Quốc tế Lao động'),
    ('2027-09-02', 'Quốc khánh');

-- Quy tắc giá. Độ ưu tiên càng lớn càng áp trước.
INSERT INTO pricing_rules
    (homestay_id, name, target, rule_type, start_date, end_date, day_of_week_mask,
     min_nights, lead_days_min, lead_days_max, occupancy_threshold, adjust_type, adjust_value, priority)
SELECT h.id, v.name, v.target, v.rule_type, v.start_date::date, v.end_date::date, v.mask,
       v.min_nights, v.lead_min, v.lead_max, v.occ, v.adjust_type, v.adjust_value, v.priority
FROM (VALUES
    ('Phố Núi Homestay',   'Ngày lễ',            'ROOM',    'HOLIDAY',     NULL,        NULL,        NULL,        NULL, NULL, NULL, NULL,  'PERCENT', 40, 90),
    ('Phố Núi Homestay',   'Mùa hè',             'ROOM',    'SEASON',      '2027-06-01', '2027-08-31', NULL, NULL, NULL, NULL, NULL,  'PERCENT', 25, 70),
    ('Phố Núi Homestay',   'Cuối tuần',          'ROOM',    'WEEKEND',     NULL,        NULL,        48,   NULL, NULL, NULL, NULL,  'PERCENT', 15, 60),
    ('Phố Núi Homestay',   'Kín phòng',          'ROOM',    'OCCUPANCY',   NULL,        NULL,        NULL, NULL, NULL, NULL, 0.800, 'PERCENT', 10, 50),
    ('Phố Núi Homestay',   'Đặt sớm 30 ngày',    'ROOM',    'EARLY',       NULL,        NULL,        NULL, NULL, 30,   NULL, NULL,  'PERCENT', -10, 40),
    ('Phố Núi Homestay',   'Đặt sát ngày',       'ROOM',    'LAST_MINUTE', NULL,        NULL,        NULL, NULL, 0,    2,    NULL,  'PERCENT', -15, 30),
    ('Phố Núi Homestay',   'Ở từ 3 đêm',         'ROOM',    'LONG_STAY',   NULL,        NULL,        NULL, 3,    NULL, NULL, NULL,  'PERCENT', -5, 20),
    ('Phố Núi Homestay',   'Xe ngày lễ',         'VEHICLE', 'HOLIDAY',     NULL,        NULL,        NULL, NULL, NULL, NULL, NULL,  'PERCENT', 20, 90),
    ('Phố Núi Homestay',   'Xe cuối tuần',       'VEHICLE', 'WEEKEND',     NULL,        NULL,        48,   NULL, NULL, NULL, NULL,  'PERCENT', 10, 60),
    ('Biển Xanh Homestay', 'Ngày lễ',            'ROOM',    'HOLIDAY',     NULL,        NULL,        NULL, NULL, NULL, NULL, NULL,  'PERCENT', 50, 90),
    ('Biển Xanh Homestay', 'Mùa hè',             'ROOM',    'SEASON',      '2027-06-01', '2027-08-31', NULL, NULL, NULL, NULL, NULL,  'PERCENT', 30, 70),
    ('Biển Xanh Homestay', 'Cuối tuần',          'ROOM',    'WEEKEND',     NULL,        NULL,        48,   NULL, NULL, NULL, NULL,  'PERCENT', 20, 60),
    ('Biển Xanh Homestay', 'Ở từ 3 đêm',         'ROOM',    'LONG_STAY',   NULL,        NULL,        NULL, 3,    NULL, NULL, NULL,  'PERCENT', -10, 20)
) AS v (hs, name, target, rule_type, start_date, end_date, mask, min_nights, lead_min, lead_max,
        occ, adjust_type, adjust_value, priority)
JOIN homestays h ON h.name = v.hs;

INSERT INTO cancellation_policies (homestay_id, days_before, refund_percent)
SELECT h.id, p.days_before, p.refund_percent
FROM homestays h
CROSS JOIN (VALUES (7, 100), (3, 50), (0, 0)) AS p (days_before, refund_percent);

INSERT INTO promotions (homestay_id, code, discount_type, value, start_date, end_date, usage_limit) VALUES
    (NULL, 'WELCOME10', 'PERCENT', 10,    current_date, current_date + 365, 100),
    ((SELECT id FROM homestays WHERE name = 'Biển Xanh Homestay'),
            'GIAM200K',  'FIXED',  200000, current_date, current_date + 180, NULL);

-- Ba đơn mẫu: một đơn đã hoàn thành (có thanh toán và đánh giá), một đơn đã đặt cọc
-- (phòng + xe, lịch BOOKED), một đơn đang giữ chỗ có mã khuyến mãi (lịch HELD).
DO $$
DECLARE
    v_hs1 bigint;  v_hs2 bigint;
    v_an bigint;   v_binh bigint;
    v_mai bigint;  v_thong bigint;  v_sb101 bigint;
    v_wave bigint; v_promo bigint;
    v_b bigint;    v_br bigint;     v_bv bigint;
    v_ci date;     v_co date;
    v_sub numeric; v_disc numeric;  v_tax numeric;  v_total numeric;
BEGIN
    SELECT id INTO v_hs1  FROM homestays WHERE name = 'Phố Núi Homestay';
    SELECT id INTO v_hs2  FROM homestays WHERE name = 'Biển Xanh Homestay';
    SELECT id INTO v_an   FROM users WHERE email = 'khach1@example.com';
    SELECT id INTO v_binh FROM users WHERE email = 'khach2@example.com';
    SELECT id INTO v_mai   FROM rooms WHERE name = 'Phòng Hoa Mai';
    SELECT id INTO v_thong FROM rooms WHERE name = 'Phòng Thông Xanh';
    SELECT id INTO v_sb101 FROM rooms WHERE name = 'Sóng Biển 101';
    SELECT id INTO v_wave  FROM vehicles WHERE plate_no = '49B1-123.45';

    -- Đơn 1: đã hoàn thành trong quá khứ (2 đêm x 600.000, thuế 8 phần trăm)
    v_ci := current_date - 20;  v_co := current_date - 18;
    INSERT INTO bookings (guest_id, homestay_id, check_in, check_out, guests, status,
                          subtotal, discount, tax, total, created_at)
    VALUES (v_an, v_hs1, v_ci, v_co, 2, 'COMPLETED', 1200000, 0, 96000, 1296000, now() - interval '30 days')
    RETURNING id INTO v_b;
    INSERT INTO booking_rooms (booking_id, room_id, guests) VALUES (v_b, v_mai, 2) RETURNING id INTO v_br;
    INSERT INTO booking_room_nights (booking_room_id, night, price)
    VALUES (v_br, v_ci, 600000), (v_br, v_ci + 1, 600000);
    INSERT INTO payments (booking_id, type, amount, method, status, gateway_ref, paid_at)
    VALUES (v_b, 'FULL', 1296000, 'BANK_TRANSFER', 'SUCCESS', 'DEMO-PAY-0001', now() - interval '30 days');
    INSERT INTO reviews (booking_id, guest_id, homestay_id, rating, comment)
    VALUES (v_b, v_an, v_hs1, 5, 'Phòng sạch, chủ nhà nhiệt tình, view đồi thông rất đẹp.');

    -- Đơn 2: đặt cọc 30 phần trăm, phòng Thông Xanh 3 đêm + xe Wave 4 ngày, lịch BOOKED
    v_ci := current_date + 10;  v_co := current_date + 13;
    INSERT INTO bookings (guest_id, homestay_id, check_in, check_out, guests, status)
    VALUES (v_an, v_hs1, v_ci, v_co, 2, 'HELD') RETURNING id INTO v_b;
    INSERT INTO booking_rooms (booking_id, room_id, guests) VALUES (v_b, v_thong, 2) RETURNING id INTO v_br;
    PERFORM fn_hold_room_days(v_b, v_thong, v_ci, v_co);
    INSERT INTO booking_room_nights (booking_room_id, night, price, applied_rules)
    SELECT v_br, q.night, q.final_price, q.applied_rules FROM fn_quote_room_stay(v_thong, v_ci, v_co) q;

    INSERT INTO booking_vehicles (booking_id, vehicle_id, start_date, end_date, deposit)
    VALUES (v_b, v_wave, v_ci, v_co,
            (SELECT vt.deposit FROM vehicles v JOIN vehicle_types vt ON vt.id = v.vehicle_type_id WHERE v.id = v_wave))
    RETURNING id INTO v_bv;
    PERFORM fn_hold_vehicle_days(v_bv, v_wave, v_ci, v_co);
    INSERT INTO booking_vehicle_days (booking_vehicle_id, day, price, applied_rules)
    SELECT v_bv, q.day, q.final_price, q.applied_rules FROM fn_quote_vehicle_rental(v_wave, v_ci, v_co) q;

    SELECT COALESCE(sum(price), 0) INTO v_sub FROM booking_room_nights WHERE booking_room_id = v_br;
    v_sub := v_sub + (SELECT COALESCE(sum(price), 0) FROM booking_vehicle_days WHERE booking_vehicle_id = v_bv);
    v_tax := round(v_sub * 0.08);
    v_total := v_sub + v_tax;
    UPDATE bookings SET subtotal = v_sub, tax = v_tax, total = v_total WHERE id = v_b;

    INSERT INTO payments (booking_id, type, amount, method, status, gateway_ref, paid_at)
    VALUES (v_b, 'DEPOSIT', round(v_total * 0.3), 'E_WALLET', 'SUCCESS', 'DEMO-PAY-0002', now());
    UPDATE bookings SET status = 'DEPOSITED' WHERE id = v_b;
    PERFORM fn_confirm_calendar(v_b);

    -- Đơn 3: đang giữ chỗ 15 phút, áp mã WELCOME10
    v_ci := current_date + 20;  v_co := current_date + 22;
    SELECT id INTO v_promo FROM promotions WHERE code = 'WELCOME10';
    INSERT INTO bookings (guest_id, homestay_id, promotion_id, check_in, check_out, guests, status)
    VALUES (v_binh, v_hs2, v_promo, v_ci, v_co, 2, 'HELD') RETURNING id INTO v_b;
    INSERT INTO booking_rooms (booking_id, room_id, guests) VALUES (v_b, v_sb101, 2) RETURNING id INTO v_br;
    PERFORM fn_hold_room_days(v_b, v_sb101, v_ci, v_co);
    INSERT INTO booking_room_nights (booking_room_id, night, price, applied_rules)
    SELECT v_br, q.night, q.final_price, q.applied_rules FROM fn_quote_room_stay(v_sb101, v_ci, v_co) q;

    SELECT sum(price) INTO v_sub FROM booking_room_nights WHERE booking_room_id = v_br;
    v_disc  := fn_promo_discount('WELCOME10', v_hs2, v_sub);
    v_tax   := round((v_sub - v_disc) * 0.08);
    v_total := v_sub - v_disc + v_tax;
    UPDATE bookings SET subtotal = v_sub, discount = v_disc, tax = v_tax, total = v_total WHERE id = v_b;
END $$;

-- Kiểm tra nhanh sau khi chạy
SELECT 'Số bảng' AS muc, count(*)::text AS gia_tri
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL SELECT 'Số dòng lịch phòng', count(*)::text FROM room_calendar
UNION ALL SELECT 'Số dòng lịch xe',    count(*)::text FROM vehicle_calendar
UNION ALL SELECT 'Số đơn mẫu',         count(*)::text FROM bookings;