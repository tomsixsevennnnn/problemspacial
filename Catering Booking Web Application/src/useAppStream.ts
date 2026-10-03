import { useEffect, useRef } from 'react'
import { appStreamUrl } from './api'

const REOPEN_MS = 10 * 60_000

export type AppChangeTopic = 'settings' | 'catalog'

/**
 * เปิด SSE ฟังสัญญาณ "มีการเปลี่ยนแปลง" ของ settings/เมนู-แพ็กเกจ แล้วเรียก onChanged(topic) ให้ผู้เรียก refetch
 * เฉพาะส่วนที่เกี่ยวข้องเอง — เหมือน useBookingsStream ตัว stream ไม่มีข้อมูลจริงมาด้วย
 */
export function useAppStream(enabled: boolean, getToken: () => Promise<string>, onChanged: (topic: AppChangeTopic) => void) {
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
          source = new EventSource(appStreamUrl(token))
          source.onmessage = event => {
            if (event.data === 'settings' || event.data === 'catalog') onChangedRef.current(event.data)
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
