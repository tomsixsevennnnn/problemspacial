import type { MenuItem } from '../types'
import { CATEGORY_MAP } from '../data'
import { resolveAssetUrl } from '../api'

interface DishTileProps {
  item: MenuItem
  /** ใช้หมวดของ "ข้อ" แทนหมวดของจาน (เช่น สี่สีมังกรทอด ที่อยู่ในข้อจานหลัก) */
  category?: string
  emojiClass?: string
  className?: string
}

export default function DishTile({ item, category, emojiClass = 'text-4xl', className = '' }: DishTileProps) {
  if (item.image) {
    const pos = item.imagePosition
    const scale = item.imageScale
    const style =
      pos || scale
        ? {
            objectPosition: pos ? `${pos.x}% ${pos.y}%` : undefined,
            transform: scale && scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: pos ? `${pos.x}% ${pos.y}%` : undefined,
          }
        : undefined
    return (
      <img
        src={resolveAssetUrl(item.image)}
        alt={item.name}
        draggable={false}
        className={`w-full h-full object-cover ${className}`}
        style={style}
      />
    )
  }

  const cat = CATEGORY_MAP[category ?? item.category]

  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${
        cat?.gradient ?? 'from-gray-100 to-gray-200'
      } ${className}`}
    >
      <span className={emojiClass}>{cat?.icon ?? '🍽️'}</span>
    </div>
  )
}
