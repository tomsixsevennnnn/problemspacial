import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { LocationDetailDto } from './dto/location-detail.dto'
import { outsideDeliveryFeeFor, routeDistanceKm, zoneFor, ServiceZone } from './geo.util'

export interface PriceResult {
  pricePerTable: number
  deliveryFee: number
  totalPrice: number
  /** zone/distanceKm ที่คำนวณเองฝั่ง backend — เอาไปเขียนทับ locationDetail ก่อนบันทึก กันข้อมูลที่แสดงผลไม่ตรงกับราคาที่คิดจริง */
  zone: ServiceZone
  distanceKm?: number
}

/**
 * แหล่งความจริงหนึ่งเดียวของราคาจอง — ห้ามให้ controller/service อื่นเชื่อ totalPrice/pricePerTable/deliveryFee
 * จาก client โดยตรงเด็ดขาด (ดูข้อ 1 ใน code review) คำนวณจาก Package.pricePerTable ใน DB + Settings ปัจจุบันเสมอ
 */
@Injectable()
export class PricingService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async priceFor(packageId: string, tables: number, location: LocationDetailDto | undefined): Promise<PriceResult> {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg) throw new NotFoundException('ไม่พบแพ็กเกจนี้ อาจถูกลบหรือแก้ไขไปแล้ว')

    const settings = await this.settings.get()
    const pricePerTable = pkg.pricePerTable
    const subtotal = pricePerTable * tables

    const { fee: deliveryFee, zone, distanceKm } = await this.deliveryFeeFor(tables, location, settings)

    return { pricePerTable, deliveryFee, totalPrice: subtotal + deliveryFee, zone, distanceKm }
  }

  private async deliveryFeeFor(
    tables: number,
    location: LocationDetailDto | undefined,
    settings: { deliveryFee: number; freeDeliveryMinTables: number; fuelCostPerKm: number; shopLocationLat: number; shopLocationLng: number },
  ): Promise<{ fee: number; zone: ServiceZone; distanceKm?: number }> {
    if (!location) return { fee: 0, zone: 'home' }

    const zone = zoneFor(location.province ?? '', location.address ?? '')
    if (zone === 'home') return { fee: 0, zone }
    if (zone === 'metro') {
      const fee = tables < settings.freeDeliveryMinTables ? settings.deliveryFee : 0
      return { fee, zone }
    }

    // zone === 'outside' — ต้อง verify ระยะทางจริงเอง ห้าม fallback ไปเชื่อ distanceKm จาก client
    let distanceKm: number
    try {
      distanceKm = await routeDistanceKm(
        { lat: settings.shopLocationLat, lng: settings.shopLocationLng },
        { lat: location.lat, lng: location.lng },
      )
    } catch {
      throw new ServiceUnavailableException('คำนวณระยะทางไปสถานที่จัดงานไม่สำเร็จ กรุณาลองจองใหม่อีกครั้ง')
    }

    return { fee: outsideDeliveryFeeFor(distanceKm, settings.fuelCostPerKm), zone, distanceKm }
  }
}
