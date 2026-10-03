import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'

export type AppChangeTopic = 'settings' | 'catalog'

/**
 * ส่งสัญญาณ "มีการเปลี่ยนแปลงข้อมูล" ผ่าน SSE ให้ client ที่เปิดหน้าค้างไว้รู้ทันทีว่าต้อง refetch
 * ตัว event ไม่พ่วงข้อมูลจริงไปด้วย เพื่อให้การกรองสิทธิ์ยังอยู่ที่ endpoint GET เดิมเท่านั้น
 */
@Injectable()
export class RealtimeService {
  private readonly bookingsChangedSubject = new Subject<void>()
  readonly bookingsChanged$ = this.bookingsChangedSubject.asObservable()

  private readonly appChangedSubject = new Subject<AppChangeTopic>()
  readonly appChanged$ = this.appChangedSubject.asObservable()

  emitBookingsChanged() {
    this.bookingsChangedSubject.next()
  }

  emitAppChanged(topic: AppChangeTopic) {
    this.appChangedSubject.next(topic)
  }
}
