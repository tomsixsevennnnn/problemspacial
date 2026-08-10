import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { UpdateSettingsDto } from './dto/update-settings.dto'
import { SettingsService } from './settings.service'

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  /** ข้อมูลร้านสาธารณะ — ไม่ต้อง login ใช้กับหน้า Login และตั้งชื่อแท็บเบราว์เซอร์ก่อน login */
  @Get('public')
  getPublic() {
    return this.settings.getPublicShopInfo()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  get() {
    return this.settings.get()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch()
  @Roles('owner')
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto)
  }
}
