import { Role } from '@prisma/client'
import { UsersService } from './users.service'

const makeService = () => {
  const prisma = {
    user: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as any
  return { service: new UsersService(prisma), prisma }
}

describe('UsersService.syncProfile — ไม่ sync role ทับทุกครั้งที่ login', () => {
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
