import { Injectable } from '@nestjs/common'
import type { MenuItem } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMenuItemDto } from './dto/create-menu-item.dto'
import { UpdateMenuItemDto } from './dto/update-menu-item.dto'

@Injectable()
export class MenusService {
  constructor(private prisma: PrismaService) {}

  /** cache รายการเมนูไว้ในหน่วยความจำ — DB จริงอยู่ที่ Railway แต่ละ query กิน ~300-800ms (ดู settings.service.ts)
   *  เมนูแก้ไขน้อย (เฉพาะเจ้าของร้าน) ทุก mutation ในไฟล์นี้จึงล้าง cache ทันทีอยู่แล้ว ไม่ต้องรอ TTL
   *  ส่วน TTL กันเคส backend คนละ process ชี้ DB เดียวกันไม่รู้ว่ามีการแก้จากอีกฝั่ง (จะเห็นข้อมูลใหม่ช้าสุด 30s) */
  private cached: MenuItem[] | null = null
  private cachedAt = 0
  private readonly CACHE_TTL_MS = 30_000

  async findAll(): Promise<MenuItem[]> {
    if (this.cached && Date.now() - this.cachedAt < this.CACHE_TTL_MS) return this.cached
    const menus = await this.prisma.menuItem.findMany({ orderBy: { name: 'asc' } })
    this.cached = menus
    this.cachedAt = Date.now()
    return menus
  }

  private invalidate() {
    this.cached = null
  }

  create(dto: CreateMenuItemDto) {
    this.invalidate()
    return this.prisma.menuItem.create({ data: dto })
  }

  update(id: string, dto: UpdateMenuItemDto) {
    this.invalidate()
    return this.prisma.menuItem.update({ where: { id }, data: dto })
  }

  /** ลบเมนู — จะหลุดออกจากทุก course ที่อ้างถึงโดยอัตโนมัติ (many-to-many) */
  remove(id: string) {
    this.invalidate()
    return this.prisma.menuItem.delete({ where: { id } })
  }
}
