import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { SettingsService } from './settings.service'

const EXISTING = { id: 1, version: 3, shopName: 'ร้านเดิม', promptPayQr: '/uploads/qr/old.png' }

const notFoundError = () =>
  new Prisma.PrismaClientKnownRequestError('An operation failed because it depends on one or more records that were required but not found.', {
    code: 'P2025',
    clientVersion: 'test',
  })

const makeDeps = (updateResult: 'ok' | 'conflict', updatedPatch: Record<string, unknown> = {}) => {
  const prisma = {
    settings: {
      findUnique: jest.fn().mockResolvedValue(EXISTING),
      update:
        updateResult === 'ok'
          ? jest.fn().mockResolvedValue({ ...EXISTING, version: EXISTING.version + 1, shopName: 'ร้านใหม่', ...updatedPatch })
          : jest.fn().mockRejectedValue(notFoundError()),
    },
  }
  const uploads = { deleteManagedFile: jest.fn() }
  return { prisma, uploads }
}

describe('SettingsService.update — optimistic concurrency (ข้อ 6)', () => {
  it('version ตรงกับที่ DB มีอยู่ — อัปเดตสำเร็จและ version เพิ่มขึ้น', async () => {
    const { prisma, uploads } = makeDeps('ok')
    const service = new SettingsService(prisma as any, uploads as any)

    const updated = await service.update({ expectedVersion: 3, shopName: 'ร้านใหม่' } as any)

    expect(prisma.settings.update).toHaveBeenCalledWith({
      where: { id_version: { id: 1, version: 3 } },
      data: { shopName: 'ร้านใหม่', version: { increment: 1 } },
    })
    expect(updated.version).toBe(4)
  })

  it('version ไม่ตรง (มีคนแก้ไปแล้ว) — throw ConflictException ไม่เขียนทับเงียบๆ', async () => {
    const { prisma, uploads } = makeDeps('conflict')
    const service = new SettingsService(prisma as any, uploads as any)

    await expect(service.update({ expectedVersion: 1, shopName: 'ร้านใหม่' } as any)).rejects.toThrow(
      ConflictException,
    )
  })
})

describe('SettingsService.update — ลบไฟล์ QR เก่าตอนเปลี่ยน/ลบ (ข้อ 1)', () => {
  it('promptPayQr เปลี่ยนเป็นค่าใหม่ — ลบไฟล์เก่าทิ้ง', async () => {
    const { prisma, uploads } = makeDeps('ok', { promptPayQr: '/uploads/qr/new.png' })
    const service = new SettingsService(prisma as any, uploads as any)

    await service.update({ expectedVersion: 3, promptPayQr: '/uploads/qr/new.png' } as any)

    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/qr/old.png')
  })

  it('promptPayQr ถูกลบ (ส่ง "" มา) — ลบไฟล์เก่าทิ้งเหมือนกัน', async () => {
    const { prisma, uploads } = makeDeps('ok', { promptPayQr: '' })
    const service = new SettingsService(prisma as any, uploads as any)

    await service.update({ expectedVersion: 3, promptPayQr: '' } as any)

    expect(uploads.deleteManagedFile).toHaveBeenCalledWith('/uploads/qr/old.png')
  })

  it('ไม่แตะ promptPayQr เลย (undefined) — ไม่ลบอะไรและไม่เสีย round trip ไปดึง before', async () => {
    const { prisma, uploads } = makeDeps('ok')
    const service = new SettingsService(prisma as any, uploads as any)

    await service.update({ expectedVersion: 3, shopName: 'ร้านใหม่' } as any)

    expect(uploads.deleteManagedFile).not.toHaveBeenCalled()
    expect(prisma.settings.findUnique).not.toHaveBeenCalled()
  })
})
