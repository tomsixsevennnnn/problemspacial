import { useEffect, useRef } from 'react'
import { bookingsStreamUrl } from './api'

/** ต่อ connection ใหม่ทุกช่วงนี้ด้วย token สด — กัน EventSource reconnect ด้วย token เดิมที่หมดอายุไปแล้วเงียบๆ */
const REOPEN_MS = 10 * 60_000

/**
 * เปิด SSE ฟังสัญญาณ "มีการเปลี่ยนแปลงรายการจอง" จาก backend แล้วเรียก onChanged ให้ผู้เรียก refetch เอง
 * ตัว stream ไม่มีข้อมูลจองส่งมาด้วย — การกรองสิทธิ์ยังอยู่ที่ GET /bookings เท่านั้น
 */
export function useBookingsStream(enabled: boolean, getToken: () => Promise<string>, onChanged: () => void) {
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let source: EventSource | null = null
    let reopenTimer: ReturnType<typeof setTimeout> | null = null

    const open = () => {
      getToken()
        .then(token => {
          if (cancelled) return
          source = new EventSource(bookingsStreamUrl(token))
          source.onmessage = event => {
            if (event.data === 'changed') onChangedRef.current()
          }
          reopenTimer = setTimeout(() => {
            source?.close()
            open()
          }, REOPEN_MS)
        })
        .catch(() => {
          // ขอ token ไม่สำเร็จ — ปล่อยผ่าน ให้ poll fallback ใน App.tsx ทำงานแทน
        })
    }
    open()

    return () => {
      cancelled = true
      source?.close()
      if (reopenTimer) clearTimeout(reopenTimer)
    }
  }, [enabled])
}
