import { describe, expect, it } from 'vitest'
import { buildPromptPayPayload, crc16 } from './promptpay'

describe('crc16', () => {
  it('ให้ค่า check value มาตรฐานของ CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1')
  })
})

describe('buildPromptPayPayload', () => {
  it('เบอร์โทรใช้ sub-tag 01 และแปลงเป็นรหัสประเทศ 0066', () => {
    const payload = buildPromptPayPayload('081-234-5678', 1000)!
    expect(payload).toContain('0113' + '0066812345678')
    expect(payload).toContain('5407' + '1000.00')
  })

  it('ฝังยอดแล้วใช้ point-of-initiation แบบ dynamic (12)', () => {
    expect(buildPromptPayPayload('0812345678', 500)!.startsWith('000201010212')).toBe(true)
  })

  it('ไม่ระบุยอดเป็น static (11) และไม่มีฟิลด์ยอด', () => {
    const payload = buildPromptPayPayload('0812345678')!
    expect(payload.startsWith('000201010211')).toBe(true)
    expect(payload).not.toContain('54')
  })

  it('เลขบัตร 13 หลักใช้ sub-tag 02', () => {
    expect(buildPromptPayPayload('1234567890123', 10)).toContain('02131234567890123')
  })

  it('เลขวอลเล็ต 15 หลักใช้ sub-tag 03', () => {
    expect(buildPromptPayPayload('012345678901234', 10)).toContain('03150123456789012' + '34')
  })

  it('ท้ายข้อมูลเป็น CRC ที่ตรงกับเนื้อความก่อนหน้า', () => {
    const payload = buildPromptPayPayload('0812345678', 1234.5)!
    const body = payload.slice(0, -4)
    expect(payload.slice(-8, -4)).toBe('6304')
    expect(payload.slice(-4)).toBe(crc16(body))
  })

  it('คืน null เมื่อเลขพร้อมเพย์รูปแบบไม่ถูกต้อง', () => {
    expect(buildPromptPayPayload('12345')).toBeNull()
  })
})
