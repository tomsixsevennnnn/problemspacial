import { docNumber } from './documents'
import type { Booking } from './types'

export type NotificationKind = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'reminder'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  message: string
  timestamp: string
}

/** ถือว่า "ใหม่" ถ้าเกิดขึ้นภายใน 24 ชม.ที่ผ่านมา — ใช้ตัดสินทั้งป้าย NEW รายรายการ และตัวเลขนับที่ไอคอนกระดิ่ง */
const NEW_WINDOW_MS = 86_400_000

export const isNotificationNew = (item: Pick<NotificationItem, 'timestamp'>): boolean =>
  Date.now() - new Date(item.timestamp).getTime() < NEW_WINDOW_MS

/** แปลง timestamp เป็นข้อความเวลาแบบสัมพัทธ์ เช่น "5 นาทีที่แล้ว" — ใช้ร่วมกันทั้งหน้ารายการแจ้งเตือนและ dropdown */
export const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (diffMs < minute) return 'เมื่อสักครู่'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} นาทีที่แล้ว`
  if (diffMs < day) return `${Math.floor(diffMs / hour)} ชั่วโมงที่แล้ว`
  return `${Math.floor(diffMs / day)} วันที่แล้ว`
}

/** สร้างรายการแจ้งเตือนจากใบจองจริงของลูกค้า (ไม่ใช้ mock) — 1 การ์ดต่อสถานะ บวกการ์ดเตือนล่วงหน้าถ้างานจะจัดพรุ่งนี้ */
export const buildNotifications = (bookings: Booking[]): NotificationItem[] => {
  const items: NotificationItem[] = []
  const tomorrowKey = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  for (const booking of bookings) {
    const no = docNumber(booking, 'booking')

    if (booking.status === 'pending') {
      items.push({
        id: `${booking.id}-pending`,
        kind: 'pending',
        title: 'รอการยืนยัน',
        message: `การจองหมายเลข ${no} กำลังรอการยืนยันจากเจ้าของร้าน`,
        timestamp: booking.createdAt,
      })
    } else if (booking.status === 'confirmed') {
      items.push({
        id: `${booking.id}-confirmed`,
        kind: 'confirmed',
        title: 'ยืนยันการจองแล้ว',
        message: `การจองหมายเลข ${no} ได้รับการยืนยัน วันที่ ${booking.date} ${booking.timeSlot}`,
        timestamp: booking.createdAt,
      })
      if (booking.date === tomorrowKey) {
        items.push({
          id: `${booking.id}-reminder`,
          kind: 'reminder',
          title: 'แจ้งเตือนงานพรุ่งนี้',
          message: `อย่าลืม! งานจัดเลี้ยงของคุณ ${no} จะจัดขึ้นพรุ่งนี้ ${booking.timeSlot}`,
          timestamp: new Date().toISOString(),
        })
      }
    } else if (booking.status === 'completed') {
      items.push({
        id: `${booking.id}-completed`,
        kind: 'completed',
        title: 'งานเสร็จสมบูรณ์',
        message: `งานจัดเลี้ยง ${no} เสร็จสิ้นแล้ว ขอบคุณที่ใช้บริการ`,
        timestamp: booking.createdAt,
      })
    } else if (booking.status === 'cancelled') {
      items.push({
        id: `${booking.id}-cancelled`,
        kind: 'cancelled',
        title: 'การจองถูกยกเลิก',
        message: `การจองหมายเลข ${no} ถูกยกเลิก`,
        timestamp: booking.createdAt,
      })
    }
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export const unreadNotificationCount = (bookings: Booking[]): number =>
  buildNotifications(bookings).filter(isNotificationNew).length
