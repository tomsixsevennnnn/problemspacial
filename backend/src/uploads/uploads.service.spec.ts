import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BadRequestException } from '@nestjs/common'

const TEST_DIR = join(__dirname, '__uploads_test__')
process.env.UPLOADS_DIR = TEST_DIR

// ต้อง import หลังตั้ง UPLOADS_DIR เพราะ uploads.constants.ts อ่านค่า env ตอน module load
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UploadsService } = require('./uploads.service')

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('UploadsService.saveDataUrl (ข้อ 3 — เก็บรูปเป็นไฟล์แทน base64-in-DB)', () => {
  const service = new UploadsService()

  afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }))

  it('decode data URL แล้วเขียนไฟล์จริงลง disk คืน path สั้นๆ ขึ้นต้นด้วย /uploads/', async () => {
    const url = await service.saveDataUrl('menus', TINY_PNG)

    expect(url).toMatch(/^\/uploads\/menus\/[\w-]+\.png$/)
    const fullPath = join(TEST_DIR, url.replace('/uploads/', ''))
    expect(existsSync(fullPath)).toBe(true)
    expect(readFileSync(fullPath).length).toBeGreaterThan(0)
  })

  it('ปฏิเสธ mime type ที่ไม่รองรับ', async () => {
    await expect(service.saveDataUrl('menus', 'data:application/pdf;base64,JVBERi0xLjQK')).rejects.toThrow(
      BadRequestException,
    )
  })

  it('ปฏิเสธ string ที่ไม่ใช่ data URL', async () => {
    await expect(service.saveDataUrl('menus', 'not-a-data-url')).rejects.toThrow(BadRequestException)
  })

  it('ปฏิเสธ kind ที่ไม่รู้จัก', async () => {
    await expect(service.saveDataUrl('evil' as any, TINY_PNG)).rejects.toThrow(BadRequestException)
  })
})

describe('UploadsService.deleteManagedFile (ข้อ 1 — กันไฟล์ orphan ค้าง disk ตอนเปลี่ยนรูป)', () => {
  const service = new UploadsService()

  afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }))

  it('ลบไฟล์ที่ saveDataUrl สร้างไว้จริงๆ', async () => {
    const url = await service.saveDataUrl('menus', TINY_PNG)
    const fullPath = join(TEST_DIR, url.replace('/uploads/', ''))
    expect(existsSync(fullPath)).toBe(true)

    await service.deleteManagedFile(url)

    expect(existsSync(fullPath)).toBe(false)
  })

  it('ไฟล์ไม่มีอยู่แล้ว (ลบซ้ำ) — ไม่ throw', async () => {
    await expect(service.deleteManagedFile('/uploads/menus/does-not-exist.jpg')).resolves.toBeUndefined()
  })

  it('ค่าว่าง/undefined/ไม่ใช่ path ของ /uploads/ — ไม่ทำอะไร ไม่ throw (เช่น data URL เก่าที่ยังไม่ migrate)', async () => {
    await expect(service.deleteManagedFile(undefined)).resolves.toBeUndefined()
    await expect(service.deleteManagedFile(null)).resolves.toBeUndefined()
    await expect(service.deleteManagedFile('data:image/png;base64,xxx')).resolves.toBeUndefined()
  })

  it('กัน path traversal — ปฏิเสธ path ที่พยายามหลุดออกนอกโฟลเดอร์ uploads', async () => {
    const outside = join(TEST_DIR, '..', 'escaped.txt')
    writeFileSync(outside, 'should survive')

    await service.deleteManagedFile('/uploads/../escaped.txt')

    expect(existsSync(outside)).toBe(true) // ยังอยู่ — พิสูจน์ว่าโดนบล็อกจริง ไม่ใช่แค่ path ไม่ตรง
    rmSync(outside, { force: true })
  })
})
