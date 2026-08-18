import { outsideDeliveryFeeFor, zoneFor } from './geo.util'

/**
 * เทสต์เคสตรงนี้ต้องเหมือน frontend `Catering Booking Web Application/src/geo.test.ts` เป๊ะๆ (ข้อ 4 ใน
 * code review — zoneFor/outsideDeliveryFeeFor ถูกพอร์ตมาซ้ำเพราะเป็นคนละ pnpm project กัน ไม่มี shared
 * package ให้ import ใช้ร่วมกันได้จริง) ถ้าแก้ regex/สูตรฝั่งใดฝั่งหนึ่งแล้วลืมอีกฝั่ง เทสต์ชุดนี้จะ fail
 */
describe('zoneFor (parity กับ frontend src/geo.test.ts)', () => {
  it('นครปฐม = พื้นที่ร้าน', () => {
    expect(zoneFor('นครปฐม')).toBe('home')
  })

  it('กรุงเทพและปริมณฑล = metro', () => {
    expect(zoneFor('กรุงเทพมหานคร')).toBe('metro')
    expect(zoneFor('นนทบุรี')).toBe('metro')
  })

  it('จังหวัดที่ติดกับนครปฐม = metro', () => {
    expect(zoneFor('สุพรรณบุรี')).toBe('metro')
    expect(zoneFor('ราชบุรี')).toBe('metro')
    expect(zoneFor('กาญจนบุรี')).toBe('metro')
    expect(zoneFor('สมุทรสงคราม')).toBe('metro')
  })

  it('จังหวัดอื่น = นอกพื้นที่', () => {
    expect(zoneFor('เชียงใหม่')).toBe('outside')
  })

  it('เช็คจากที่อยู่เต็มถ้าชื่อจังหวัดไม่ตรง', () => {
    expect(zoneFor('', 'ถนนสุขุมวิท กรุงเทพมหานคร 10110')).toBe('metro')
  })
})

describe('outsideDeliveryFeeFor (parity กับ frontend src/geo.test.ts)', () => {
  it('ระยะทางไป-กลับ (ระยะทาง×2) คูณค่าน้ำมัน/กม.', () => {
    expect(outsideDeliveryFeeFor(50, 8)).toBe(800)
  })

  it('ปัดเศษเป็นจำนวนเต็มบาท', () => {
    expect(outsideDeliveryFeeFor(33.333, 8)).toBe(Math.round(33.333 * 2 * 8))
  })
})
