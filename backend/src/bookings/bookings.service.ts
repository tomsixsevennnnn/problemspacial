import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { BookingStatus, Prisma } from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { CreateBookingDto } from './dto/create-booking.dto'
import { UpdateBookingDto } from './dto/update-booking.dto'
import { PricingService } from './pricing.service'

/** สถานะที่ยังกินคิว/วันอยู่ — ต้องตรงกับ OCCUPIES_QUEUE ฝั่ง frontend src/availability.ts (ยกเลิกแล้วไม่นับ) */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED]

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private audit: AuditService,
    private uploads: UploadsService,
  ) {}

  /** owner เห็นข้อมูลลูกค้าปัจจุบันจริง (ชื่อ/นามสกุล/อีเมล/Line ID) ผ่านความสัมพันธ์กับ User — ต่างจาก customerName/phone/lineId ที่ snapshot ไว้ตอนจอง */
  findAllForOwner() {
    return this.prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, surname: true, email: true, lineId: true } } },
    })
  }

  findAllForCustomer(customerId: string) {
    return this.prisma.booking.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } })
  }

  /** เลขที่ใบจองรูปแบบ "BK-2026-007" (ดู docNumber ฝั่ง frontend src/documents.ts) — parse เป็น bookingYear/bookingNo
   *  เพื่อค้นแบบตรงเป๊ะได้ ถ้า search ไม่ตรงรูปแบบนี้ถือว่าเป็นการค้นชื่อลูกค้าแทน */
  private searchWhere(search: string | undefined) {
    const term = search?.trim()
    if (!term) return undefined

    const bkMatch = /^bk-(\d{4})-(\d+)$/i.exec(term)
    if (bkMatch) return { bookingYear: Number(bkMatch[1]), bookingNo: Number(bkMatch[2]) }

    return { customerName: { contains: term, mode: 'insensitive' as const } }
  }

  /**
   * เวอร์ชัน paginate ของ findAllForOwner — ใช้เฉพาะหน้ารายการที่ต้องแสดงทีละหน้า (เช่น Orders)
   * ไม่แตะ findAllForOwner/findAllForCustomer เดิม เพราะหน้าอื่น (Dashboard/Reports/Calendar/Documents)
   * ยังต้องใช้ bookings ทั้งชุดคำนวณสรุปยอด/กราฟ/ปฏิทิน
   *
   * ไม่ include customer เหมือน findAllForOwner — ตารางรายการที่ใช้ endpoint นี้ (Orders.tsx) แสดงแค่
   * customerName/phone ที่ snapshot ไว้ในแถวเองอยู่แล้ว ส่วนแผงรายละเอียดที่ต้องใช้ .customer.* จริงๆ
   * อ่านจาก bookings เต็มชุด (findAllForOwner) ที่โหลดแยกไว้ต่างหาก — join ตรงนี้เลยเสียเปล่าทุกครั้งที่พลิกหน้า/ค้นหา
   *
   * ใช้ Promise.all แทน $transaction — สอง query นี้อ่านอย่างเดียว ไม่ต้องการความสอดคล้องกันแบบทรานแซกชัน
   * (นับได้คลาดเคลื่อนกันบ้างระหว่างสอง query ไม่มีผลต่อ UX) ปล่อยให้ยิงพร้อมกันได้ ลด round-trip ที่ DB
   * อยู่ไกล (Railway) แทนที่จะรอ query แรกจบในทรานแซกชันเดียวกันก่อน
   */
  async findPageForOwner(page: number, pageSize: number, search?: string, status?: BookingStatus) {
    const skip = (page - 1) * pageSize
    const where = { ...this.searchWhere(search), ...(status ? { status } : {}) }
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findPageForCustomer(customerId: string, page: number, pageSize: number, search?: string, status?: BookingStatus) {
    const skip = (page - 1) * pageSize
    const where = { customerId, ...this.searchWhere(search), ...(status ? { status } : {}) }
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  /** คิวรับงานแบบไม่มีข้อมูลส่วนตัว — ให้ลูกค้าทุกคนเช็คว่าวัน/ช่วงเวลาไหนเต็มแล้วบ้าง ไม่ใช่แค่ใบจองของตัวเอง */
  findAvailability() {
    return this.prisma.booking.findMany({
      select: { date: true, timeSlot: true, tables: true, status: true },
    })
  }

  /**
   * เลขที่ใบจอง BK-{ปี}-{เลขลำดับ} ออกจาก BookingCounter แบบ atomic ในทรานแซกชันเดียวกับการสร้างใบจอง กันเลขชนกันตอนจองพร้อมกัน
   *
   * เช็ค "วันนี้มีงานจองไปแล้วหรือยัง" ในทรานแซกชันเดียวกันด้วย (กติการ้าน: 1 วันรับได้แค่ 1 งาน — ทีมงาน/รถมีชุดเดียว)
   * เดิมกติกานี้ถูกบังคับแค่ฝั่ง UI เท่านั้น (ปฏิทิน disable วันที่เต็ม) backend ไม่เคยเช็คซ้ำเลย ทำให้ลูกค้า 2 คน
   * จองวันเดียวกันพร้อมกันได้จริง (race condition) หรือใครก็ตามยิง POST ตรงๆ ก็จองซ้อนวันที่ "เต็ม" ได้เลย (ข้อ 1
   * ในเชิง pattern เดียวกัน — เชื่อ client มากไปในจุดที่กระทบธุรกิจจริง)
   *
   * ใช้ isolation level Serializable กันไม่ให้สอง transaction ที่รันพร้อมกันเป๊ะๆ ผ่านการเช็คนี้ทั้งคู่ — ถ้าชนกันจริง
   * Postgres จะทำให้ transaction หนึ่งล้มเหลวด้วย serialization error (Prisma error code P2034) ซึ่ง catch แปลงเป็น
   * ข้อความที่เข้าใจง่ายด้านล่าง ไม่ต้องเพิ่ม unique constraint ใหม่ใน schema (ไม่ต้อง migration)
   */
  async create(customerId: string, customerName: string, phone: string, dto: CreateBookingDto) {
    await this.assertMenusAvailable(dto.menus)

    // ราคาคำนวณจาก Package/Settings ใน DB เสมอ — ไม่เชื่อตัวเลขจาก client (ดู pricing.service.ts)
    const price = await this.pricing.priceFor(dto.packageId, dto.tables, dto.locationDetail)

    const locationDetail = dto.locationDetail
      ? { ...dto.locationDetail, zone: price.zone, distanceKm: price.distanceKm }
      : undefined

    const bookingYear = new Date().getFullYear()

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const conflict = await tx.booking.findFirst({
            where: { date: dto.date, status: { in: ACTIVE_BOOKING_STATUSES } },
          })
          if (conflict) throw new ConflictException('วันที่นี้มีการจองไปแล้ว กรุณาเลือกวันอื่น')

          const counter = await tx.bookingCounter.upsert({
            where: { year: bookingYear },
            create: { year: bookingYear, lastNo: 1 },
            update: { lastNo: { increment: 1 } },
          })
          return tx.booking.create({
            data: {
              customerId,
              customerName,
              phone,
              bookingYear,
              bookingNo: counter.lastNo,
              date: dto.date,
              timeSlot: dto.timeSlot,
              tables: dto.tables,
              packageId: dto.packageId,
              packageName: dto.packageName,
              totalPrice: price.totalPrice,
              pricePerTable: price.pricePerTable,
              deliveryFee: price.deliveryFee,
              location: dto.location,
              locationDetail: locationDetail as any,
              menus: dto.menus,
              lineId: dto.lineId,
            },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictException('มีคนกำลังจองวันนี้พร้อมกันอยู่ กรุณาลองใหม่อีกครั้ง')
      }
      throw err
    }
  }

  /** กัน booking ที่อ้างเมนูซึ่งไม่มีจริงหรือถูกปิดการขายไปแล้ว */
  private async assertMenusAvailable(menuNames: string[]) {
    if (menuNames.length === 0) return
    const activeMenus = await this.prisma.menuItem.findMany({
      where: { name: { in: menuNames }, active: true, deletedAt: null },
      select: { name: true },
    })
    const found = new Set(activeMenus.map((m) => m.name))
    const missing = menuNames.filter((name) => !found.has(name))
    if (missing.length > 0) throw new BadRequestException(`เมนูไม่พร้อมให้บริการ: ${missing.join(', ')}`)
  }

  async updateAsOwner(auth0Sub: string, id: string, dto: UpdateBookingDto) {
    const before = await this.assertExists(id)
    const after = await this.prisma.booking.update({
      where: { id },
      data: {
        status: dto.status,
        staffAuto: dto.staffAuto as any,
        staffActual: dto.staffActual as any,
        staffNote: dto.staffNote,
        ...(dto.staffActual ? { staffSavedAt: new Date() } : {}),
      },
    })
    await this.audit.log(auth0Sub, 'booking.update', 'Booking', id, before, after)
    return after
  }

  /** ถ้าลูกค้าแนบสลิปใหม่ทับของเดิม ลบไฟล์สลิปเก่าทิ้งหลัง update สำเร็จ กันไฟล์ orphan ค้าง disk (ข้อ 1) */
  async updatePaymentSlipAsCustomer(id: string, customerId: string, paymentSlipUrl: string) {
    const booking = await this.assertExists(id)
    if (booking.customerId !== customerId) throw new ForbiddenException('ไม่มีสิทธิ์แก้ไขใบจองนี้')

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { paymentSlipUrl, paymentSlipUploadedAt: new Date() },
    })

    if (booking.paymentSlipUrl && booking.paymentSlipUrl !== paymentSlipUrl) {
      await this.uploads.deleteManagedFile(booking.paymentSlipUrl)
    }
    return updated
  }

  private async assertExists(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } })
    if (!booking) throw new NotFoundException('ไม่พบใบจองนี้')
    return booking
  }
}
