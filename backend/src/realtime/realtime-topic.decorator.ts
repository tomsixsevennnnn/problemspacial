import { SetMetadata } from '@nestjs/common'

export type RealtimeTopicName = 'bookings' | 'settings' | 'catalog'

export const REALTIME_TOPIC_KEY = 'realtime:topic'

/** ระบุ topic ที่ controller นี้กระทบ — RealtimeNotifyInterceptor จะยิงสัญญาณให้เองหลัง route ที่ไม่ใช่ GET สำเร็จ */
export const RealtimeTopic = (topic: RealtimeTopicName) => SetMetadata(REALTIME_TOPIC_KEY, topic)
