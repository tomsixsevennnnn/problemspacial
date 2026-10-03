import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { RealtimeTopic } from '../realtime/realtime-topic.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { CreateMenuItemDto } from './dto/create-menu-item.dto'
import { ListMenusQueryDto } from './dto/list-menus-query.dto'
import { UpdateMenuItemDto } from './dto/update-menu-item.dto'
import { MenusService } from './menus.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@RealtimeTopic('catalog')
@Controller('menus')
export class MenusController {
  constructor(private menus: MenusService) {}

  @Get()
  findAll(@Query() query: ListMenusQueryDto) {
    return this.menus.findAll(query)
  }

  @Post()
  @Roles('owner')
  create(@Body() dto: CreateMenuItemDto) {
    return this.menus.create(dto)
  }

  @Patch(':id')
  @Roles('owner')
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menus.update(id, dto)
  }

  @Delete(':id')
  @Roles('owner')
  remove(@CurrentUser() jwtUser: Record<string, any>, @Param('id') id: string) {
    return this.menus.remove(jwtUser.sub, id)
  }
}
