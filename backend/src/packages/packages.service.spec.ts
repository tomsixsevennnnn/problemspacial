import { NotFoundException } from '@nestjs/common'
import { PackagesService } from './packages.service'

const EXISTING = { id: 'pkg_1', name: 'โต๊ะจีน 2,000', deletedAt: null }

const PKG_COURSES = [
  { id: 'c1', no: 1, title: 'ของทานเล่น', icon: null, category: 'snack', choose: 0, items: [{ id: 'item1' }, { id: 'item2' }] },
  { id: 'c2', no: 2, title: 'จานหลัก', icon: '🍜', category: 'main', choose: 2, items: [{ id: 'item3' }] },
]

const SAME_COURSE_INPUT = [
  { no: 1, title: 'ของทานเล่น', icon: undefined, category: 'snack', choose: 0, itemIds: ['item2', 'item1'] }, // ลำดับ itemIds สลับกันได้ ไม่นับว่าเปลี่ยน
  { no: 2, title: 'จานหลัก', icon: '🍜', category: 'main', choose: 2, itemIds: ['item3'] },
]

const makeService = () => {
  const prisma = {
    package: {
      findUnique: jest.fn().mockResolvedValue(EXISTING),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...EXISTING, ...data })),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    packageCourse: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  } as any
  const audit = { log: jest.fn() } as any
  return { service: new PackagesService(prisma, audit), prisma, audit }
}

describe('PackagesService.remove — soft delete (ข้อ 5)', () => {
  it('ตั้ง deletedAt แทนการลบแถวจริง — booking เก่าที่อ้าง packageId นี้ไม่พัง', async () => {
    const { service, prisma } = makeService()
    const result = await service.remove('auth0|owner1', 'pkg_1')

    expect(prisma.package.delete).toBeUndefined()
    expect(prisma.package.update).toHaveBeenCalledWith({
      where: { id: 'pkg_1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(result.deletedAt).toBeInstanceOf(Date)
  })

  it('บันทึก audit log พร้อม before/after', async () => {
    const { service, audit } = makeService()
    await service.remove('auth0|owner1', 'pkg_1')

    expect(audit.log).toHaveBeenCalledWith(
      'auth0|owner1',
      'package.delete',
      'Package',
      'pkg_1',
      EXISTING,
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
  })

  it('ไม่พบแพ็กเกจ — throw NotFoundException ไม่เขียน audit', async () => {
    const { service, prisma, audit } = makeService()
    prisma.package.findUnique.mockResolvedValue(null)

    await expect(service.remove('auth0|owner1', 'missing')).rejects.toThrow(NotFoundException)
    expect(audit.log).not.toHaveBeenCalled()
  })

  it('findAll กรอง deletedAt: null และเมนูที่ถูกลบใน course ด้วย', async () => {
    const { service, prisma } = makeService()
    prisma.package.findMany.mockResolvedValue([])
    await service.findAll()

    expect(prisma.package.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        courses: {
          include: { items: { where: { deletedAt: null } } },
          orderBy: { no: 'asc' },
        },
      },
    })
  })
})

describe('PackagesService.update — ข้าม delete+recreate ถ้า courses ไม่ได้เปลี่ยนจริง (แก้ owner แก้แพ็กเกจ/เมนูช้า)', () => {
  it('courses เหมือนเดิมทุกอย่าง (แค่แก้ชื่อ/ราคา) — อัปเดตแบบ round trip เดียว ไม่แตะ packageCourse เลย', async () => {
    const { service, prisma } = makeService()
    prisma.package.findUnique.mockResolvedValue({ ...EXISTING, courses: PKG_COURSES })

    await service.update('pkg_1', { name: 'ชื่อใหม่', pricePerTable: 2500, courses: SAME_COURSE_INPUT } as any)

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.packageCourse.deleteMany).not.toHaveBeenCalled()
    expect(prisma.package.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pkg_1' }, data: expect.objectContaining({ name: 'ชื่อใหม่', pricePerTable: 2500 }) }),
    )
  })

  it('จำนวน courses เปลี่ยน (เพิ่ม/ลบข้อ) — ถือว่าเปลี่ยนจริง ทำ delete+recreate ทั้งชุด', async () => {
    const { service, prisma } = makeService()
    prisma.package.findUnique.mockResolvedValue({ ...EXISTING, courses: PKG_COURSES })
    prisma.$transaction.mockImplementation((fn: any) =>
      fn({ packageCourse: prisma.packageCourse, package: prisma.package }),
    )

    const changedInput = [...SAME_COURSE_INPUT, { no: 3, title: 'ของหวาน', category: 'dessert', choose: 0, itemIds: [] }]
    await service.update('pkg_1', { courses: changedInput } as any)

    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('รายการเมนูใน course เดียวกันเปลี่ยน — ถือว่าเปลี่ยนจริง ทำ delete+recreate ทั้งชุด', async () => {
    const { service, prisma } = makeService()
    prisma.package.findUnique.mockResolvedValue({ ...EXISTING, courses: PKG_COURSES })
    prisma.$transaction.mockImplementation((fn: any) =>
      fn({ packageCourse: prisma.packageCourse, package: prisma.package }),
    )

    const changedInput = SAME_COURSE_INPUT.map((c, i) => (i === 0 ? { ...c, itemIds: ['item1'] } : c))
    await service.update('pkg_1', { courses: changedInput } as any)

    expect(prisma.$transaction).toHaveBeenCalled()
  })
})
