import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, tap } from 'rxjs'
import { REALTIME_TOPIC_KEY, type RealtimeTopicName } from './realtime-topic.decorator'
import { RealtimeService } from './realtime.service'

/** ยิงสัญญาณ SSE หลัง route ที่เขียนข้อมูล (POST/PATCH/DELETE) สำเร็จเท่านั้น — error จะข้าม tap ไปเอง */
@Injectable()
export class RealtimeNotifyInterceptor implements NestInterceptor {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { method } = context.switchToHttp().getRequest<{ method: string }>()
    if (method === 'GET') return next.handle()

    const topic = this.reflector.get<RealtimeTopicName | undefined>(REALTIME_TOPIC_KEY, context.getClass())
    if (!topic) return next.handle()

    return next.handle().pipe(
      tap(() => {
        if (topic === 'bookings') this.realtime.emitBookingsChanged()
        else this.realtime.emitAppChanged(topic)
      }),
    )
  }
}
