import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { AuditService } from '../audit/audit.service'
import { AUTH0_ROLE_CLAIM } from '../auth/auth.constants'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { SetRoleDto } from './dto/set-role.dto'
import { SyncProfileDto } from './dto/sync-profile.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { UsersService } from './users.service'

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private users: UsersService,
    private audit: AuditService,
  ) {}

  /**
   * frontend เรียกทันทีหลัง login สำเร็จ — ส่ง profile จาก ID token มาเอง (access token ไม่มี
   * name/email/picture ให้ เพราะ Auth0 Action ใส่แค่ custom claim ของ role ลง token)
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me')
  sync(@CurrentUser() jwtUser: Record<string, any>, @Body() dto: SyncProfileDto) {
    const role = jwtUser[AUTH0_ROLE_CLAIM] === 'owner' ? Role.OWNER : Role.CUSTOMER
    return this.users.syncProfile(jwtUser.sub, role, dto)
  }

  /** บันทึกเบอร์โทร/Line ID ที่ Auth0 ไม่มีให้ (ดูหน้า CompleteProfile ฝั่ง frontend) */
  @Patch('me')
  updateProfile(@CurrentUser() jwtUser: Record<string, any>, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(jwtUser.sub, dto)
  }

  /** owner ค้นหาผู้ใช้ที่เคย login แล้วด้วยอีเมล เพื่อจะเลื่อน/ถอดสิทธิ์ owner — ต้องเคย login มาก่อนอย่างน้อย 1 ครั้ง */
  @UseGuards(RolesGuard)
  @Roles('owner')
  @Get('search')
  search(@Query('email') email?: string) {
    if (!email?.trim()) throw new BadRequestException('กรุณาระบุอีเมลที่ต้องการค้นหา')
    return this.users.findByEmail(email.trim())
  }

  /** owner ดูรายชื่อ owner ทั้งหมดตอนนี้ — โชว์ในหน้า "สิทธิ์การเข้าถึง" ไม่ต้องค้นหาทีละอีเมลถึงจะเห็นภาพรวม */
  @UseGuards(RolesGuard)
  @Roles('owner')
  @Get('owners')
  listOwners() {
    return this.users.findOwners()
  }

  /** owner เลื่อน/ถอดสิทธิ์ owner ให้ user คนอื่น — ไม่ต้องพึ่ง Auth0 dashboard อีกต่อไป */
  @UseGuards(RolesGuard)
  @Roles('owner')
  @Patch(':id/role')
  async setRole(@CurrentUser() jwtUser: Record<string, any>, @Param('id') id: string, @Body() dto: SetRoleDto) {
    const { before, after } = await this.users.setRole(id, dto.role)
    await this.audit.log(
      jwtUser.sub,
      dto.role === Role.OWNER ? 'user.role.promote' : 'user.role.demote',
      'User',
      id,
      before,
      after,
    )
    return after
  }
}
