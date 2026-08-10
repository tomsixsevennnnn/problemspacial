import { Injectable } from '@nestjs/common'
import type { Settings } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
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
  constructor(private prisma: PrismaService) {}

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

  async update(dto: UpdateSettingsDto) {
    await this.get()
    const updated = await this.prisma.settings.update({ where: { id: 1 }, data: dto })
    this.cached = updated
    this.cachedAt = Date.now()
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
