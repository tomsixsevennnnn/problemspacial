import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { AUTH0_ROLE_CLAIM } from './auth.constants'
import { ROLES_KEY } from './roles.decorator'

type AppRole = 'owner' | 'customer'

/**
 * เดิม guard นี้เชื่อ role จาก JWT custom claim ตรงๆ (ข้อ 9 ใน code review) — ถ้า Auth0 Action ที่ฝัง
 * claim ถูกตั้งค่าผิด/ถูกแก้ไข สิทธิ์ทั้งระบบจะเพี้ยนทันทีโดย backend ตรวจจับไม่ได้ ตอนนี้ใช้ User.role ใน DB
 * เป็นความจริงหลักแทน (sync จาก claim ทุกครั้งที่ login ใน users.service.ts syncProfile) — เชื่อ claim ตรงๆ
 * เฉพาะตอนยังไม่มี User row เลย (ก่อน POST /users/me sync ครั้งแรกหลัง login ใหม่) เพื่อไม่ให้ owner ใหม่
 * โดนบล็อกช่วงเสี้ยววินาทีก่อน sync เสร็จ
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private cache = new Map<string, { role: AppRole; at: number }>()
  private readonly CACHE_TTL_MS = 5000

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const request = context.switchToHttp().getRequest()
    const claimRole: AppRole = request.user?.[AUTH0_ROLE_CLAIM] === 'owner' ? 'owner' : 'customer'
    const role = await this.roleFor(request.user?.sub as string | undefined, claimRole)
    if (!required.includes(role)) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้')
    return true
  }

  private async roleFor(auth0Sub: string | undefined, claimRole: AppRole): Promise<AppRole> {
    if (!auth0Sub) return claimRole

    const cached = this.cache.get(auth0Sub)
    if (cached && Date.now() - cached.at < this.CACHE_TTL_MS) return cached.role

    const user = await this.prisma.user.findUnique({ where: { auth0Sub }, select: { role: true } })
    const role: AppRole = user ? (user.role === 'OWNER' ? 'owner' : 'customer') : claimRole
    this.cache.set(auth0Sub, { role, at: Date.now() })
    return role
  }
}
