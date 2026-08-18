import { NotFoundException } from '@nestjs/common'
import { MenusService } from './menus.service'

const EXISTING = { id: 'menu_1', name: 'ต้มยำกุ้ง', deletedAt: null, image: '/uploads/menus/old.jpg' }

const makeService = () => {
  const prisma = {
    menuItem: {
      findUnique: jest.fn().mockResolvedValue(EXISTING),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...EXISTING, ...data })),
      findMany: jest.fn(),
    },
  } as any
  const audit = { log: jest.fn() } as any
  const uploads = { deleteManagedFile: jest.fn() } as any
  return { service: new MenusService(prisma, audit, uploads), prisma, audit, uploads }
}

describe('MenusService.remove — soft delete (ข้อ 5)', () => {
  it('ตั้ง deletedAt แทนการลบแถวจริง (ไม่เรียก prisma.menuItem.delete)', async () => {
    const { service, prisma } = makeService()
    const result = await service.remove('auth0|owner1', 'menu_1')

    expect(prisma.menuItem.delete).toBeUndefined()
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'menu_1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(result.deletedAt).toBeInstanceOf(Date)
  })

  it('บันทึก audit log พร้อม before/after', async () => {
    const { service, audit } = makeService()
    await service.remove('auth0|owner1', 'menu_1')

    expect(audit.log).toHaveBeenCalledWith(
      'auth0|owner1',
      'menu.delete',
      'MenuItem',
      'menu_1',
      EXISTING,
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
  })

  it('ไม่พบเมนู — throw NotFoundException ไม่เขียน audit', async () => {
    const { service, prisma, audit } = makeService()
    prisma.menuItem.findUnique.mockResolvedValue(null)

    await expect(service.remove('auth0|owner1', 'missing')).rejects.toThrow(NotFoundException)
    expect(audit.log).not.toHaveBeenCalled()
  })

  it('findAll กรอง deletedAt: null เสมอ', async () => {
    const { service, prisma } = makeService()
    prisma.menuItem.findMany.mockResolvedValue([])
    await service.findAll()

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    })
  })
})

describe('MenusService.update — ลบไฟล์รูปเก่าตอนเปลี่ยนรูป (ข้อ 1)', () => {
  it('image เปลี่ยนเป็นค่าใหม่ — ลบไฟล์เก่าทิ้งหลัง update สำเร็จ', async () => {
    const { service, prisma, uploads } = makeService()
    prisma.menuItem.update.mockResolvedValue({ ...EXISTING, image: '/uploads/menus/new.jpg' })

    await service.update('menu_1', { image: '/uploads/menus/new.jpg' } as any)

    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/menus/old.jpg')
  })

  it('ไม่แตะ image เลย — ไม่ query หารูปเดิมและไม่ลบอะไร', async () => {
    const { service, prisma, uploads } = makeService()

    await service.update('menu_1', { name: 'ชื่อใหม่' } as any)

    expect(prisma.menuItem.findUnique).not.toHaveBeenCalled()
    expect(uploads.deleteManagedFile).not.toHaveBeenCalled()
  })

  it('image ถูกลบ (ส่ง "" มาจากปุ่ม "ลบรูป") — ลบไฟล์เก่าทิ้งเหมือนกัน (ข้อ 7)', async () => {
    const { service, prisma, uploads } = makeService()
    prisma.menuItem.update.mockResolvedValue({ ...EXISTING, image: '' })

    await service.update('menu_1', { image: '' } as any)

    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'menu_1' }, data: { image: '' } })
    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/menus/old.jpg')
  })
})
