import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SyncProfileDto } from './dto/sync-profile.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'

interface Auth0Profile {
  auth0Sub: string
  role: Role
  name: string
  surname?: string
  email: string
  avatar?: string
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * ใช้ที่อื่นตอนสร้างข้อมูลที่ผูกกับ user (เช่น booking) — access token ไม่มี profile claim
   * จึงมักได้ชื่อ/อีเมลว่างตรงนี้ แต่ไม่เป็นไรเพราะ syncProfile (เรียกตอน login) จะอัปเดตให้ถูกอยู่แล้ว
   */
  async findOrCreate(profile: Auth0Profile) {
    return this.prisma.user.upsert({
      where: { auth0Sub: profile.auth0Sub },
      update: {},
      create: {
        auth0Sub: profile.auth0Sub,
        role: profile.role,
        name: profile.name,
        surname: profile.surname ?? '',
        email: profile.email,
        avatar: profile.avatar ?? '',
      },
    })
  }

  /**
   * เรียกทันทีหลัง login ทุกครั้ง — ฝั่ง frontend ส่ง profile จาก ID token มาเอง (access token ไม่มี name/email/picture)
   *
   * role ใส่แค่ตอน "สร้าง" user ใหม่ครั้งแรกเท่านั้น (ค่าเริ่มต้นจาก connection ที่ login — ดู docs/auth0-action.md)
   * ไม่ sync ทับตอน login ครั้งถัดๆ ไปอีกแล้ว เพราะตอนนี้ owner จัดการ role เองผ่านแอปได้ (ดู setRole ด้านล่าง)
   * ถ้ายัง sync ทับทุกครั้งเหมือนเดิม คนที่ถูกเลื่อนเป็น owner แล้ว login รอบถัดไปด้วย connection เดิม (เช่น Google)
   * จะโดนดึงกลับเป็น customer ทันที ทำให้ฟีเจอร์ promote/demote ใช้งานจริงไม่ได้
   */
  syncProfile(auth0Sub: string, role: Role, dto: SyncProfileDto) {
    return this.prisma.user.upsert({
      where: { auth0Sub },
      update: {
        name: dto.name,
        surname: dto.surname ?? '',
        email: dto.email,
        avatar: dto.avatar ?? '',
      },
      create: {
        auth0Sub,
        role,
        name: dto.name,
        surname: dto.surname ?? '',
        email: dto.email,
        avatar: dto.avatar ?? '',
      },
    })
  }

  updateProfile(auth0Sub: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({ where: { auth0Sub }, data: dto })
  }

  /** ค้นหาผู้ใช้ที่เคย login แล้ว (มี User row) ด้วยอีเมล — ใช้ contains (ค้นแบบพิมพ์ไม่ครบก็เจอ) ไม่ใช่ equals
   *  เพื่อให้หน้า UI ค้นหาแบบพิมพ์แล้วเห็นผลทันทีได้ (live search) จำกัด 20 แถวกันพิมพ์สั้นๆ แล้วได้ผลเยอะเกินไป */
  findByEmail(email: string) {
    return this.prisma.user.findMany({
      where: { email: { contains: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
  }

  /** รายชื่อ owner ทั้งหมดตอนนี้ — ให้หน้า "สิทธิ์การเข้าถึง" โชว์ไว้เห็นภาพรวมโดยไม่ต้องค้นหาทีละอีเมล */
  findOwners() {
    return this.prisma.user.findMany({
      where: { role: Role.OWNER },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** เปลี่ยน role ของ user คนอื่น (owner จัดการเอง ไม่ต้องพึ่ง Auth0 dashboard) — กันถอด owner คนสุดท้ายออกจนระบบไม่เหลือ owner เลย
   *  คืนทั้ง before/after ให้ controller เอาไปเขียน audit log ได้เลย ไม่ต้อง query ซ้ำ */
  async setRole(userId: string, role: Role) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!before) throw new NotFoundException('ไม่พบผู้ใช้นี้')

    if (role === Role.CUSTOMER) {
      const otherOwners = await this.prisma.user.count({ where: { role: Role.OWNER, id: { not: userId } } })
      if (otherOwners === 0) {
        throw new BadRequestException('ต้องมี owner อย่างน้อย 1 คนเสมอ ถอดสิทธิ์คนนี้ไม่ได้')
      }
    }
    const after = await this.prisma.user.update({ where: { id: userId }, data: { role } })
    return { before, after }
  }
}
