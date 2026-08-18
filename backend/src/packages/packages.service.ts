import { Injectable, NotFoundException } from '@nestjs/common'
import type { Package, PackageCourse, MenuItem } from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'
import { CourseInput, CreatePackageDto } from './dto/create-package.dto'
import { UpdateCourseDto } from './dto/update-course.dto'
import { UpdatePackageDto } from './dto/update-package.dto'

type PackageWithCourses = Package & { courses: (PackageCourse & { items: MenuItem[] })[] }

/**
 * เทียบว่า courses ที่ส่งมาเหมือนของเดิมทุกอย่างไหม (ข้อ, ชื่อ, ไอคอน, ประเภท, จำนวนที่เลือก, รายการเมนู)
 * ใช้ตัดสินว่าต้องทำ delete-then-recreate ทั้งชุดจริงไหม — เพราะฟอร์มแก้ไขฝั่ง frontend (owner/Packages.tsx)
 * ส่ง courses มาด้วยทุกครั้งที่บันทึกอยู่แล้ว ไม่ว่าจะแก้แค่ชื่อ/ราคาแพ็กเกจหรือแก้ courses จริงๆ ก็ตาม
 * ถ้าไม่เช็คก่อน ทุกครั้งที่ owner แก้แค่ราคาก็จะโดนลบ+สร้าง course/เมนูใหม่ทั้งชุดโดยไม่จำเป็น ซึ่งเป็น nested
 * write หลาย round-trip บน DB ที่อยู่ไกล (Railway) ช้าเป็นวินาที — ทั้งที่ข้อมูล courses ไม่ได้เปลี่ยนเลย
 */
function coursesUnchanged(existing: (PackageCourse & { items: MenuItem[] })[], incoming: CourseInput[]): boolean {
  if (existing.length !== incoming.length) return false

  const byNo = [...existing].sort((a, b) => a.no - b.no)
  const incomingByNo = [...incoming].sort((a, b) => a.no - b.no)

  return byNo.every((course, i) => {
    const next = incomingByNo[i]
    if (
      course.no !== next.no ||
      course.title !== next.title ||
      (course.icon ?? '') !== (next.icon ?? '') ||
      course.category !== next.category ||
      course.choose !== next.choose
    ) {
      return false
    }
    const existingIds = new Set(course.items.map((item) => item.id))
    const incomingIds = new Set(next.itemIds)
    if (existingIds.size !== incomingIds.size) return false
    for (const id of existingIds) if (!incomingIds.has(id)) return false
    return true
  })
}

@Injectable()
export class PackagesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** cache รายการแพ็กเกจไว้ในหน่วยความจำ — DB จริงอยู่ที่ Railway (ดู settings.service.ts) แต่ query นี้แพงเป็นพิเศษ
   *  เพราะ include courses.items ซ้อนกัน ทำให้ Prisma ยิงหลาย round trip ต่อเนื่องกัน (วัดจริงได้ ~2.5-3s ต่อครั้ง
   *  ในขณะที่ query อื่นในระบบ ~300-800ms) TTL จึงต้องยาวกว่าปกติ ไม่งั้นแทบทุก login ต้องจ่าย 3s เต็มๆ
   *  แพ็กเกจแก้ไขน้อย (เฉพาะเจ้าของร้าน) ทุก mutation ในไฟล์นี้จึงล้าง cache ทันทีอยู่แล้ว ไม่ต้องรอ TTL
   *  ส่วน TTL กันเคส backend คนละ process ชี้ DB เดียวกันไม่รู้ว่ามีการแก้จากอีกฝั่ง (จะเห็นข้อมูลใหม่ช้าสุด 30s) */
  private cached: PackageWithCourses[] | null = null
  private cachedAt = 0
  private readonly CACHE_TTL_MS = 30_000

  async findAll(): Promise<PackageWithCourses[]> {
    if (this.cached && Date.now() - this.cachedAt < this.CACHE_TTL_MS) return this.cached
    const packages = await this.prisma.package.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        courses: {
          include: { items: { where: { deletedAt: null } } },
          orderBy: { no: 'asc' },
        },
      },
    })
    this.cached = packages
    this.cachedAt = Date.now()
    return packages
  }

  private invalidate() {
    this.cached = null
  }

  async create(dto: CreatePackageDto) {
    const count = await this.prisma.package.count({ where: { deletedAt: null } })
    this.invalidate()
    return this.prisma.package.create({
      data: {
        name: dto.name,
        pricePerTable: dto.pricePerTable,
        menuLimit: dto.menuLimit,
        description: dto.description ?? '',
        features: dto.features ?? [],
        badge: dto.badge,
        sortOrder: count,
        courses: {
          create: dto.courses.map((c) => ({
            no: c.no,
            title: c.title,
            icon: c.icon,
            category: c.category,
            choose: c.choose,
            items: { connect: c.itemIds.map((id) => ({ id })) },
          })),
        },
      },
      include: { courses: { include: { items: true } } },
    })
  }

  async update(id: string, dto: UpdatePackageDto) {
    this.invalidate()
    if (!dto.courses) {
      return this.prisma.package.update({
        where: { id },
        data: {
          name: dto.name,
          pricePerTable: dto.pricePerTable,
          menuLimit: dto.menuLimit,
          description: dto.description,
          features: dto.features,
          badge: dto.badge,
        },
      })
    }

    // ฟอร์มแก้ไขฝั่ง frontend ส่ง courses มาด้วยทุกครั้งที่บันทึก ไม่ว่าจะแก้แค่ชื่อ/ราคาหรือแก้ courses จริงๆ
    // เช็คก่อนว่า courses เปลี่ยนจริงไหม — ถ้าไม่เปลี่ยนก็อัปเดตแค่ field ระดับบนแบบเดียวกับตอนไม่ส่ง courses มา
    // (round trip เดียว เร็วเท่าแก้ field ธรรมดา) ไม่ต้องเสีย delete+recreate ทั้งชุดโดยไม่จำเป็น
    const current = await this.prisma.package.findUnique({
      where: { id },
      include: { courses: { include: { items: true }, orderBy: { no: 'asc' } } },
    })
    if (current && coursesUnchanged(current.courses, dto.courses)) {
      return this.prisma.package.update({
        where: { id },
        data: {
          name: dto.name,
          pricePerTable: dto.pricePerTable,
          menuLimit: dto.menuLimit,
          description: dto.description,
          features: dto.features,
          badge: dto.badge,
        },
        include: { courses: { include: { items: true } } },
      })
    }

    // courses เปลี่ยนจริง — แทนที่ทุกข้อทั้งชุด (ลบของเดิมแล้วสร้างใหม่ในทรานแซกชันเดียว)
    // nested create หลายข้อ × connect หลายเมนู/ข้อ กลายเป็นหลาย round trip ต่อเนื่องกัน — ค่า timeout เริ่มต้นของ
    // Prisma (5000ms) ไม่พอเมื่อ DB อยู่ไกล (เช่น dev เครื่องนี้ชี้ไป Railway ผ่าน public proxy) เลยยืดให้พอ
    return this.prisma.$transaction(
      async (tx) => {
        await tx.packageCourse.deleteMany({ where: { packageId: id } })
        return tx.package.update({
          where: { id },
          data: {
            name: dto.name,
            pricePerTable: dto.pricePerTable,
            menuLimit: dto.menuLimit ?? dto.courses!.length,
            description: dto.description,
            features: dto.features,
            badge: dto.badge,
            courses: {
              create: dto.courses!.map((c) => ({
                no: c.no,
                title: c.title,
                icon: c.icon,
                category: c.category,
                choose: c.choose,
                items: { connect: c.itemIds.map((itemId) => ({ id: itemId })) },
              })),
            },
          },
          include: { courses: { include: { items: true } } },
        })
      },
      { timeout: 20_000 },
    )
  }

  /** soft delete — booking เก่าที่อ้าง packageId นี้ยังอ่านราคาพื้นฐานย้อนหลังได้ (แค่ซ่อนจากรายการแพ็กเกจปกติ) */
  async remove(auth0Sub: string, id: string) {
    this.invalidate()
    const before = await this.prisma.package.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('ไม่พบแพ็กเกจนี้')

    const after = await this.prisma.package.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log(auth0Sub, 'package.delete', 'Package', id, before, after)
    return after
  }

  /** เจ้าของร้านลากจัดลำดับแพ็กเกจใหม่ — รับ id ทุกแพ็กเกจเรียงตามลำดับที่ต้องการ */
  async reorder(ids: string[]) {
    this.invalidate()
    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.package.update({ where: { id }, data: { sortOrder: index } })),
    )
    return this.findAll()
  }

  /** เพิ่มข้อใหม่เข้าแพ็กเกจที่มีอยู่ โดยไม่ต้องส่งคอร์สทั้งชุด */
  addCourse(packageId: string, dto: CourseInput) {
    this.invalidate()
    return this.prisma.packageCourse.create({
      data: {
        packageId,
        no: dto.no,
        title: dto.title,
        icon: dto.icon,
        category: dto.category,
        choose: dto.choose,
        items: { connect: dto.itemIds.map((itemId) => ({ id: itemId })) },
      },
      include: { items: true },
    })
  }

  /** แก้ทีละข้อ — ส่ง itemIds มา = แทนที่รายการเมนูในข้อนี้ทั้งหมด ไม่ส่ง = ไม่แตะรายการเมนูเดิม */
  async updateCourse(packageId: string, courseId: string, dto: UpdateCourseDto) {
    await this.assertCourseInPackage(packageId, courseId)
    this.invalidate()
    return this.prisma.packageCourse.update({
      where: { id: courseId },
      data: {
        no: dto.no,
        title: dto.title,
        icon: dto.icon,
        category: dto.category,
        choose: dto.choose,
        ...(dto.itemIds ? { items: { set: dto.itemIds.map((itemId) => ({ id: itemId })) } } : {}),
      },
      include: { items: true },
    })
  }

  async removeCourse(packageId: string, courseId: string) {
    await this.assertCourseInPackage(packageId, courseId)
    this.invalidate()
    return this.prisma.packageCourse.delete({ where: { id: courseId } })
  }

  private async assertCourseInPackage(packageId: string, courseId: string) {
    const course = await this.prisma.packageCourse.findFirst({ where: { id: courseId, packageId } })
    if (!course) throw new NotFoundException('ไม่พบข้อนี้ในแพ็กเกจ')
    return course
  }
}
