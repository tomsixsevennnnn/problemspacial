import { Injectable, NotFoundException } from '@nestjs/common'
import type { MenuItem } from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { CreateMenuItemDto } from './dto/create-menu-item.dto'
import { UpdateMenuItemDto } from './dto/update-menu-item.dto'

@Injectable()
export class MenusService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private uploads: UploadsService,
  ) {}

  /** cache รายการเมนูไว้ในหน่วยความจำ — DB จริงอยู่ที่ Railway แต่ละ query กิน ~300-800ms (ดู settings.service.ts)
   *  เมนูแก้ไขน้อย (เฉพาะเจ้าของร้าน) ทุก mutation ในไฟล์นี้จึงล้าง cache ทันทีอยู่แล้ว ไม่ต้องรอ TTL
   *  ส่วน TTL กันเคส backend คนละ process ชี้ DB เดียวกันไม่รู้ว่ามีการแก้จากอีกฝั่ง (จะเห็นข้อมูลใหม่ช้าสุด 30s) */
  private cached: MenuItem[] | null = null
  private cachedAt = 0
  private readonly CACHE_TTL_MS = 30_000

  async findAll(): Promise<MenuItem[]> {
    if (this.cached && Date.now() - this.cachedAt < this.CACHE_TTL_MS) return this.cached
    const menus = await this.prisma.menuItem.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } })
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

  /** ถ้าเปลี่ยนรูป (dto.image เป็นค่าใหม่ที่ต่างจากเดิม) ลบไฟล์รูปเก่าทิ้งหลัง update สำเร็จ กันไฟล์ orphan ค้าง disk */
  async update(id: string, dto: UpdateMenuItemDto) {
    this.invalidate()
    const before = dto.image !== undefined ? await this.prisma.menuItem.findUnique({ where: { id } }) : null

    const after = await this.prisma.menuItem.update({ where: { id }, data: dto })

    if (before && before.image && before.image !== after.image) {
      await this.uploads.deleteManagedFile(before.image)
    }
    return after
  }

  /** soft delete — ยังอยู่ใน course เดิมที่อ้างถึง (ประวัติ booking เก่าไม่พัง) แค่ซ่อนจากรายการเมนูปกติ */
  async remove(auth0Sub: string, id: string) {
    this.invalidate()
    const before = await this.prisma.menuItem.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('ไม่พบเมนูนี้')

    const after = await this.prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log(auth0Sub, 'menu.delete', 'MenuItem', id, before, after)
    return after
  }
}
