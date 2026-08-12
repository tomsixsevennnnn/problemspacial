import { useEffect, useState } from 'react'

interface AvatarProps {
  src?: string
  name: string
  className?: string
  textClassName?: string
}

/** รูปโปรไฟล์ + fallback เป็นตัวอักษรย่อเมื่อโหลดรูปไม่สำเร็จ (URL ตาย/ถูกบล็อก) แทนไอคอนรูปหัก */
export default function Avatar({ src, name, className = '', textClassName = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const initials = name.trim().slice(0, 2)

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-orange-100 text-orange-600 font-semibold select-none ${className}`}
      >
        <span className={textClassName}>{initials || '?'}</span>
      </div>
    )
  }

  return <img src={src} alt={name} onError={() => setFailed(true)} className={`object-cover ${className}`} />
}
