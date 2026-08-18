import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { UsersService } from './users.service'

const makeService = () => {
  const prisma = {
    user: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  } as any
  return { service: new UsersService(prisma), prisma }
}

describe('UsersService.syncProfile — ไม่ sync role ทับทุกครั้งที่ login (ฟีเจอร์ owner เลื่อน/ถอดสิทธิ์คนอื่น)', () => {
  it('user เดิม (update) — ไม่ส่ง role ไปแตะเลย', async () => {
    const { service, prisma } = makeService()
    await service.syncProfile('auth0|1', Role.CUSTOMER, { name: 'สมชาย', email: 'a@a.com' } as any)

    const call = prisma.user.upsert.mock.calls[0][0]
    expect(call.update).not.toHaveProperty('role')
  })

  it('user ใหม่ (create) — ยังตั้ง role เริ่มต้นจาก claim ตามปกติ', async () => {
    const { service, prisma } = makeService()
    await service.syncProfile('auth0|1', Role.OWNER, { name: 'สมชาย', email: 'a@a.com' } as any)

    const call = prisma.user.upsert.mock.calls[0][0]
    expect(call.create.role).toBe(Role.OWNER)
  })
})

describe('UsersService.findOwners — รายชื่อ owner ทั้งหมด (หน้าสิทธิ์การเข้าถึง)', () => {
  it('กรองเฉพาะ role OWNER', async () => {
    const { service, prisma } = makeService()
    prisma.user.findMany.mockResolvedValue([])

    await service.findOwners()

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: Role.OWNER },
      orderBy: { createdAt: 'asc' },
    })
  })
})

describe('UsersService.findByEmail — ค้นหาแบบพิมพ์ไม่ครบก็เจอ (live search) ไม่สนตัวพิมพ์เล็กใหญ่', () => {
  it('ใช้ contains ไม่ใช่ equals — พิมพ์บางส่วนของอีเมลก็เจอ', async () => {
    const { service, prisma } = makeService()
    prisma.user.findMany.mockResolvedValue([])

    await service.findByEmail('test@ex')

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { email: { contains: 'test@ex', mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
  })
})

describe('UsersService.setRole — เลื่อน/ถอดสิทธิ์ owner (กันถอด owner คนสุดท้าย)', () => {
  it('เลื่อนเป็น owner — ทำได้ปกติ ไม่ต้องเช็คอะไรเพิ่ม', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.CUSTOMER })
    prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.OWNER })

    const { before, after } = await service.setRole('u1', Role.OWNER)

    expect(prisma.user.count).not.toHaveBeenCalled()
    expect(before.role).toBe(Role.CUSTOMER)
    expect(after.role).toBe(Role.OWNER)
  })

  it('ถอด owner แต่ยังมี owner คนอื่นอยู่ — ทำได้ปกติ', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.OWNER })
    prisma.user.count.mockResolvedValue(2) // ยังมี owner คนอื่นอีก 2 คน
    prisma.user.update.mockResolvedValue({ id: 'u1', role: Role.CUSTOMER })

    const { after } = await service.setRole('u1', Role.CUSTOMER)

    expect(prisma.user.count).toHaveBeenCalledWith({ where: { role: Role.OWNER, id: { not: 'u1' } } })
    expect(after.role).toBe(Role.CUSTOMER)
  })

  it('ถอด owner คนสุดท้าย — ปฏิเสธ ไม่แก้ DB', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.OWNER })
    prisma.user.count.mockResolvedValue(0) // ไม่มี owner คนอื่นเหลือเลย

    await expect(service.setRole('u1', Role.CUSTOMER)).rejects.toThrow(BadRequestException)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('ไม่พบ user เป้าหมาย — throw NotFoundException', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue(null)

    await expect(service.setRole('missing', Role.OWNER)).rejects.toThrow(NotFoundException)
  })
})
