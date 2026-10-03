/**
 * ข้อมูล QR พร้อมเพย์ตามมาตรฐาน EMVCo ของ ธปท. — ฝังยอดเงินไว้ในข้อมูลเลย แอปธนาคารจะกรอกยอดให้ตอนสแกน
 * ไม่พึ่งแพ็กเกจภายนอก (ตัวสร้างรูป QR แยกไว้ต่างหาก ดู components/PromptPayQr.tsx)
 */

const AID_PROMPTPAY = 'A000000677010111'

const tlv = (id: string, value: string) => `${id}${value.length.toString().padStart(2, '0')}${value}`

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — ค่าตรวจสอบท้ายข้อมูล QR */
export const crc16 = (input: string): string => {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** แปลงเลขพร้อมเพย์เป็น sub-tag ตามชนิด: เบอร์โทร (01) / เลขบัตร ปชช. (02) / เลขวอลเล็ต (03) */
const targetFor = (rawId: string): { subTag: string; value: string } | null => {
  const digits = rawId.replace(/\D/g, '')
  if (/^0\d{9}$/.test(digits)) return { subTag: '01', value: `0066${digits.slice(1)}` }
  if (digits.length === 13) return { subTag: '02', value: digits }
  if (digits.length === 15) return { subTag: '03', value: digits }
  return null
}

/**
 * สร้างข้อความ QR พร้อมเพย์ — amount เป็นบาท ถ้าไม่ระบุหรือ ≤ 0 จะได้ QR แบบไม่ระบุยอด
 * คืน null ถ้าเลขพร้อมเพย์ไม่อยู่ในรูปแบบที่รู้จัก (เบอร์ 10 หลัก / บัตร 13 หลัก / วอลเล็ต 15 หลัก)
 */
export const buildPromptPayPayload = (promptPayId: string, amount?: number): string | null => {
  const target = targetFor(promptPayId)
  if (!target) return null
  const hasAmount = amount != null && amount > 0

  const body =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('29', tlv('00', AID_PROMPTPAY) + tlv(target.subTag, target.value)) +
    tlv('53', '764') +
    (hasAmount ? tlv('54', amount.toFixed(2)) : '') +
    tlv('58', 'TH')

  return body + '6304' + crc16(body + '6304')
}
