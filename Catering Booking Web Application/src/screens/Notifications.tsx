import { Bell, Calendar, CheckCircle, Clock, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import Navbar from '../components/Navbar'
import { buildNotifications, formatRelativeTime, isNotificationNew } from '../notifications'
import type { NotificationKind } from '../notifications'
import type { Booking, Screen, UserProfile } from '../types'

interface NotificationsProps {
  navigate: (s: Screen) => void
  user: UserProfile | null
  bookings: Booking[]
  notifCount: number
}

type NotifStyle = {
  icon: ComponentType<{ size?: number; className?: string }>
  color: string
  bg: string
  border: string
}

const STYLE: Record<NotificationKind, NotifStyle> = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-100' },
  confirmed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-100' },
  completed: { icon: CheckCircle, color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-100' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' },
  reminder: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-100' },
}

export default function Notifications({ navigate, user, bookings, notifCount }: NotificationsProps) {
  const notifications = buildNotifications(bookings)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar navigate={navigate} currentScreen="notifications" user={user} notifCount={notifCount} />

      <div className="pt-24 pb-12 max-w-2xl mx-auto px-4">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell size={24} className="text-orange-500" />
              การแจ้งเตือน
            </h1>
            <p className="text-gray-500 text-sm mt-1">รายการแจ้งเตือนทั้งหมด</p>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
            ยังไม่มีการแจ้งเตือน
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => {
              const style = STYLE[notif.kind]
              const Icon = style.icon
              const isNew = isNotificationNew(notif)
              return (
                <div
                  key={notif.id}
                  className={`bg-white rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md ${
                    isNew ? 'border-orange-100' : 'border-gray-100'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 ${style.bg} border ${style.border} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon size={18} className={style.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900 text-sm">{notif.title}</p>
                        {isNew && (
                          <span className="text-[9px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 leading-relaxed">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-2">{formatRelativeTime(notif.timestamp)}</p>
                    </div>
                    {isNew && (
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="text-center mt-8">
            <p className="text-gray-400 text-sm">แสดงการแจ้งเตือนทั้งหมดแล้ว</p>
          </div>
        )}
      </div>
    </div>
  )
}
