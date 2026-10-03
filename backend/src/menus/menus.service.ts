import { Injectable, NotFoundException } from '@nestjs/common'
import type { MenuItem } from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PackagesService } from '../packages/packages.service'
import { PrismaService } from '../prisma/prisma.service'
import { Paginated, pageArgsFor } from '../common/pagination'
import { UploadsService } from '../uploads/uploads.service'
import { CreateMenuItemDto } from './dto/create-menu-item.dto'
import { ListMenusQueryDto } from './dto/list-menus-query.dto'
import { UpdateMenuItemDto } from './dto/update-menu-item.dto'

@Injectable()
export class MenusService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private uploads: UploadsService,
    private packages: PackagesService,
  ) {}

  /** cache รายการเมนูไว้ในหน่วยความจำ — DB จริงอยู่ที่ Railway แต่ละ query กิน ~300-800ms (ดู settings.service.ts)
   *  เมนูแก้ไขน้อย (เฉพาะเจ้าของร้าน) ทุก mutation ในไฟล์นี้จึงล้าง cache ทันทีอยู่แล้ว ไม่ต้องรอ TTL
   *  ส่วน TTL กันเคส backend คนละ process ชี้ DB เดียวกันไม่รู้ว่ามีการแก้จากอีกฝั่ง (จะเห็นข้อมูลใหม่ช้าสุด 30s) */
  private cached: MenuItem[] | null = null
  private cachedAt = 0
  private readonly CACHE_TTL_MS = 30_000

  /** ไม่ส่ง query มาเลย = คืนทั้งชุดจาก cache เหมือนเดิม (ใช้ภายในระบบด้วย) — ถ้ามี page/limit/category/search
   *  จะ query ตรงจาก DB ไม่แตะ cache เพราะผลที่กรองแล้วไม่ใช่ชุดเต็มที่ cache เก็บไว้ */
  async findAll(query: ListMenusQueryDto = {}): Promise<MenuItem[] | Paginated<MenuItem>> {
    const args = pageArgsFor(query.page, query.limit)
    const where = {
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    }
    const isFiltered = args !== null || Object.keys(where).length > 1

    if (!isFiltered) {
      if (this.cached && Date.now() - this.cachedAt < this.CACHE_TTL_MS) return this.cached
      const menus = await this.prisma.menuItem.findMany({ where, orderBy: { name: 'asc' } })
      this.cached = menus
      this.cachedAt = Date.now()
      return menus
    }

    if (!args) return this.prisma.menuItem.findMany({ where, orderBy: { name: 'asc' } })
    const [data, total] = await Promise.all([
      this.prisma.menuItem.findMany({ where, orderBy: { name: 'asc' }, skip: args.skip, take: args.take }),
      this.prisma.menuItem.count({ where }),
    ])
    return { data, total, page: args.page, limit: args.limit }
  }

  /** ล้างทั้ง cache ของตัวเองและของ PackagesService — packages cache ฝัง MenuItem เต็มไว้ในแต่ละ course
   *  (include: courses.items) เมนูแก้/ลบแล้วไม่ล้างตามจะเห็นข้อมูลเมนูเก่าซ้อนอยู่ในแพ็กเกจได้นานสุด 30s */
  private invalidate() {
    this.cached = null
    this.packages.invalidate()
  }

  create(dto: CreateMenuItemDto) {
    this.invalidate()
    // imagePosition เป็น class instance จาก class-transformer — ต้อง spread เป็น plain object ก่อนส่งเข้า Prisma
    // (คอลัมน์ Json ต้องการ index signature ตรงๆ, instance ของ class ไม่ผ่าน type check ของ InputJsonObject)
    return this.prisma.menuItem.create({
      data: { ...dto, imagePosition: dto.imagePosition ? { ...dto.imagePosition } : undefined },
    })
  }

  /** ถ้าเปลี่ยนรูป (dto.image เป็นค่าใหม่ที่ต่างจากเดิม) ลบไฟล์รูปเก่าทิ้งหลัง update สำเร็จ กันไฟล์ orphan ค้าง disk */
  async update(id: string, dto: UpdateMenuItemDto) {
    this.invalidate()
    const before = dto.image !== undefined ? await this.prisma.menuItem.findUnique({ where: { id } }) : null

    const after = await this.prisma.menuItem.update({
      where: { id },
      data: { ...dto, imagePosition: dto.imagePosition ? { ...dto.imagePosition } : undefined },
    })

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
    // ไม่ await — เหตุผลเดียวกับ bookings.service.ts (ดูคอมเมนต์ที่นั่น) ไม่บล็อกการลบเพื่อรอเขียน audit log
    void this.audit.log(auth0Sub, 'menu.delete', 'MenuItem', id, before, after)
    return after
  }
}
