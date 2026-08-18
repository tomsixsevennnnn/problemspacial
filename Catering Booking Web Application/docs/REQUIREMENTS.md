---
noteId: "f3ae61d08f3011f1a0b1b1af0447d59d"
tags: []
title: "Requirement Specification — ระบบจองแคทเธอริ่ง (Catering Booking Web Application)"

---

# Requirement Specification: ระบบจองแคทเธอริ่ง (Catering Booking Web Application)

> เอกสารนี้สรุปจากการอ่านโค้ดจริงในโปรเจกต์ ปรับปรุงล่าสุด 2026-08-18 ครอบคลุมทั้งฝั่ง Frontend (`Catering Booking Web Application/`) และ Backend API (`backend/`)
>
> ต้องการรายละเอียดระดับฟังก์ชัน/เมธอด (พารามิเตอร์ ตรรกะ เงื่อนไข validation ของทุกหน้าจอและทุก endpoint) ดูที่ [`FUNCTIONS.md`](./FUNCTIONS.md)

## 1. ภาพรวมระบบ

ระบบจองโต๊ะจีน/แคทเธอริ่งสำหรับร้านอาหาร แบ่งผู้ใช้เป็น 2 บทบาท คือ **ลูกค้า (Customer)** ที่จองงานผ่านหน้าเว็บ และ **เจ้าของร้าน (Owner)** ที่บริหารจัดการออเดอร์ เมนู แพ็กเกจ กำลังคน และค่าตั้งค่าร้านจากหลังบ้าน

ระบบประกอบด้วย 2 ส่วนแยกกัน:

| ส่วน | โฟลเดอร์ | สถานะ |
|---|---|---|
| Frontend (SPA) | `Catering Booking Web Application/` | เชื่อมต่อ REST API ของ backend จริงแล้วทั้งหมด (booking/เมนู/แพ็กเกจ/ค่าตั้งค่า/อัปโหลดไฟล์/สิทธิ์ผู้ใช้) — ไม่มี local mock state สำหรับข้อมูลธุรกิจอีกต่อไป |
| Backend (REST API) | `backend/` | มี API + DB schema (PostgreSQL บน Railway) ใช้งานจริง มี automated test (Jest) ครอบคลุม service หลักทุกตัว |

> **หมายเหตุ:** ราคา/ค่าขนส่งของใบจองคำนวณที่ backend เสมอ (`bookings/pricing.service.ts`) — frontend ส่งแค่ `packageId`/`tables`/`location` ไม่ส่งตัวเลขราคาให้ backend เชื่อถือตรงๆ อีกต่อไป (กัน client แก้ raw request โกงราคา)

---

## 2. เทคโนโลยีและเครื่องมือที่ใช้

### 2.1 Frontend (`Catering Booking Web Application/`)

| หมวด | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Framework | React 19 + React DOM 19 | |
| Build tool | Vite 8 + `@vitejs/plugin-react` | dev server รันที่พอร์ต 8443 |
| ภาษา | TypeScript 5.7 | |
| CSS | Tailwind CSS v4 (ผ่าน `@tailwindcss/vite`) | ไม่มีไฟล์ config Tailwind แยก |
| Authentication | `@auth0/auth0-react` v2 (Auth0 SPA SDK) | |
| แผนที่ | Leaflet 1.9 + `@types/leaflet` | ปักหมุดสถานที่จัดงาน |
| Geocoding | OpenStreetMap Nominatim API (public, เรียกตรงจาก frontend) | ค้นหา/reverse-geocode ที่อยู่ |
| กราฟ/แดชบอร์ด | Recharts 3 | กราฟรายได้ย้อนหลัง, สัดส่วนแพ็กเกจ |
| ไอคอน | lucide-react | |
| Formatter | oxfmt | `pnpm format` |
| Package manager | pnpm (มี `pnpm-workspace.yaml`) | |
| Node version | ^20.19.0 หรือ >=22.12.0 | |

### 2.2 Backend (`backend/`)

| หมวด | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Framework | NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`) | |
| ภาษา | TypeScript 5.7, รันด้วย `ts-node-dev` (dev) | |
| ORM | Prisma 6 (`@prisma/client`) | มี migration แล้ว 1 ชุด (`20260803113754_init`) |
| ฐานข้อมูล | PostgreSQL 16 (Docker: `postgres:16-alpine`) | dev ผ่าน `docker-compose.yml`, expose พอร์ต 5434 |
| Authentication | Passport + `passport-jwt` + `jwks-rsa` | ตรวจสอบ JWT ที่ Auth0 ออกให้ด้วย public key จาก JWKS (RS256), ไม่เก็บ secret เอง |
| Validation | `class-validator` + `class-transformer` | ใช้กับ DTO ทุกตัว |
| Config | `@nestjs/config` (`ConfigModule.forRoot`) | อ่านจาก `.env` |
| Deploy target (ตาม comment ใน `.env.example`) | Railway (backend + Postgres plugin), Vercel (frontend) | |

### 2.3 Authentication / Authorization (ใช้ร่วมกันทั้งระบบ)

- **Auth0** เป็นผู้ให้บริการ identity เดียว แยกบทบาทตาม **connection ที่ใช้ login**:
  - `customer` → login ด้วย Google OAuth2 (`google-oauth2`)
  - `owner` → login ด้วย Username/Password (`Username-Password-Authentication`), ต้องสร้างบัญชีไว้ล่วงหน้าใน Auth0 Dashboard
- Auth0 ไม่ส่ง connection name มาตรงๆ ใน token จึงต้องใช้ **Auth0 Action** (Post-Login) ฝัง custom claim `https://pipatphochana-catering.app/role` (`owner`/`customer`) ลงใน ID token และ Access token (ดู `docs/auth0-action.md`) — claim นี้ใช้เป็นค่า**เริ่มต้น**ตอนสร้าง `User` record ครั้งแรกเท่านั้น
- หลังจากนั้น **`User.role` ใน DB คือความจริงหลัก** ไม่ถูก sync ทับจาก claim อีกในการ login ครั้งถัดๆ ไป — owner ที่มีอยู่แล้วสามารถเลื่อน/ถอดสิทธิ์ owner ให้บัญชีอื่น (ที่เคย login มาแล้วอย่างน้อย 1 ครั้ง) ได้เองผ่านหน้า "สิทธิ์การเข้าถึง" ในแอป โดยไม่ต้องเข้า Auth0 Dashboard (ดู `UsersController` หัวข้อ 4.5)
- Frontend กำหนด role ที่ใช้ควบคุมการนำทางจาก `backendUser.role` (ผลลัพธ์ของ `GET /users/me`) เป็นหลัก ใช้ claim ผ่าน `roleFromAuth0User()` (`src/auth.ts`) เป็น fallback แค่ช่วงก่อนโหลดข้อมูล user จาก backend เสร็จ
- Backend ตรวจสอบ JWT ด้วย `JwtStrategy` (RS256 ผ่าน JWKS ของ Auth0 tenant) แล้วเช็ค role จาก **DB** (query `User.role` โดย `auth0Sub`, cache ในหน่วยความจำ 5 วินาที) ใน `RolesGuard` + decorator `@Roles('owner' | 'customer')` — ไม่ใส่ decorator = เข้าถึงได้ทุก role ที่ login แล้ว; ถ้ายังไม่มี `User` record (login ครั้งแรกสุด) จะ fallback ไปใช้ค่าจาก JWT claim ชั่วคราว
- ข้อมูลโปรไฟล์เพิ่มเติมที่ Auth0/Google ไม่มีให้ (เบอร์โทร, Line ID) ขอเพิ่มครั้งแรกหลัง login ผ่านหน้า **CompleteProfile** แล้วเก็บไว้ (frontend: `localStorage` ผ่าน `src/profileStore.ts`; backend: มี endpoint `PATCH /users/me` รองรับ)

---

## 3. บทบาทผู้ใช้ (Roles) และสิทธิ์การเข้าถึง

### 3.1 Customer (ลูกค้า)

เข้าใช้งานผ่าน Google login เท่านั้น ทำได้:

- ดูหน้า Home และเมนูนำทางไปยังขั้นตอนการจอง
- เลือกวันที่/ช่วงเวลาจัดงานจากปฏิทิน พร้อมดูสถานะคิว (ว่าง/เต็ม) ของแต่ละวัน
- ระบุจำนวนโต๊ะและจำนวนแขก
- ปักหมุด/ค้นหาสถานที่จัดงานบนแผนที่ (หรือใช้ตำแหน่ง GPS ปัจจุบัน) และกรอกรายละเอียดสถานที่เพิ่มเติม
- เลือกแพ็กเกจอาหาร (ดูราคาต่อโต๊ะ, จำนวนเมนูที่เลือกได้, รายการที่รวมมาให้)
- เลือกเมนูอาหารแต่ละคอร์สตามโควตาของแพ็กเกจ
- ดูสรุปตะกร้า (ราคารวม + ค่าขนส่งถ้ามี) แล้วยืนยันการจอง
- ดูประวัติการจองของตัวเองเท่านั้น (ไม่เห็นของลูกค้าคนอื่น)
- ดู/พิมพ์ใบเสนอราคาและใบจองของตัวเอง
- แนบสลิปโอนเงินมัดจำเข้าใบจองของตัวเอง
- ดูการแจ้งเตือน
- แก้ไขโปรไฟล์ (เบอร์โทร/Line ID) ของตัวเอง

**ทำไม่ได้:** ดู/แก้ไขใบจองของลูกค้าคนอื่น, เปลี่ยนสถานะใบจอง, แก้ไขเมนู/แพ็กเกจ/ค่าตั้งค่าร้าน

### 3.2 Owner (เจ้าของร้าน)

เข้าใช้งานผ่าน Username/Password login เท่านั้น (ต้องสร้างบัญชีล่วงหน้าใน Auth0) ทำได้ทุกอย่างที่ customer ทำไม่ได้ ผ่านเมนู Owner:

- **แดชบอร์ด**: ดูรายได้/จำนวนงาน เทียบเดือนก่อนหน้า (%), กราฟรายได้ย้อนหลัง 8 เดือน, สัดส่วนแพ็กเกจที่ขายได้, รายการงานที่ใกล้ถึงพร้อมจำนวนพนักงานที่ต้องใช้
- **ออเดอร์**: ดูใบจองทั้งหมดของทุกลูกค้า, เปลี่ยนสถานะใบจอง (รอยืนยัน/ยืนยันแล้ว/เสร็จสิ้น/ยกเลิก), ปรับแผนกำลังคนจริง (จำนวนที่ระบบคำนวณ vs จำนวนที่ปรับแก้เอง) พร้อมหมายเหตุ
- **ปฏิทินร้าน**: ดูภาพรวมใบจองทั้งหมดตามวัน, อัปเดตสถานะใบจองจากมุมมองปฏิทิน
- **แพ็กเกจ**: สร้าง/แก้ไข/ลบแพ็กเกจ (ราคาต่อโต๊ะ, จำนวนเมนูที่เลือกได้, features, badge, คอร์สอาหารแต่ละข้อพร้อมจำนวนที่เลือกได้และเมนูที่อยู่ในข้อนั้น)
- **เมนูอาหาร**: สร้าง/แก้ไข/ลบ(soft delete)เมนูในคลัง, อัปโหลดรูปเมนูเป็นไฟล์จริงบน disk (ย่อขนาดก่อนอัปโหลด, ลบไฟล์เก่าอัตโนมัติเมื่อเปลี่ยน/ลบรูป), เปิด/ปิดการแสดงเมนู, ระบบเตือนก่อนลบถ้าเมนูถูกใช้อยู่ในแพ็กเกจ
- **เอกสาร**: ออก/พิมพ์ใบเสนอราคาและใบจองของทุกใบจอง โดยใช้เทมเพลตเดียวกัน อ้างอิงค่าตั้งค่าร้าน (ชื่อร้าน, อัตรามัดจำ ฯลฯ)
- **สิทธิ์การเข้าถึง**: ค้นหาผู้ใช้ (ที่เคย login เข้าระบบมาแล้วอย่างน้อย 1 ครั้ง) ด้วยอีเมล แล้วเลื่อน/ถอดสิทธิ์ owner ให้ได้เอง ไม่ต้องเข้า Auth0 Dashboard, ดูรายชื่อ owner ปัจจุบันทั้งหมด, ระบบกันไม่ให้ถอด owner คนสุดท้ายจนไม่เหลือ owner เลย
- **ตั้งค่า**: แก้ไขข้อมูลร้าน (ชื่อไทย/อังกฤษ, ชื่อย่อ, ที่อยู่, เบอร์โทร, Line), อัตรามัดจำ, ค่าขนส่ง, จำนวนโต๊ะขั้นต่ำสำหรับพื้นที่นอกร้าน — ป้องกันแก้ทับกันด้วย optimistic concurrency (`Settings.version`) มีผลทันทีต่อการคำนวณราคาและเอกสารทั้งระบบ

**หมายเหตุ:** หน้า "ลูกค้า" (รวมใบจองเป็นรายลูกค้าตามเบอร์โทร) ถูกถอดออกจากระบบแล้ว

**ทำไม่ได้ (ยังไม่มีในระบบ):** ไม่มีบทบาทที่ 3 (เช่น staff/พนักงาน), ไม่มีระบบสมาชิกลูกค้าแยกจาก booking, ไม่มี payment gateway (ยังตรวจสลิปโอนเงินด้วยมือ)

### 3.3 สรุปสิทธิ์ระดับ API (backend)

| Endpoint | Customer | Owner | ไม่ระบุ role (ต้อง login เท่านั้น) |
|---|---|---|---|
| `GET /users/me` | ✅ (ของตัวเอง) | ✅ (ของตัวเอง) | ✅ |
| `PATCH /users/me` | ✅ (ของตัวเอง) | ✅ (ของตัวเอง) | ✅ |
| `GET /bookings` | ✅ เห็นเฉพาะของตัวเอง | ✅ เห็นทั้งหมด | — |
| `POST /bookings` | ✅ | ❌ | — |
| `PATCH /bookings/:id` | ❌ | ✅ | — |
| `PATCH /bookings/:id/payment-slip` | ✅ (ของตัวเอง) | ❌ | — |
| `GET /menus` | — | — | ✅ |
| `POST /menus`, `PATCH /menus/:id`, `DELETE /menus/:id` | ❌ | ✅ | — |
| `GET /packages` | — | — | ✅ |
| `POST /packages`, `PATCH /packages/:id`, `DELETE /packages/:id` | ❌ | ✅ | — |
| `GET /settings` | — | — | ✅ |
| `PATCH /settings` | ❌ | ✅ | — |
| `GET /bookings/page` (ค้นหา+แบ่งหน้า) | ✅ เห็นเฉพาะของตัวเอง | ✅ เห็นทั้งหมด | — |
| `POST /uploads/menu-image`, `POST /uploads/promptpay-qr` | ❌ | ✅ | — |
| `POST /uploads/payment-slip` | ✅ | ❌ | — |
| `GET /users/search`, `GET /users/owners`, `PATCH /users/:id/role` | ❌ | ✅ | — |

ควบคุมด้วย `JwtAuthGuard` (ต้องมี token ที่ valid) + `RolesGuard` (เช็ค role จาก DB, ดูหัวข้อ 2.3) ทุก controller ยกเว้น `GET /users/me`/`PATCH /users/me` ที่มีแค่ `JwtAuthGuard`; endpoint อัปโหลดไฟล์มี rate limit เพิ่มเติม (10 ครั้ง/นาที)

---

## 4. Functional Requirements (แยกตามหน้าจอ/โมดูล)

### 4.1 Authentication & Onboarding

| หน้าจอ | ไฟล์ | หน้าที่ |
|---|---|---|
| Login | `src/screens/Login.tsx` | ปุ่มเข้าระบบแบบ Google (customer) และปุ่ม "เข้าระบบด้วยรหัสผ่าน" (username/password) — เรียก `loginWithRedirect` ของ Auth0 พร้อมบังคับ connection ให้ตรง role |
| CompleteProfile | `src/screens/CompleteProfile.tsx` | หลัง login ด้วย Google ครั้งแรก ขอเบอร์โทร/Line ID (ข้อมูลอื่นมากับบัญชี Google แล้ว) เก็บลง local storage ผูกกับ Auth0 `sub` |

### 4.2 ขั้นตอนการจอง (Customer booking flow)

| หน้าจอ | ไฟล์ | หน้าที่ |
|---|---|---|
| Home | `src/screens/Home.tsx` | จุดเริ่มต้น นำทางไปยังขั้นตอนจอง |
| BookingCalendar | `src/screens/BookingCalendar.tsx` | เลือกวันที่/ช่วงเวลา (เช้า/กลางวัน/เย็น/ทั้งวัน), แสดงสถานะคิวแต่ละวัน (ว่าง/เต็ม) จากใบจองจริง |
| SelectTable | `src/screens/SelectTable.tsx` | เลือกจำนวนโต๊ะและจำนวนแขก, แสดง preview ค่าขนส่งตามจำนวนโต๊ะ |
| SelectLocation | `src/screens/SelectLocation.tsx` | ปักหมุด/ค้นหาสถานที่บนแผนที่ (Leaflet + Nominatim), ใช้ตำแหน่ง GPS, กรอกรายละเอียดสถานที่ (บ้านเลขที่, อาคาร, หมู่บ้าน, จุดสังเกต, หมายเหตุการเข้าถึง), ตรวจสอบโซนบริการและบล็อกถ้าจำนวนโต๊ะไม่ถึงขั้นต่ำของโซนนั้น |
| SelectPackage | `src/screens/SelectPackage.tsx` | เลือกแพ็กเกจอาหาร 1 แพ็กเกจ, แสดงราคารวมตามจำนวนโต๊ะ |
| SelectMenu | `src/screens/SelectMenu.tsx` | เลือกเมนูแต่ละคอร์สตามโควตาของแพ็กเกจ, รายการที่รวมมาให้ (choose = 0) ถูกใส่อัตโนมัติ |
| Cart | `src/screens/Cart.tsx` | สรุปออเดอร์ทั้งหมด (วันที่, โต๊ะ, สถานที่, แพ็กเกจ, เมนู, ราคารวม + ค่าขนส่ง), ยืนยันสร้างใบจองสถานะ "รอยืนยัน" |
| BookingHistory | `src/screens/BookingHistory.tsx` | ดูใบจองของตัวเอง, ดู/พิมพ์เอกสาร, แนบรูปสลิปโอนเงิน (ย่อขนาดก่อนบันทึกเข้าใบจอง) |
| Notifications | `src/screens/Notifications.tsx` | หน้าแจ้งเตือนของลูกค้า |

### 4.3 ฝั่งเจ้าของร้าน (Owner back-office)

| หน้าจอ | ไฟล์ | หน้าที่ |
|---|---|---|
| OwnerLayout | `src/components/OwnerLayout.tsx` | Layout + เมนูนำทางของฝั่งเจ้าของร้าน |
| Dashboard | `src/screens/owner/Dashboard.tsx` | สรุปรายได้/จำนวนงาน, %เปลี่ยนแปลงจากเดือนก่อน (งานที่ยกเลิกไม่นับ), กราฟรายได้ 8 เดือนล่าสุด, สัดส่วนแพ็กเกจที่ขาย, งานที่ใกล้ถึงพร้อมกำลังคนที่ต้องใช้ |
| Orders | `src/screens/owner/Orders.tsx` | จัดการใบจองทั้งหมด, เปลี่ยนสถานะ, คำนวณ/ปรับแก้แผนกำลังคนต่องาน (บันทึกทั้งค่าที่ระบบคำนวณและค่าที่ปรับจริง พร้อมหมายเหตุ) |
| CalendarView | `src/screens/owner/CalendarView.tsx` | ปฏิทินรวมใบจองทุกลูกค้า, แก้สถานะจากมุมมองปฏิทิน |
| Packages | `src/screens/owner/Packages.tsx` | CRUD แพ็กเกจอาหาร, จัดการคอร์ส/ข้อในแพ็กเกจ และเมนูที่เลือกได้ในแต่ละข้อ (กรองตามหมวดของข้อนั้น) |
| Menus | `src/screens/owner/Menus.tsx` | CRUD เมนูอาหารในคลัง, อัปโหลด/ย่อรูปภาพ, เตือนก่อนลบถ้าถูกใช้ในแพ็กเกจอยู่ |
| Documents | `src/screens/owner/Documents.tsx` | ออกใบเสนอราคา/ใบจองของทุกใบจอง, สั่งพิมพ์ |
| UserRoles | `src/screens/owner/UserRoles.tsx` | ค้นหาผู้ใช้ด้วยอีเมล (live search), เลื่อน/ถอดสิทธิ์ owner, ดูรายชื่อ owner ทั้งหมด |
| Settings | `src/screens/owner/Settings.tsx` | แก้ไขข้อมูลร้านและค่าคำนวณ (อัตรามัดจำ, ค่าขนส่ง, ขั้นต่ำโต๊ะพื้นที่นอกร้าน) |

### 4.4 Shared components / business logic modules

| ไฟล์ | หน้าที่ |
|---|---|
| `src/components/BookingDocument.tsx` | เทมเพลตเอกสารร่วมสำหรับใบเสนอราคาและใบจอง (ดูหัวข้อ 5.4) |
| `src/components/LocationMap.tsx` | Wrapper ของ Leaflet map: ปักหมุด, ลากหมุด, บินไปตำแหน่งที่ค้นหา/GPS |
| `src/components/DishTile.tsx` | การ์ดแสดงเมนูอาหาร 1 รายการ |
| `src/components/Navbar.tsx` | แถบนำทางฝั่งลูกค้า |
| `src/staffing.ts` | สูตรคำนวณจำนวนพนักงานจากจำนวนโต๊ะ (ดูหัวข้อ 5.1) |
| `src/availability.ts` | สถานะคิวงานรายวัน/รายช่วงเวลา, mapping สถานะใบจอง (ดูหัวข้อ 5.2) |
| `src/geo.ts` | โซนบริการ + คำนวณค่าขนส่ง + geocoding ผ่าน Nominatim (ดูหัวข้อ 5.3) |
| `src/documents.ts` | กำหนดชนิดเอกสาร, เลขที่เอกสาร, วันหมดอายุใบเสนอราคา |
| `src/imageUpload.ts` | อ่านไฟล์รูปจากเครื่องแล้วย่อขนาดก่อนใช้งาน (เมนู, สลิปโอนเงิน) |
| `src/profileStore.ts` | เก็บ/อ่านโปรไฟล์เสริม (เบอร์โทร/Line ID) ใน localStorage ผูกกับ Auth0 sub |
| `src/data.ts` | Mock data ตั้งต้น (เมนู, แพ็กเกจ, ใบจองตัวอย่าง) ที่ frontend ใช้แทน backend อยู่ในปัจจุบัน |

### 4.5 Backend API (`backend/src`)

| Module | Endpoint | Role | หน้าที่ |
|---|---|---|---|
| Users | `GET /users/me` | ทุก role ที่ login แล้ว | sync/สร้าง user record จาก Auth0 JWT ทันทีหลัง login |
| Users | `PATCH /users/me` | ทุก role ที่ login แล้ว | อัปเดตโปรไฟล์ (เบอร์โทร/Line ID ที่ Auth0 ไม่มี) |
| Bookings | `GET /bookings` | customer/owner | owner เห็นทุกใบจอง, customer เห็นเฉพาะของตัวเอง |
| Bookings | `POST /bookings` | customer | สร้างใบจองใหม่ (sync user ก่อนถ้ายังไม่มี record) |
| Bookings | `PATCH /bookings/:id` | owner | แก้ไขใบจอง (สถานะ, แผนกำลังคน ฯลฯ) |
| Bookings | `PATCH /bookings/:id/payment-slip` | customer | แนบ URL สลิปโอนเงินเข้าใบจองของตัวเอง |
| Menus | `GET /menus` | ทุก role ที่ login แล้ว | ดึงคลังเมนูทั้งหมด |
| Menus | `POST /menus`, `PATCH /menus/:id`, `DELETE /menus/:id` | owner | CRUD เมนู |
| Packages | `GET /packages` | ทุก role ที่ login แล้ว | ดึงแพ็กเกจทั้งหมด |
| Packages | `POST /packages`, `PATCH /packages/:id`, `DELETE /packages/:id` | owner | CRUD แพ็กเกจ |
| Settings | `GET /settings` | ทุก role ที่ login แล้ว | ดึงค่าตั้งค่าร้าน |
| Settings | `PATCH /settings` | owner | แก้ไขค่าตั้งค่าร้าน (optimistic concurrency ผ่าน `version`) |
| Bookings | `GET /bookings/page` | customer/owner | ดึงแบบแบ่งหน้า+ค้นหา (ใช้กับ Orders.tsx ฝั่ง owner) |
| Uploads | `POST /uploads/menu-image`, `/promptpay-qr`, `/payment-slip` | owner/owner/customer | อัปโหลดรูปเป็นไฟล์บน disk คืน path สั้น `/uploads/...` |
| Users | `GET /users/search?email=`, `GET /users/owners`, `PATCH /users/:id/role` | owner | ค้นหา/ดูรายชื่อ/เลื่อน-ถอดสิทธิ์ owner |
| Audit | (ภายใน, ไม่มี endpoint เปิดเขียนตรง) | — | `AuditService.log()` บันทึกการลบเมนู/แพ็กเกจ, แก้ไข booking, เปลี่ยน role — ไม่ throw แม้บันทึกไม่สำเร็จ (best-effort) |

---

## 5. กฎธุรกิจหลัก (Business Rules)

### 5.1 การคำนวณจำนวนพนักงาน (`src/staffing.ts`)

คำนวณจากจำนวนโต๊ะที่จอง:

- **พนักงานเสิร์ฟ**: 1 คนดูแล 5–8 โต๊ะ (แสดงเป็นช่วง min–max, ค่าที่ใช้จริงปัดเศษขึ้นจากอัตรา 8 โต๊ะ/คน)
- **พ่อครัว**: 1 คนต่อ 1 งาน เสมอ
- **ผู้ช่วยพ่อครัว**: 1 คนต่อ 20 โต๊ะ, ถ้าเศษเกิน 10 โต๊ะ ให้เพิ่มอีก 1 คน
- **พนักงานล้างจาน**: กฎเดียวกับผู้ช่วยพ่อครัว
- เจ้าของร้านสามารถปรับแก้จำนวนจริงต่างจากที่ระบบคำนวณได้ต่องาน พร้อมหมายเหตุ (เก็บทั้งค่าที่คำนวณอัตโนมัติและค่าที่ใช้จริง)

### 5.2 คิวงานและสถานะวัน (`src/availability.ts`)

- ช่วงเวลาที่จองได้: เช้า (08:00–12:00), กลางวัน (12:00–16:00), เย็น (17:00–21:00), หรือทั้งวัน
- ความจุสูงสุดต่อช่วงเวลา: 500 โต๊ะ
- กติกาปัจจุบัน: **มีใบจอง (สถานะ pending/confirmed/completed) อยู่แล้ววันไหน ถือว่าวันนั้นเต็มทั้งวัน** ไม่รับซ้อนช่วงเวลาอื่นในวันเดียวกัน (ใบจองที่ยกเลิกไม่นับ)

### 5.3 พื้นที่ให้บริการและค่าขนส่ง (`src/geo.ts`)

| โซน | เงื่อนไข | ค่าขนส่ง |
|---|---|---|
| พื้นที่ร้าน (นครปฐม) | รับจัดกี่โต๊ะก็ได้ | ไม่มีค่าขนส่ง |
| กรุงเทพและปริมณฑล (กทม./นนทบุรี/ปทุมธานี/สมุทรปราการ/สมุทรสาคร) | จองได้ทุกจำนวนโต๊ะ | ไม่ถึงขั้นต่ำ (ค่าเริ่มต้น 30 โต๊ะ) คิดค่าขนส่ง (ค่าเริ่มต้น 2,000 บาท) / ถึงขั้นต่ำไม่คิด |
| นอกพื้นที่ให้บริการ | ต้องครบขั้นต่ำโต๊ะจึงจองได้ (ไม่ถึงระบบบล็อก) | ทีมงานแจ้งค่าเดินทางเป็นรายกรณี |

ค่าเริ่มต้นทั้งหมดปรับได้จากหน้า "ตั้งค่า" ฝั่งเจ้าของร้าน (`AppSettings` / `Settings` model)

### 5.4 เอกสาร: ใบเสนอราคา vs ใบจอง (`src/documents.ts`, `src/components/BookingDocument.tsx`)

ใช้เทมเพลตเดียวกัน ข้อมูลราคา/รายการอาหาร/ยอดรวมเหมือนกันทุกจุด ต่างกันเฉพาะ:

| จุดต่าง | ใบเสนอราคา (`quotation`) | ใบจอง (`booking`) |
|---|---|---|
| จุดประสงค์ | เสนอราคาก่อนยืนยันจอง | ยืนยันงานที่จองแล้ว |
| เลขที่เอกสาร | `QT-YYYY-###` | เลขที่จองจริง `BK-YYYY-###` |
| บรรทัดใต้เลขที่ | "ยืนราคาถึง [วันที่]" (7 วันจากวันออกเอกสาร) | สถานะงาน (รอยืนยัน/ยืนยันแล้ว/เสร็จสิ้น/ยกเลิก) |
| เงื่อนไขท้ายเอกสาร | เรื่องราคา มัดจำ ระยะเวลายืนราคา | ขั้นตอนวันงาน, นโยบายยกเลิก |

### 5.5 ผู้ใช้/บัญชี

- ไม่มีระบบ signup แยก — บัญชีสร้าง/sync อัตโนมัติจาก Auth0 JWT ตอน login ครั้งแรก (`findOrCreate` โดยอิง `auth0Sub`)
- ลูกค้าถูกระบุกลุ่มจากเบอร์โทร (fallback เป็นชื่อ) เพราะยังไม่มีระบบสมาชิกแยก

---

## 6. Data Model สรุป (Prisma schema, `backend/prisma/schema.prisma`)

- **User** — `id, auth0Sub(unique), role(CUSTOMER|OWNER), name, surname, phone, lineId, email, avatar, createdAt` → มีหลาย `Booking` — `role` แก้ได้ผ่านหน้า "สิทธิ์การเข้าถึง" หลังสร้างครั้งแรก (ดูหัวข้อ 2.3)
- **MenuItem** — `id, name, category, description, image?, costPrice?, active, deletedAt?` → เชื่อมกับหลาย `PackageCourse` (many-to-many ผ่าน `CourseItems`) — ลบแบบ soft delete (`deletedAt`), ไม่มี `extraPrice` แล้ว
- **Package** — `id, name, pricePerTable, menuLimit, description, features[], badge?, deletedAt?` → มีหลาย `PackageCourse`, มีหลาย `Booking` (ผ่าน `packageId`) — ลบแบบ soft delete
- **PackageCourse** — `id, packageId, no, title, category, choose (0=รวมมาให้แล้ว/>0=เลือกได้กี่อย่าง), items[]`
- **Booking** — `id, customerId?, packageId?, customerName, date, timeSlot, tables, packageName, totalPrice, pricePerTable?, deliveryFee?, status(PENDING|CONFIRMED|COMPLETED|CANCELLED), location, locationDetail(json)?, menus[], phone, staffAuto/staffActual(json)?, staffNote?, staffSavedAt?, paymentSlipUrl?, paymentSlipUploadedAt?, createdAt` — index บน `customerId`, `date`, และ `createdAt`; ราคาทุกฟิลด์คำนวณที่ backend เสมอ ไม่รับจาก client ตรงๆ; กันจองซ้อนวันเดียวกันด้วย Postgres Serializable transaction ตอนสร้าง
- **Settings** — แถวเดียวเสมอ (`id=1`): `shopName, shopNameEn, shopInitials, shopAddress, shopPhone, shopLine, depositRate(0–1), deliveryFee, freeDeliveryMinTables, version, updatedAt` — `version` ใช้กัน optimistic concurrency ตอนแก้ไข
- **AuditLog** — `id, actorAuth0Sub, action, entityType, entityId, before(json)?, after(json)?, createdAt` — บันทึกการลบเมนู/แพ็กเกจ, แก้ไข booking, เปลี่ยน role

---

## 7. Non-functional / Environment

- **Env vars (frontend)**: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` (ใส่เมื่อมี backend API พร้อมใช้)
- **Env vars (backend)**: `PORT`, `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `FRONTEND_ORIGIN` (CORS, รองรับหลายค่าคั่นด้วย comma)
- **Production DB**: PostgreSQL บน Railway (`DATABASE_URL` ชี้ตรงเข้า production ไม่มี staging แยก — migration ทุกครั้งต้อง `pg_dump` backup ก่อนเสมอและเป็นแบบ additive-only เท่านั้น)
- ภาษา UI หลักคือภาษาไทยทั้งระบบ
- มี automated tests ทั้งสองโปรเจกต์ (backend: Jest ครอบคลุม service หลักทุกตัว; frontend: Vitest) และมี GitHub Actions CI (`.github/workflows/ci.yml`) รันแยก job backend/frontend

---

## 8. Gaps / สิ่งที่ยังไม่ได้ทำ

1. รูปภาพ (เมนู/QR/สลิป) เก็บเป็นไฟล์บน disk ของ backend server เอง ยังไม่ได้ย้ายไป Railway Volume หรือ object storage ถาวร — เสี่ยงข้อมูลหายถ้า deploy แบบ ephemeral filesystem
2. ไม่มีระบบแจ้งเตือนแบบ real-time (หน้า Notifications เป็น placeholder, ยังเป็น mock array คงที่)
3. ไม่มีบทบาทที่ 3 เช่น พนักงาน/staff account
4. ไม่มี payment gateway — ตรวจสอบสลิปโอนเงินด้วยมือโดยเจ้าของร้านเท่านั้น (เจตนา ไม่ใช่ gap ที่ต้องแก้)
