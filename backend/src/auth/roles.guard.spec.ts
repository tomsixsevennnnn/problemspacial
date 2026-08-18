import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH0_ROLE_CLAIM } from './auth.constants'
import { RolesGuard } from './roles.guard'

const makeContext = (user: Record<string, unknown> | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext

/** mock PrismaService ขั้นต่ำ — คืน user ที่กำหนดไว้ล่วงหน้าตาม auth0Sub */
const makePrisma = (usersBySub: Record<string, { role: 'OWNER' | 'CUSTOMER' }>) =>
  ({
    user: {
      findUnique: jest.fn(({ where: { auth0Sub } }: { where: { auth0Sub: string } }) =>
        Promise.resolve(usersBySub[auth0Sub] ?? null),
      ),
    },
  }) as any

const makeGuard = (required: string[] | undefined, usersBySub: Record<string, { role: 'OWNER' | 'CUSTOMER' }> = {}) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector
  return new RolesGuard(reflector, makePrisma(usersBySub))
}

describe('RolesGuard', () => {
  it('อนุญาตผ่านถ้า endpoint ไม่ได้ระบุ @Roles ไว้', async () => {
    const guard = makeGuard(undefined)
    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(true)
  })

  it('อนุญาต owner เข้า endpoint ที่ต้องการ owner (ตาม role ใน DB)', async () => {
    const guard = makeGuard(['owner'], { sub_1: { role: 'OWNER' } })
    const context = makeContext({ sub: 'sub_1', [AUTH0_ROLE_CLAIM]: 'owner' })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('บล็อก customer ไม่ให้เข้า endpoint ที่ต้องการ owner', async () => {
    const guard = makeGuard(['owner'], { sub_1: { role: 'CUSTOMER' } })
    const context = makeContext({ sub: 'sub_1', [AUTH0_ROLE_CLAIM]: 'customer' })
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })

  it('ไม่มี claim role เลย และไม่มี user ใน DB = ถือเป็น customer โดย default (ไม่ใช่ owner)', async () => {
    const guard = makeGuard(['owner'])
    const context = makeContext({ sub: 'sub_unknown' })
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })

  it('อนุญาต customer เข้า endpoint ที่ต้องการ customer', async () => {
    const guard = makeGuard(['customer'], { sub_1: { role: 'CUSTOMER' } })
    const context = makeContext({ sub: 'sub_1', [AUTH0_ROLE_CLAIM]: 'customer' })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('ยึด role ใน DB เป็นหลัก แม้ claim ใน token จะไม่ตรง (กัน token เก่า/claim ผิดพลาด)', async () => {
    // DB บอกว่าเป็น customer แล้ว (เช่นถูกลดสิทธิ์) แต่ token เก่ายังมี claim เป็น owner ค้างอยู่
    const guard = makeGuard(['owner'], { sub_1: { role: 'CUSTOMER' } })
    const context = makeContext({ sub: 'sub_1', [AUTH0_ROLE_CLAIM]: 'owner' })
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
  })

  it('ยังไม่มี user row ใน DB (ก่อน sync ครั้งแรก) — เชื่อ claim ไปก่อนชั่วคราว', async () => {
    const guard = makeGuard(['owner'])
    const context = makeContext({ sub: 'sub_new', [AUTH0_ROLE_CLAIM]: 'owner' })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })
})
