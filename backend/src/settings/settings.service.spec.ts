import { ConflictException } from '@nestjs/common'
import { SettingsService } from './settings.service'

const EXISTING = { id: 1, version: 3, shopName: 'ร้านเดิม', promptPayQr: '/uploads/qr/old.png' }

const makeDeps = (updateManyCount: number, updatedPatch: Record<string, unknown> = {}) => {
  const prisma = {
    settings: {
      findUnique: jest.fn().mockResolvedValue(EXISTING),
      updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...EXISTING, version: EXISTING.version + 1, shopName: 'ร้านใหม่', ...updatedPatch }),
    },
  }
  const uploads = { deleteManagedFile: jest.fn() }
  return { prisma, uploads }
}

describe('SettingsService.update — optimistic concurrency (ข้อ 6)', () => {
  it('version ตรงกับที่ DB มีอยู่ — อัปเดตสำเร็จและ version เพิ่มขึ้น', async () => {
    const { prisma, uploads } = makeDeps(1)
    const service = new SettingsService(prisma as any, uploads as any)

    const updated = await service.update({ expectedVersion: 3, shopName: 'ร้านใหม่' } as any)

    expect(prisma.settings.updateMany).toHaveBeenCalledWith({
      where: { id: 1, version: 3 },
      data: { shopName: 'ร้านใหม่', version: { increment: 1 } },
    })
    expect(updated.version).toBe(4)
  })

  it('version ไม่ตรง (มีคนแก้ไปแล้ว) — throw ConflictException ไม่เขียนทับเงียบๆ', async () => {
    const { prisma, uploads } = makeDeps(0)
    const service = new SettingsService(prisma as any, uploads as any)

    await expect(service.update({ expectedVersion: 1, shopName: 'ร้านใหม่' } as any)).rejects.toThrow(
      ConflictException,
    )
  })
})

describe('SettingsService.update — ลบไฟล์ QR เก่าตอนเปลี่ยน/ลบ (ข้อ 1)', () => {
  it('promptPayQr เปลี่ยนเป็นค่าใหม่ — ลบไฟล์เก่าทิ้ง', async () => {
    const { prisma, uploads } = makeDeps(1, { promptPayQr: '/uploads/qr/new.png' })
    const service = new SettingsService(prisma as any, uploads as any)

    await service.update({ expectedVersion: 3, promptPayQr: '/uploads/qr/new.png' } as any)

    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/qr/old.png')
  })

  it('promptPayQr ถูกลบ (ส่ง "" มา) — ลบไฟล์เก่าทิ้งเหมือนกัน', async () => {
    const { prisma, uploads } = makeDeps(1, { promptPayQr: '' })
    const service = new SettingsService(prisma as any, uploads as any)

    await service.update({ expectedVersion: 3, promptPayQr: '' } as any)

    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/qr/old.png')
  })

  it('ไม่แตะ promptPayQr เลย (undefined) — ไม่ลบอะไร', async () => {
    const { prisma, uploads } = makeDeps(1)
    const service = new SettingsService(prisma as any, uploads as any)

    await service.update({ expectedVersion: 3, shopName: 'ร้านใหม่' } as any)

    expect(uploads.deleteManagedFile).not.toHaveBeenCalled()
  })
})
