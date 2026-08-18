import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { PricingService } from './pricing.service'
import * as geoUtil from './geo.util'

jest.mock('./geo.util', () => ({
  ...jest.requireActual('./geo.util'),
  routeDistanceKm: jest.fn(),
}))

const PACKAGE = { id: 'pkg_1', pricePerTable: 2000 }
const SETTINGS = {
  deliveryFee: 2000,
  freeDeliveryMinTables: 30,
  fuelCostPerKm: 8,
  shopLocationLat: 13.8196,
  shopLocationLng: 100.0603,
}

const makeService = () => {
  const prisma = { package: { findUnique: jest.fn().mockResolvedValue(PACKAGE) } } as any
  const settings = { get: jest.fn().mockResolvedValue(SETTINGS) } as any
  return { service: new PricingService(prisma, settings), prisma }
}

describe('PricingService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('ไม่พบแพ็กเกจ — throw NotFoundException', async () => {
    const { service, prisma } = makeService()
    prisma.package.findUnique.mockResolvedValue(null)
    await expect(service.priceFor('missing', 10, undefined)).rejects.toThrow(NotFoundException)
  })

  it('ไม่มี location — ไม่คิดค่าขนส่ง', async () => {
    const { service } = makeService()
    const price = await service.priceFor('pkg_1', 10, undefined)
    expect(price).toEqual({ pricePerTable: 2000, deliveryFee: 0, totalPrice: 20000, zone: 'home' })
  })

  it('zone home (นครปฐม) — ไม่คิดค่าขนส่งไม่ว่ากี่โต๊ะ', async () => {
    const { service } = makeService()
    const price = await service.priceFor('pkg_1', 5, {
      lat: 13.8, lng: 100.06, province: 'นครปฐม', address: '',
    } as any)
    expect(price.zone).toBe('home')
    expect(price.deliveryFee).toBe(0)
    expect(price.totalPrice).toBe(2000 * 5)
  })

  it('zone metro ต่ำกว่าขั้นต่ำ — คิดค่าขนส่งเต็มอัตรา', async () => {
    const { service } = makeService()
    const price = await service.priceFor('pkg_1', 10, {
      lat: 13.7, lng: 100.5, province: 'กรุงเทพมหานคร', address: '',
    } as any)
    expect(price.zone).toBe('metro')
    expect(price.deliveryFee).toBe(2000)
    expect(price.totalPrice).toBe(2000 * 10 + 2000)
  })

  it('zone metro ถึงขั้นต่ำแล้ว — ไม่คิดค่าขนส่ง', async () => {
    const { service } = makeService()
    const price = await service.priceFor('pkg_1', 30, {
      lat: 13.7, lng: 100.5, province: 'กรุงเทพมหานคร', address: '',
    } as any)
    expect(price.zone).toBe('metro')
    expect(price.deliveryFee).toBe(0)
  })

  it('zone outside — เรียก routeDistanceKm เองฝั่ง backend แล้วคิดค่าเดินทางจากระยะจริง', async () => {
    const { service } = makeService()
    ;(geoUtil.routeDistanceKm as jest.Mock).mockResolvedValue(50)
    const price = await service.priceFor('pkg_1', 10, {
      lat: 13.0, lng: 99.0, province: 'เชียงใหม่', address: '',
    } as any)
    expect(price.zone).toBe('outside')
    expect(price.distanceKm).toBe(50)
    expect(price.deliveryFee).toBe(Math.round(50 * 2 * 8))
    expect(price.totalPrice).toBe(2000 * 10 + price.deliveryFee)
  })

  it('zone outside แต่ client ส่ง distanceKm/zone ปลอมมา — backend ต้องคำนวณเองไม่เชื่อค่าที่ส่งมา', async () => {
    const { service } = makeService()
    ;(geoUtil.routeDistanceKm as jest.Mock).mockResolvedValue(50)
    const price = await service.priceFor('pkg_1', 10, {
      lat: 13.0, lng: 99.0, province: 'เชียงใหม่', address: '',
      zone: 'home', distanceKm: 0, // ค่าปลอมที่พยายามหลอกว่าไม่มีค่าขนส่ง
    } as any)
    expect(price.zone).toBe('outside')
    expect(price.deliveryFee).toBeGreaterThan(0)
  })

  it('zone outside แต่เรียก OSRM ไม่สำเร็จ — fail-closed ไม่ fallback ไปเชื่อ client', async () => {
    const { service } = makeService()
    ;(geoUtil.routeDistanceKm as jest.Mock).mockRejectedValue(new Error('OSRM down'))
    await expect(
      service.priceFor('pkg_1', 10, { lat: 13.0, lng: 99.0, province: 'เชียงใหม่', address: '' } as any),
    ).rejects.toThrow(ServiceUnavailableException)
  })
})
