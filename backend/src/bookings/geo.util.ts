/**
 * ⚠️ พอร์ตมาจาก frontend `Catering Booking Web Application/src/geo.ts` (zoneFor/outsideDeliveryFeeFor)
 * ต้องคำนวณผลเดียวกันทุกประการ เพราะ pricing.service.ts ใช้ค่านี้เป็นความจริงหนึ่งเดียวตอนคำนวณราคา
 * ไม่เชื่อ zone/distanceKm จาก client — แก้ regex/สูตรฝั่งนี้แล้วต้องไปแก้ฝั่ง frontend ให้ตรงกันด้วยเสมอ
 * มี parity test คอยจับไว้ที่ geo.util.spec.ts (เทสต์เคสเดียวกับ frontend src/geo.test.ts) ถ้าแก้แล้วลืม
 * อีกฝั่ง เทสต์จะ fail — เพราะเป็นคนละ pnpm project กัน ไม่มี shared package ให้ import ใช้ร่วมกันจริงๆ ได้
 */
export type ServiceZone = 'home' | 'metro' | 'outside'

const HOME_PATTERN = /นครปฐม|nakhon ?pathom/i
const METRO_PATTERN =
  /กรุงเทพ|กทม|bangkok|นนทบุรี|nonthaburi|ปทุมธานี|pathum ?thani|สมุทรปราการ|samut ?prakan|สมุทรสาคร|samut ?sakhon|สมุทรสงคราม|samut ?songkhram|สุพรรณบุรี|suphan ?buri|ราชบุรี|ratchaburi|กาญจนบุรี|kanchanaburi/i

const zoneOfText = (text: string): ServiceZone | null => {
  if (!text.trim()) return null
  if (HOME_PATTERN.test(text)) return 'home'
  if (METRO_PATTERN.test(text)) return 'metro'
  return null
}

export const zoneFor = (province: string, address = ''): ServiceZone =>
  zoneOfText(province) ?? zoneOfText(address) ?? 'outside'

/** ค่าเดินทางไป-กลับของงานนอกพื้นที่ = ระยะทางเที่ยวเดียว (กม.) × 2 × ค่าน้ำมัน/กม. — ปัดเศษเป็นจำนวนเต็มบาท */
export const outsideDeliveryFeeFor = (distanceKm: number, fuelCostPerKm: number): number =>
  Math.round(distanceKm * 2 * fuelCostPerKm)

const OSRM = 'https://router.project-osrm.org'

interface OsrmRouteResponse {
  code: string
  routes?: { distance: number }[]
}

/**
 * ระยะทางถนนจริงจากร้านไปสถานที่งาน (กม., เที่ยวเดียว) — เรียก OSRM จาก backend เอง
 * แทนการเชื่อ distanceKm ที่ client คำนวณมาแล้วส่งมา (ป้องกันแก้ raw request ลดค่าเดินทาง)
 */
export async function routeDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  timeoutMs = 5000,
): Promise<number> {
  const url = `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
    const data = (await res.json()) as OsrmRouteResponse
    const meters = data.routes?.[0]?.distance
    if (data.code !== 'Ok' || typeof meters !== 'number') throw new Error('OSRM: ไม่พบเส้นทาง')
    return meters / 1000
  } finally {
    clearTimeout(timer)
  }
}
