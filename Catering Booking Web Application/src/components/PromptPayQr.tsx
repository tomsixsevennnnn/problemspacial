import { useEffect, useState } from 'react'
import { toDataURL } from 'qrcode'
import { buildPromptPayPayload } from '../promptpay'

interface PromptPayQrProps {
  /** เบอร์โทร / เลขบัตร ปชช. / เลขวอลเล็ตที่ผูกกับพร้อมเพย์ร้าน (ShopInfo.promptPayId) */
  promptPayId: string
  /** ยอดที่ต้องโอน (บาท) — ฝังไว้ใน QR เลย แอปธนาคารจะกรอกยอดให้ตอนสแกน */
  amount: number
  size?: number
  className?: string
}

/** QR พร้อมเพย์แบบ dynamic ต่อใบจอง สร้างใหม่ทุกครั้งที่ยอดหรือเลขพร้อมเพย์เปลี่ยน */
export default function PromptPayQr({ promptPayId, amount, size = 128, className }: Readonly<PromptPayQrProps>) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setDataUrl(null)
    setError(false)
    const payload = buildPromptPayPayload(promptPayId, amount)
    if (!payload) return

    let cancelled = false
    toDataURL(payload, { width: size, margin: 1 })
      .then(url => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [promptPayId, amount, size])

  if (!buildPromptPayPayload(promptPayId, amount)) {
    return <p className="text-[11px] text-red-500">เลขพร้อมเพย์ในหน้าตั้งค่าไม่ถูกต้อง</p>
  }
  if (error) return <p className="text-[11px] text-red-500">สร้าง QR พร้อมเพย์ไม่สำเร็จ</p>
  if (!dataUrl) return null

  return (
    <img
      src={dataUrl}
      alt={`QR พร้อมเพย์ยอด ${amount.toLocaleString()} บาท`}
      width={size}
      height={size}
      className={className}
    />
  )
}
