import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma, type Settings } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { UpdateSettingsDto } from './dto/update-settings.dto'

/** ค่าเริ่มต้น — ต้องตรงกับ DEFAULT_* ใน frontend src/documents.ts และ src/geo.ts */
const DEFAULT_SETTINGS = {
  id: 1,
  shopName: 'ร้าน',
  shopNameEn: 'Pipat Phochana Catering',
  shopInitials: 'PP',
  shopAddress: 'อ.เมืองนครปฐม จ.นครปฐม 73000',
  shopPhone: '034-XXX-XXX',
  shopLine: '@pipatphochana',
  bankName: '',
  bankAccountNumber: '',
  bankAccountName: '',
  promptPayQr: null,
  depositRate: 0.5,
  deliveryFee: 2000,
  freeDeliveryMinTables: 30,
  wageChef: 1200,
  wageAssistant: 1000,
  wageServerPerTable: 100,
  wageDishwasher: 500,
  categoryOrder: ['snack', 'appetizer', 'soup', 'salad', 'main', 'fish', 'rice-noodle', 'hotpot', 'dessert'],
  shopLocationLat: 13.8196,
  shopLocationLng: 100.0603,
  fuelCostPerKm: 8,
}

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  /** cache แถว settings เดียวไว้ในหน่วยความจำ — DB จริงอยู่ที่ Railway แต่ละ query กิน ~1-2s
   *  ทำให้ request ถัดจากแรกเร็วขึ้นเหลือหลัก ms, update() ในเครื่องเดียวกันล้าง cache ทันที
   *  แต่ backend คนละเครื่อง/process (เช่น เปิดพัฒนาคู่กันแล้วชี้ DB เดียวกัน) จะไม่รู้ว่ามีการ update()
   *  จากอีกฝั่ง เลยต้องมี TTL ให้ cache หมดอายุเองด้วย ไม่ใช่ cache ค้างตลอดไป */
  private cached: Settings | null = null
  private cachedAt = 0
  private readonly CACHE_TTL_MS = 1000

  async get(): Promise<Settings> {
    if (this.cached && Date.now() - this.cachedAt < this.CACHE_TTL_MS) return this.cached
    const existing = await this.prisma.settings.findUnique({ where: { id: 1 } })
    this.cached = existing ?? (await this.prisma.settings.create({ data: DEFAULT_SETTINGS }))
    this.cachedAt = Date.now()
    return this.cached
  }

  /** ถ้าเปลี่ยน/ลบ QR (promptPayQr เป็นค่าใหม่ที่ต่างจากเดิม) ลบไฟล์รูปเก่าทิ้งหลัง update สำเร็จ กันไฟล์ orphan ค้าง disk
   *  ใช้ update() ครั้งเดียวผ่าน unique key ผสม (id, version) แทน updateMany+findUniqueOrThrow เดิม (2 round trip)
   *  — DB จริงอยู่ที่ Railway แต่ละ round trip กิน ~1-2s ยุบเหลือ query เดียวช่วยให้บันทึกเร็วขึ้นชัดเจน
   *  ส่วน before ดึงเฉพาะตอนจะแก้ promptPayQr เท่านั้น (ที่อื่นไม่ต้องเสีย round trip เพิ่มเปล่าๆ) */
  async update(dto: UpdateSettingsDto) {
    const { expectedVersion, ...patch } = dto
    const touchesQr = patch.promptPayQr !== undefined
    const before = touchesQr ? await this.get() : null

    let updated: Settings
    try {
      updated = await this.prisma.settings.update({
        where: { id_version: { id: 1, version: expectedVersion } },
        data: { ...patch, version: { increment: 1 } },
      })
    } catch (err) {
      // P2025 = ไม่พบแถวที่ตรงเงื่อนไข where (id, version) — แปลว่ามีคนแก้ไปแล้วก่อนหน้านี้ (version ไม่ตรง)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ConflictException('มีคนแก้ไขค่าตั้งค่าไปแล้ว กรุณาโหลดหน้าใหม่')
      }
      throw err
    }

    this.cached = updated
    this.cachedAt = Date.now()

    if (touchesQr && before?.promptPayQr && before.promptPayQr !== updated.promptPayQr) {
      await this.uploads.deleteManagedFile(before.promptPayQr)
    }
    return updated
  }

  /** ข้อมูลร้านสาธารณะ — ใช้ก่อน login (หน้า Login, ชื่อแท็บเบราว์เซอร์) ไม่รวมค่ามัดจำ/ค่าแรง/พิกัดร้านที่เป็นข้อมูลอ่อนไหว */
  async getPublicShopInfo() {
    const s = await this.get()
    return {
      shopName: s.shopName,
      shopNameEn: s.shopNameEn,
      shopInitials: s.shopInitials,
      shopAddress: s.shopAddress,
      shopPhone: s.shopPhone,
      shopLine: s.shopLine,
    }
  }
}
