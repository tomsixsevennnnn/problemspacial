import { ConflictException } from '@nestjs/common'
import { BookingStatus, Prisma } from '@prisma/client'
import { BookingsService } from './bookings.service'

const makeService = () => {
  const prisma = {
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any
  const uploads = { deleteManagedFile: jest.fn() } as any
  return { service: new BookingsService(prisma, {} as any, {} as any, uploads), prisma, uploads }
}

describe('BookingsService.findPageForOwner — performance', () => {
  it('ไม่ include customer — ตาราง Orders.tsx แสดงแค่ customerName/phone ที่ snapshot ไว้ ไม่ได้ใช้ join นี้เลย', async () => {
    const { service, prisma } = makeService()
    await service.findPageForOwner(1, 20)

    const call = prisma.booking.findMany.mock.calls[0][0]
    expect(call.include).toBeUndefined()
  })

  it('ยิง findMany/count พร้อมกันแบบ Promise.all ไม่ห่อด้วย $transaction — ลด round-trip ไป Railway DB', async () => {
    const { service, prisma } = makeService()
    await service.findPageForOwner(1, 20)

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.booking.findMany).toHaveBeenCalled()
    expect(prisma.booking.count).toHaveBeenCalled()
  })
})

describe('BookingsService.findPageForOwner — search (ข้อ 4)', () => {
  it('ไม่มี search — ไม่กรองอะไรเพิ่ม', async () => {
    const { service, prisma } = makeService()
    await service.findPageForOwner(1, 20)

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })

  it('search ตรงรูปแบบเลขที่จอง BK-YYYY-NNN — กรองด้วย bookingYear/bookingNo ตรงเป๊ะ', async () => {
    const { service, prisma } = makeService()
    await service.findPageForOwner(1, 20, 'BK-2026-007')

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingYear: 2026, bookingNo: 7 } }),
    )
  })

  it('search ไม่ตรงรูปแบบเลขที่จอง — ตกเป็นค้นชื่อลูกค้าแบบ contains (ไม่สนตัวพิมพ์เล็กใหญ่)', async () => {
    const { service, prisma } = makeService()
    await service.findPageForOwner(1, 20, 'สมชาย')

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerName: { contains: 'สมชาย', mode: 'insensitive' } } }),
    )
  })

  it('ระบุ status — กรองรวมกับ search ได้', async () => {
    const { service, prisma } = makeService()
    await service.findPageForOwner(1, 20, 'สมชาย', BookingStatus.CONFIRMED)

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerName: { contains: 'สมชาย', mode: 'insensitive' }, status: BookingStatus.CONFIRMED },
      }),
    )
  })
})

describe('BookingsService.findPageForCustomer — ผูก customerId เสมอ', () => {
  it('รวม customerId เข้ากับเงื่อนไขค้นหาเสมอ กันเห็นของคนอื่น', async () => {
    const { service, prisma } = makeService()
    await service.findPageForCustomer('cust_1', 1, 20, 'BK-2026-007')

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'cust_1', bookingYear: 2026, bookingNo: 7 } }),
    )
  })
})

const CREATE_DTO = {
  date: '2026-12-25',
  timeSlot: 'ช่วงเย็น',
  tables: 5,
  packageId: 'pkg_1',
  packageName: 'โต๊ะจีน',
  location: 'ที่ไหนสักแห่ง',
  menus: [] as string[],
} as any

const makeCreateService = () => {
  const tx = {
    booking: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'new_bk' }) },
    bookingCounter: { upsert: jest.fn().mockResolvedValue({ year: 2026, lastNo: 1 }) },
  }
  const prisma = {
    menuItem: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as any
  const pricing = {
    priceFor: jest.fn().mockResolvedValue({ pricePerTable: 1000, deliveryFee: 0, totalPrice: 5000, zone: 'home' }),
  } as any
  const service = new BookingsService(prisma, pricing, {} as any, {} as any)
  return { service, prisma, tx, pricing }
}

describe('BookingsService.create — กันจองซ้อนวันเดียวกัน (ข้อ: race condition วันที่จอง)', () => {
  it('วันนั้นยังไม่มีใครจอง — สร้าง booking ได้ตามปกติ', async () => {
    const { service, tx } = makeCreateService()

    await service.create('cust_1', 'สมชาย', '0812345678', CREATE_DTO)

    expect(tx.booking.findFirst).toHaveBeenCalledWith({
      where: { date: '2026-12-25', status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } },
    })
    expect(tx.booking.create).toHaveBeenCalled()
  })

  it('วันนั้นมี booking active อยู่แล้ว — ปฏิเสธทันที ไม่ออกเลขที่/ไม่สร้างใหม่', async () => {
    const { service, tx } = makeCreateService()
    tx.booking.findFirst.mockResolvedValue({ id: 'existing_bk' })

    await expect(service.create('cust_1', 'สมชาย', '0812345678', CREATE_DTO)).rejects.toThrow(ConflictException)

    expect(tx.bookingCounter.upsert).not.toHaveBeenCalled()
    expect(tx.booking.create).not.toHaveBeenCalled()
  })

  it('ใช้ isolation level Serializable เสมอ — กันสอง transaction ที่รันพร้อมกันเป๊ะๆ ผ่านการเช็คได้ทั้งคู่', async () => {
    const { service, prisma } = makeCreateService()

    await service.create('cust_1', 'สมชาย', '0812345678', CREATE_DTO)

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  })

  it('Postgres serialization failure (P2034) — แปลงเป็นข้อความที่เข้าใจง่าย ไม่ปล่อย error ดิบออกไป', async () => {
    const { service, prisma } = makeCreateService()
    prisma.$transaction.mockImplementation(() => {
      throw new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      })
    })

    await expect(service.create('cust_1', 'สมชาย', '0812345678', CREATE_DTO)).rejects.toThrow(
      'มีคนกำลังจองวันนี้พร้อมกันอยู่ กรุณาลองใหม่อีกครั้ง',
    )
  })
})

describe('BookingsService.updatePaymentSlipAsCustomer — ลบสลิปเก่าตอนแนบใหม่ (ข้อ 1)', () => {
  const EXISTING_BOOKING = { id: 'bk_1', customerId: 'cust_1', paymentSlipUrl: '/uploads/slips/old.jpg' }

  it('แนบสลิปใหม่ทับของเดิม — ลบไฟล์เก่าทิ้งหลัง update สำเร็จ', async () => {
    const { service, prisma, uploads } = makeService()
    prisma.booking.findUnique.mockResolvedValue(EXISTING_BOOKING)
    prisma.booking.update.mockResolvedValue({ ...EXISTING_BOOKING, paymentSlipUrl: '/uploads/slips/new.jpg' })

    await service.updatePaymentSlipAsCustomer('bk_1', 'cust_1', '/uploads/slips/new.jpg')

    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/slips/old.jpg')
  })

  it('ยังไม่เคยมีสลิปมาก่อน — ไม่มีอะไรให้ลบ', async () => {
    const { service, prisma, uploads } = makeService()
    prisma.booking.findUnique.mockResolvedValue({ ...EXISTING_BOOKING, paymentSlipUrl: null })
    prisma.booking.update.mockResolvedValue({ ...EXISTING_BOOKING, paymentSlipUrl: '/uploads/slips/new.jpg' })

    await service.updatePaymentSlipAsCustomer('bk_1', 'cust_1', '/uploads/slips/new.jpg')

    expect(uploads.deleteManagedFile).not.toHaveBeenCalled()
  })
})
