import { Controller, Sse, UseGuards } from '@nestjs/common'
import { interval, map, merge, Observable } from 'rxjs'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RealtimeService } from './realtime.service'

interface SseMessage {
  data: string
}

/** ส่ง heartbeat ทุก 25 วิ กันบาง proxy/load balancer ตัดการเชื่อมต่อที่ไม่มี traffic นานเกินไป */
const HEARTBEAT_MS = 25_000

/** EventSource ของเบราว์เซอร์ตั้ง Authorization header เองไม่ได้ — jwt.strategy.ts รับ token จาก ?access_token= ด้วย */
@UseGuards(JwtAuthGuard)
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Sse('bookings')
  bookingsStream(): Observable<SseMessage> {
    return merge(
      this.realtime.bookingsChanged$.pipe(map((): SseMessage => ({ data: 'changed' }))),
      interval(HEARTBEAT_MS).pipe(map((): SseMessage => ({ data: 'ping' }))),
    )
  }

  @Sse('app')
  appStream(): Observable<SseMessage> {
    return merge(
      this.realtime.appChanged$.pipe(map((topic): SseMessage => ({ data: topic }))),
      interval(HEARTBEAT_MS).pipe(map((): SseMessage => ({ data: 'ping' }))),
    )
  }
}
