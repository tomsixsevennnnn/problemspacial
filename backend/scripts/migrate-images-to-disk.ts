/**
 * ย้ายรูปที่เก็บเป็น base64 data URL ตรงใน DB (MenuItem.image, Settings.promptPayQr,
 * Booking.paymentSlipUrl) ออกมาเป็นไฟล์บน disk แล้วอัปเดตแถวให้เก็บแค่ path สั้นๆ แทน (ข้อ 3 ใน code review)
 *
 * รันครั้งเดียวด้วยมือ ไม่ auto-run ตอน boot:
 *   pnpm ts-node scripts/migrate-images-to-disk.ts
 *
 * ปลอดภัยที่จะรันซ้ำ (idempotent) — แถวที่ไม่ได้ขึ้นต้นด้วย "data:" (ย้ายไปแล้ว หรือไม่มีรูป) จะถูกข้าม
 */
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { ALLOWED_MIME_TO_EXT, UPLOADS_DIR } from '../src/uploads/uploads.constants'

const prisma = new PrismaClient()
const DATA_URL_PATTERN = /^data:([a-z0-9/+.-]+);base64,(.+)$/i

async function saveDataUrl(kind: 'menus' | 'qr' | 'slips', dataUrl: string): Promise<string | null> {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) return null
  const [, mimeType, base64] = match
  const ext = ALLOWED_MIME_TO_EXT[mimeType.toLowerCase()]
  if (!ext) return null

  const dir = join(UPLOADS_DIR, kind)
  await mkdir(dir, { recursive: true })
  const filename = `${randomUUID()}.${ext}`
  await writeFile(join(dir, filename), Buffer.from(base64, 'base64'))
  return `/uploads/${kind}/${filename}`
}

async function migrateMenuItems() {
  const rows = await prisma.menuItem.findMany({ where: { image: { startsWith: 'data:' } } })
  console.log(`MenuItem: ${rows.length} แถวต้องย้าย`)
  for (const row of rows) {
    const url = await saveDataUrl('menus', row.image!)
    if (!url) {
      console.warn(`  ข้าม MenuItem ${row.id} — data URL รูปแบบไม่รองรับ`)
      continue
    }
    await prisma.menuItem.update({ where: { id: row.id }, data: { image: url } })
    console.log(`  MenuItem ${row.id} -> ${url}`)
  }
}

async function migrateSettings() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } })
  if (!settings?.promptPayQr?.startsWith('data:')) {
    console.log('Settings.promptPayQr: ไม่ต้องย้าย')
    return
  }
  const url = await saveDataUrl('qr', settings.promptPayQr)
  if (!url) {
    console.warn('  ข้าม Settings.promptPayQr — data URL รูปแบบไม่รองรับ')
    return
  }
  await prisma.settings.update({ where: { id: 1 }, data: { promptPayQr: url } })
  console.log(`Settings.promptPayQr -> ${url}`)
}

async function migrateBookingSlips() {
  const rows = await prisma.booking.findMany({ where: { paymentSlipUrl: { startsWith: 'data:' } } })
  console.log(`Booking: ${rows.length} สลิปต้องย้าย`)
  for (const row of rows) {
    const url = await saveDataUrl('slips', row.paymentSlipUrl!)
    if (!url) {
      console.warn(`  ข้าม Booking ${row.id} — data URL รูปแบบไม่รองรับ`)
      continue
    }
    await prisma.booking.update({ where: { id: row.id }, data: { paymentSlipUrl: url } })
    console.log(`  Booking ${row.id} -> ${url}`)
  }
}

async function main() {
  console.log(`เก็บไฟล์ที่: ${UPLOADS_DIR}`)
  await migrateMenuItems()
  await migrateSettings()
  await migrateBookingSlips()
  console.log('เสร็จแล้ว')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
