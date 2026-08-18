import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { BookingStatus, Role } from '@prisma/client'
import { Throttle } from '@nestjs/throttler'
import { AUTH0_ROLE_CLAIM } from '../auth/auth.constants'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { UsersService } from '../users/users.service'
import { BookingsService } from './bookings.service'
import { CreateBookingDto } from './dto/create-booking.dto'
import { UpdateBookingDto } from './dto/update-booking.dto'
import { UpdatePaymentSlipDto } from './dto/update-payment-slip.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings')
export class BookingsController {
  constructor(
    private bookings: BookingsService,
    private users: UsersService,
  ) {}

  /** owner เห็นทุกใบจอง, customer เห็นเฉพาะของตัวเอง */
  @Get()
  async findAll(@CurrentUser() jwtUser: Record<string, any>) {
    if (jwtUser[AUTH0_ROLE_CLAIM] === 'owner') return this.bookings.findAllForOwner()

    const user = await this.syncCustomer(jwtUser)
    return this.bookings.findAllForCustomer(user.id)
  }

  /** คิวรับงานทุกใบจอง (ไม่มีข้อมูลส่วนตัว) — ใช้เช็ควัน/ช่วงเวลาที่เต็มแล้วตอนลูกค้าเลือกวันจัดงาน */
  @Get('availability')
  findAvailability() {
    return this.bookings.findAvailability()
  }

  /**
   * เวอร์ชัน paginate ของ GET /bookings — ใช้เฉพาะหน้ารายการ (Orders ฝั่ง owner, ประวัติการจองฝั่งลูกค้า)
   * ไม่แทนที่ GET /bookings เดิม เพราะหน้าอื่น (Dashboard/Reports/Calendar/Documents) ยังต้องใช้ข้อมูลทั้งชุด
   */
  @Get('page')
  async findPage(
    @CurrentUser() jwtUser: Record<string, any>,
    @Query('page') pageQ?: string,
    @Query('pageSize') pageSizeQ?: string,
    @Query('search') search?: string,
    @Query('status') statusQ?: string,
  ) {
    const page = Math.max(1, Number(pageQ) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeQ) || 20))
    const status = statusQ && statusQ.toUpperCase() in BookingStatus ? (statusQ.toUpperCase() as BookingStatus) : undefined

    if (jwtUser[AUTH0_ROLE_CLAIM] === 'owner') return this.bookings.findPageForOwner(page, pageSize, search, status)

    const user = await this.syncCustomer(jwtUser)
    return this.bookings.findPageForCustomer(user.id, page, pageSize, search, status)
  }

  /** กัน spam จอง — 10 ครั้ง/นาที/ผู้ใช้ ก็เกินพอสำหรับลูกค้าจริงแล้ว */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @Roles('customer')
  async create(@CurrentUser() jwtUser: Record<string, any>, @Body() dto: CreateBookingDto) {
    const user = await this.syncCustomer(jwtUser)
    return this.bookings.create(user.id, `${user.name} ${user.surname}`.trim(), user.phone, dto)
  }

  @Patch(':id')
  @Roles('owner')
  updateAsOwner(@CurrentUser() jwtUser: Record<string, any>, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookings.updateAsOwner(jwtUser.sub, id, dto)
  }

  @Patch(':id/payment-slip')
  @Roles('customer')
  async uploadSlip(
    @CurrentUser() jwtUser: Record<string, any>,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentSlipDto,
  ) {
    const user = await this.syncCustomer(jwtUser)
    return this.bookings.updatePaymentSlipAsCustomer(id, user.id, dto.paymentSlipUrl)
  }

  private syncCustomer(jwtUser: Record<string, any>) {
    return this.users.findOrCreate({
      auth0Sub: jwtUser.sub,
      role: Role.CUSTOMER,
      name: jwtUser.given_name ?? jwtUser.name ?? 'ผู้ใช้',
      surname: jwtUser.family_name ?? '',
      email: jwtUser.email ?? '',
      avatar: jwtUser.picture ?? '',
    })
  }
}
