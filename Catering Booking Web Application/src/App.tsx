import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { LayoutDashboard } from 'lucide-react'
import type { AppSettings, BookingData, Screen, UserProfile, Booking, EventLocation, MenuItem, Package, QueueBooking } from './types'
import { DEFAULT_CATEGORY_ORDER, includedItems } from './data'
import { DEFAULT_DEPOSIT_RATE, DEFAULT_SHOP_INFO, SHOP_NAME_CACHE_KEY } from './documents'
import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_FREE_DELIVERY_MIN_TABLES,
  DEFAULT_FUEL_COST_PER_KM,
  DEFAULT_SHOP_LOCATION,
  formatFullAddress,
} from './geo'
import {
  DEFAULT_WAGE_ASSISTANT,
  DEFAULT_WAGE_CHEF,
  DEFAULT_WAGE_DISHWASHER,
  DEFAULT_WAGE_SERVER_PER_TABLE,
} from './costing'
import { roleFromAuth0User, type AppRole } from './auth'
import { DEFAULT_UNREAD_WINDOW_MS, unreadNotificationCount } from './notifications'
import { api, type BackendUser, type CreatePackageInput, type UpdatePackageInput, type UploadKind } from './api'
import ErrorBanner from './components/ErrorBanner'
import Login from './screens/Login'
import CompleteProfile from './screens/CompleteProfile'
import Home from './screens/Home'
import BookingCalendar from './screens/BookingCalendar'
import SelectTable from './screens/SelectTable'
import SelectLocation from './screens/SelectLocation'
import SelectPackage from './screens/SelectPackage'
import SelectMenu from './screens/SelectMenu'
import Cart from './screens/Cart'
import BookingHistory from './screens/BookingHistory'
import Notifications from './screens/Notifications'
import OwnerLayout from './components/OwnerLayout'
import Dashboard from './screens/owner/Dashboard'
import Orders from './screens/owner/Orders'
import CalendarView from './screens/owner/CalendarView'
import Packages from './screens/owner/Packages'
import Menus from './screens/owner/Menus'
import Documents from './screens/owner/Documents'
import Reports from './screens/owner/Reports'
import Settings from './screens/owner/Settings'
import UserRoles from './screens/owner/UserRoles'

const OWNER_SCREENS: Screen[] = [
  'owner-dashboard', 'owner-orders', 'owner-calendar', 'owner-packages', 'owner-menus', 'owner-documents',
  'owner-reports', 'owner-users', 'owner-settings',
]

/** เวลาที่ลูกค้าเปิดหน้า "การแจ้งเตือน" ล่าสุด — ใช้ตัดสินว่ารายการไหน "ยังไม่อ่าน" (เหมือน owner-notif-seen-at ฝั่งเจ้าของร้าน) */
const NOTIF_SEEN_KEY = 'customer-notif-seen-at'

const initialSettings: AppSettings = {
  shopInfo: DEFAULT_SHOP_INFO,
  depositRate: DEFAULT_DEPOSIT_RATE,
  deliveryFee: DEFAULT_DELIVERY_FEE,
  freeDeliveryMinTables: DEFAULT_FREE_DELIVERY_MIN_TABLES,
  wageChef: DEFAULT_WAGE_CHEF,
  wageAssistant: DEFAULT_WAGE_ASSISTANT,
  wageServerPerTable: DEFAULT_WAGE_SERVER_PER_TABLE,
  wageDishwasher: DEFAULT_WAGE_DISHWASHER,
  categoryOrder: DEFAULT_CATEGORY_ORDER,
  shopLocation: DEFAULT_SHOP_LOCATION,
  fuelCostPerKm: DEFAULT_FUEL_COST_PER_KM,
  // ค่าเริ่มต้นก่อนโหลดจริงจาก backend — ตัวจริงจะมาแทนที่หลัง GET /settings เสมอ
  version: 0,
}

const initialBooking: BookingData = {
  date: null,
  timeSlot: null,
  tables: 2,
  location: null,
  packageId: null,
  packageName: null,
  packagePrice: 0,
  menuLimit: 9,
  selectedMenus: [],
}

export default function App() {
  const { isAuthenticated, isLoading, user: auth0User, logout, getAccessTokenSilently } = useAuth0()
  const [screen, setScreen] = useState<Screen>('login')
  const [booking, setBooking] = useState<BookingData>(initialBooking)
  // รายการจองทั้งหมด — ใช้ร่วมกันทั้งปฏิทินร้าน ประวัติ และเอกสาร (owner เห็นทุกใบจอง, customer เห็นเฉพาะของตัวเอง)
  const [bookings, setBookings] = useState<Booking[]>([])
  // คิวรับงานของ "ทุกลูกค้า" แบบไม่มีข้อมูลส่วนตัว — ใช้เฉพาะหน้าเลือกวันจัดงาน กันลูกค้าเลือกวันที่คนอื่นจองเต็มไปแล้ว
  const [availability, setAvailability] = useState<QueueBooking[]>([])
  // แพ็กเกจและคลังเมนูอยู่ที่นี่ เพื่อให้เจ้าของร้านแก้แล้วฝั่งลูกค้าเห็นผลทันที
  const [packages, setPackages] = useState<Package[]>([])
  const [menus, setMenus] = useState<MenuItem[]>([])
  // ค่าตั้งค่าร้าน — แก้ได้จากหน้า "ตั้งค่า" ฝั่งเจ้าของร้าน มีผลกับค่าขนส่ง มัดจำ และข้อมูลบนเอกสารทันที
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  // โปรไฟล์ผู้ใช้จาก backend (ผูกกับ Auth0 sub) — เป็นแหล่งความจริงเดียวของ user profile
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  // แจ้งเตือนลอยตอนทำรายการ (จอง/แก้แพ็กเกจ/แก้เมนู ฯลฯ) ไม่สำเร็จ — คนละเรื่องกับ loadError ที่บล็อกทั้งหน้า
  const [actionError, setActionError] = useState<string | null>(null)
  // เวลาที่ลูกค้าเปิดหน้าแจ้งเตือนล่าสุด (ใช้กับตัวเลขที่กระดิ่ง) — ถ้ายังไม่เคยเปิดเลย ใช้ค่าเริ่มต้นย้อนหลัง 24 ชม.
  const [notifSeenAt, setNotifSeenAt] = useState(
    () => Number(localStorage.getItem(NOTIF_SEEN_KEY)) || Date.now() - DEFAULT_UNREAD_WINDOW_MS
  )
  // ค่า notifSeenAt "ก่อนหน้า" ที่ freeze ไว้ตอนเข้าหน้าแจ้งเตือนรอบนี้ — ใช้ตัดสินป้าย "ยังไม่อ่าน" รายรายการ
  // ในหน้านั้นเอง (โชว์สิ่งที่ใหม่ตั้งแต่ครั้งก่อนที่เปิดดู) แยกจาก notifSeenAt ที่อัปเดตทันทีเพื่อให้ตัวเลขที่กระดิ่งหายทันที
  const [notifPageSeenAt, setNotifPageSeenAt] = useState(notifSeenAt)

  /** ตั้งชื่อแท็บเบราว์เซอร์ให้ไวที่สุดตั้งแต่แอป mount — ใช้ endpoint สาธารณะ ไม่ต้องรอ login/โหลดข้อมูลครบชุดเหมือน settings ปกติ */
  useEffect(() => {
    api
      .publicShopInfo()
      .then(info => {
        document.title = info.name
        localStorage.setItem(SHOP_NAME_CACHE_KEY, info.name)
      })
      .catch(() => {})
  }, [])

  /** โหลดข้อมูลทั้งหมดจาก backend ทันทีที่ login สำเร็จ — sync user + ดึง bookings/packages/menus/settings พร้อมกัน */
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    const load = async () => {
      setLoadError(null)
      try {
        const token = await getAccessTokenSilently()
        // access token ไม่มี name/email/picture ให้ (มีแค่ role claim) — ส่งจาก ID token ฝั่งนี้แทน
        const [me, bks, avail, pkgs, mns, sttgs] = await Promise.all([
          api.syncProfile(token, {
            name: auth0User?.given_name || auth0User?.name?.split(' ')[0] || 'ผู้ใช้',
            surname: auth0User?.family_name || auth0User?.name?.split(' ').slice(1).join(' ') || '',
            email: auth0User?.email ?? '',
            avatar: auth0User?.picture ?? '',
          }),
          api.bookings(token),
          api.bookingsAvailability(token),
          api.packages(token),
          api.menus(token),
          api.settings(token),
        ])
        if (cancelled) return
        setBackendUser(me)
        setBookings(bks)
        setAvailability(avail)
        setPackages(pkgs)
        setMenus(mns)
        setSettings(sttgs)
        setDataLoaded(true)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        // refresh token หมดอายุ/ถูกเพิกถอน — retry ซ้ำไม่มีทางสำเร็จ ต้องพากลับไป login ใหม่เท่านั้น
        if (/refresh token/i.test(message)) {
          logout({ logoutParams: { returnTo: window.location.origin } })
          return
        }
        setLoadError(message || 'โหลดข้อมูลไม่สำเร็จ')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, getAccessTokenSilently, auth0User, retryKey, logout])

  /** poll ค่าตั้งค่าร้านทุก 20 วินาที — ให้ทุกเครื่องเห็นการแก้ไข (เช่น ชื่อร้าน) โดยอัตโนมัติ ไม่ต้องกด refresh เอง
   *  หยุด poll เมื่อสลับไปแท็บ/แอปอื่น (document.hidden) กันยิง request เปล่าๆ ตอนไม่มีใครดูอยู่ */
  useEffect(() => {
    if (!dataLoaded) return

    const pollOnce = async () => {
      try {
        const token = await getAccessTokenSilently()
        const fresh = await api.settings(token)
        setSettings(prev => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh))
      } catch {
        // เงียบไว้ — ไม่ใช่รายการที่ผู้ใช้กดเอง ไม่ต้องเด้ง error banner รบกวน แค่ลองใหม่รอบถัดไป
      }
    }

    const interval = setInterval(() => {
      if (!document.hidden) pollOnce()
    }, 20000)
    // กลับมาที่แท็บนี้อีกครั้ง — ดึงค่าล่าสุดทันทีแทนที่จะรอรอบ poll ถัดไป
    const onVisible = () => {
      if (!document.hidden) pollOnce()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [dataLoaded, getAccessTokenSilently])

  const withToken = () => getAccessTokenSilently()

  /** อัปโหลดรูป (data URL ที่ย่อแล้วจาก pickImageAsDataUrl) ไปเก็บเป็นไฟล์บน backend — คืน URL สั้นๆ
   *  ไม่ห่อด้วย runAction เพราะหน้าที่เรียก (Menus/Settings/BookingHistory) จัดการ error เองแบบ inline ใกล้ปุ่มอัปโหลดอยู่แล้ว */
  const handleUploadImage = async (kind: UploadKind, dataUrl: string): Promise<string> => {
    const token = await withToken()
    return api.uploadImage(token, kind, dataUrl)
  }

  /** โหลดรายการจองทีละหน้า — ใช้เฉพาะหน้า Orders (owner) และ ประวัติการจอง (customer) ไม่ใช่ bookings state หลัก
   *  ที่ Dashboard/Reports/Calendar/Documents ยังใช้ข้อมูลเต็มชุดตามเดิม */
  const handleFetchBookingsPage = async (page: number, pageSize: number, search: string, status?: Booking['status']) => {
    const token = await withToken()
    return api.bookingsPage(token, page, pageSize, search, status)
  }

  /** owner ค้นหาผู้ใช้ที่เคย login แล้วด้วยอีเมล — ใช้ในหน้า "สิทธิ์การเข้าถึง" เพื่อเลื่อน/ถอดสิทธิ์ owner
   *  ไม่ห่อด้วย runAction เพราะ UserRoles.tsx จัดการ error เองแบบ inline ใกล้ช่องค้นหา */
  const handleSearchUsers = async (email: string) => {
    const token = await withToken()
    return api.searchUsersByEmail(token, email)
  }

  const handleSetUserRole = async (userId: string, role: 'OWNER' | 'CUSTOMER') => {
    const token = await withToken()
    await api.setUserRole(token, userId, role)
  }

  const handleListOwners = async () => {
    const token = await withToken()
    return api.listOwners(token)
  }

  /** อัปเดตชื่อร้านบนแท็บเบราว์เซอร์ + จำไว้ใน localStorage ให้หน้า Login ใช้ได้ก่อน login */
  useEffect(() => {
    document.title = settings.shopInfo.name
    localStorage.setItem(SHOP_NAME_CACHE_KEY, settings.shopInfo.name)
  }, [settings.shopInfo.name])

  /** ห่อ handler ที่ยิง API ทุกตัว — ถ้า error ให้เด้ง banner แจ้งผู้ใช้แทนที่จะเงียบ/พังไม่รู้สาเหตุ */
  const runAction = async (fn: () => Promise<void>) => {
    try {
      setActionError(null)
      await fn()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  /** เพิ่มหรือแก้ไขเมนู — ถ้าแก้ของเดิม ให้ซิงก์เข้าไปในแพ็กเกจที่ใช้เมนูนี้อยู่ด้วย */
  const handleSaveMenu = (item: MenuItem) =>
    runAction(async () => {
      const token = await withToken()
      const isExisting = menus.some(m => m.id === item.id)
      const input = {
        name: item.name,
        category: item.category,
        description: item.description,
        image: item.image,
        costPrice: item.costPrice,
        active: item.active,
      }
      const saved = isExisting ? await api.updateMenu(token, item.id, input) : await api.createMenu(token, input)

      setMenus(prev => (isExisting ? prev.map(m => (m.id === saved.id ? saved : m)) : [...prev, saved]))
      setPackages(prev =>
        prev.map(p => ({
          ...p,
          courses: p.courses.map(c => ({
            ...c,
            items: c.items.map(i => (i.id === saved.id ? saved : i)),
          })),
        }))
      )
    })

  /** ลบเมนูออกจากคลัง พร้อมถอดออกจากทุกแพ็กเกจที่ใช้อยู่ */
  const handleDeleteMenu = (id: string) =>
    runAction(async () => {
      const token = await withToken()
      await api.deleteMenu(token, id)
      setMenus(prev => prev.filter(m => m.id !== id))
      setPackages(prev =>
        prev.map(p => ({
          ...p,
          courses: p.courses.map(c => ({ ...c, items: c.items.filter(i => i.id !== id) })),
        }))
      )
    })

  const handleCreatePackage = (input: CreatePackageInput) =>
    runAction(async () => {
      const token = await withToken()
      const created = await api.createPackage(token, input)
      setPackages(prev => [...prev, created])
    })

  const handleUpdatePackage = (id: string, input: UpdatePackageInput) =>
    runAction(async () => {
      const token = await withToken()
      const updated = await api.updatePackage(token, id, input)
      setPackages(prev => prev.map(p => (p.id === id ? updated : p)))
    })

  const handleDeletePackage = (id: string) =>
    runAction(async () => {
      const token = await withToken()
      await api.deletePackage(token, id)
      setPackages(prev => prev.filter(p => p.id !== id))
    })

  /** เจ้าของร้านลากจัดลำดับแพ็กเกจในหน้าจัดการแพ็กเกจ — อัปเดตหน้าจอทันที แล้วค่อยบันทึก */
  const handleReorderPackages = async (ids: string[]) => {
    const prevPackages = packages
    const byId = new Map(prevPackages.map(p => [p.id, p]))
    setPackages(ids.map(id => byId.get(id)).filter((p): p is Package => !!p))
    try {
      setActionError(null)
      const token = await withToken()
      const reordered = await api.reorderPackages(token, ids)
      setPackages(reordered)
    } catch (err) {
      setPackages(prevPackages)
      setActionError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  /**
   * role จริงต้องมาจาก backendUser.role (DB) ไม่ใช่ claim จาก Auth0 ตรงๆ — เพราะ owner จัดการ role ของคนอื่นเองได้
   * ผ่านหน้า "สิทธิ์การเข้าถึง" แล้ว (เช่น เลื่อนคนที่ login ด้วย Google ให้เป็น owner) ถ้ายังอ่านจาก claim อย่างเดียว
   * คนที่เพิ่งถูกเลื่อนจะยังเข้าหน้า owner ไม่ได้ทั้งที่ backend ยอมให้เรียก API แบบ owner แล้ว
   * ใช้ claim (roleFromAuth0User) เป็นแค่ fallback ช่วงก่อน backendUser โหลดเสร็จเท่านั้น (เสี้ยววินาทีแรกหลัง login)
   */
  const role: AppRole = backendUser
    ? backendUser.role === 'OWNER'
      ? 'owner'
      : 'customer'
    : roleFromAuth0User(auth0User as Record<string, unknown> | undefined)
  /** โปรไฟล์ยังไม่ครบ (ชื่อ/นามสกุล/เบอร์โทร) — เช็คทุกครั้งที่ login ไม่ใช่แค่ครั้งแรก เผื่อกรอกไม่ครบหรือ Google ไม่มีนามสกุลให้ */
  const needsProfile =
    isAuthenticated &&
    role === 'customer' &&
    backendUser !== null &&
    (!backendUser.name || !backendUser.surname || !backendUser.phone)

  const user: UserProfile | null = backendUser
    ? {
        name: backendUser.name,
        surname: backendUser.surname,
        phone: backendUser.phone,
        lineId: backendUser.lineId,
        email: backendUser.email,
        avatar: backendUser.avatar,
      }
    : null

  /** navigate('login') คือปุ่ม "ออกจากระบบ" เดิมทุกจุดในแอป — ผูกเข้ากับ Auth0 logout จริงตรงนี้ที่เดียว */
  const navigate = (s: Screen) => {
    if (s === 'login') {
      logout({ logoutParams: { returnTo: window.location.origin } })
      return
    }
    // เปิดหน้าแจ้งเตือน — freeze cutoff เดิมไว้ให้หน้านั้นโชว์ว่ารายการไหน "ใหม่ตั้งแต่ครั้งก่อน" ระหว่างที่ดูอยู่รอบนี้
    // ส่วนตัวเลขที่กระดิ่ง (notifSeenAt) อัปเดตเป็นตอนนี้ทันที ให้หายจากหน้าอื่นๆ ทันทีที่กดเข้ามาดู
    if (s === 'notifications') {
      setNotifPageSeenAt(notifSeenAt)
      const now = Date.now()
      setNotifSeenAt(now)
      localStorage.setItem(NOTIF_SEEN_KEY, String(now))
    }
    setScreen(s)
  }

  /** หลัง login สำเร็จ (และกรอกโปรไฟล์ครบถ้าเป็นลูกค้า) พาไปหน้าเริ่มต้นตาม role ทันที */
  const effectiveScreen: Screen =
    screen === 'login' && isAuthenticated && !needsProfile
      ? role === 'owner'
        ? 'owner-dashboard'
        : 'home'
      : screen

  // จำนวนแจ้งเตือนใหม่ (ใบจองที่มีความเคลื่อนไหวภายใน 24 ชม.) — โชว์เป็นตัวเลขที่ไอคอนกระดิ่งบน Navbar
  const notifCount = unreadNotificationCount(bookings, notifSeenAt)

  const handleSelectDateTime = (date: string, timeSlot: string) => {
    setBooking(b => ({ ...b, date, timeSlot }))
  }

  const handleSetTables = (n: number) => {
    setBooking(b => ({ ...b, tables: n }))
  }

  const handleSetLocation = (loc: EventLocation) => {
    setBooking(b => ({ ...b, location: loc }))
  }

  const handleSelectPackage = (pkg: Package) => {
    setBooking(b => ({
      ...b,
      packageId: pkg.id,
      packageName: pkg.name,
      packagePrice: pkg.pricePerTable,
      menuLimit: pkg.menuLimit,
      // เปลี่ยนแพ็กเกจ = เริ่มเลือกเมนูใหม่ (ใส่ข้อที่รวมมาให้แล้วอัตโนมัติ)
      selectedMenus: b.packageId === pkg.id ? b.selectedMenus : includedItems(pkg),
    }))
  }

  const handleSetMenus = (menus: MenuItem[]) => {
    setBooking(b => ({ ...b, selectedMenus: menus }))
  }

  const handleUpdateSettings = (patch: Partial<AppSettings>) =>
    runAction(async () => {
      const token = await withToken()
      try {
        const updated = await api.updateSettings(token, patch)
        setSettings(updated)
      } catch (err) {
        // 409 = มีคนแก้ไขค่าตั้งค่าไปแล้วก่อนหน้านี้ (อีกแท็บ/อีกคน) — โหลดค่าล่าสุดจาก backend มาแทนที่ค่าในหน้าจอ
        // แทนที่จะทิ้งข้อความ error ดิบให้ผู้ใช้เห็น (มี version เดิมค้างอยู่ ไม่มีทาง save ซ้ำผ่านได้จนกว่าจะ refresh)
        const message = err instanceof Error ? err.message : ''
        if (/-> 409/.test(message)) {
          const fresh = await api.settings(token)
          setSettings(fresh)
          throw new Error('มีการแก้ไขค่าตั้งค่าจากที่อื่นไปแล้ว ระบบโหลดค่าล่าสุดมาให้แล้ว กรุณาตรวจสอบและบันทึกใหม่อีกครั้ง')
        }
        throw err
      }
    })

  const handleConfirm = () =>
    runAction(async () => {
      // ราคาจริงคำนวณฝั่ง backend เสมอ (จาก Package + Settings ใน DB) กันแก้ raw request ปลอมราคา —
      // ที่นี่ส่งแค่ข้อมูลที่ใช้ระบุ "จองอะไร/ที่ไหน" ไม่ส่งตัวเลขราคาที่คำนวณฝั่ง client ไปเลย
      const token = await withToken()
      const created = await api.createBooking(token, {
        date: booking.date || new Date().toISOString().split('T')[0],
        timeSlot: booking.timeSlot || 'ทั้งวัน',
        tables: booking.tables,
        packageId: booking.packageId ?? '',
        packageName: booking.packageName || 'Standard',
        location: booking.location ? formatFullAddress(booking.location) : 'ไม่ระบุ',
        locationDetail: booking.location ?? undefined,
        menus: booking.selectedMenus.map(m => m.name),
        lineId: user?.lineId || undefined,
      })
      setBookings(prev => [created, ...prev])
      // เพิ่มเข้าคิวรับงานทันที กันตัวเองเผลอเลือกวัน/ช่วงเวลาเดิมซ้ำถ้ากลับไปจองอีกใบ
      setAvailability(prev => [
        { date: created.date, timeSlot: created.timeSlot, tables: created.tables, status: created.status },
        ...prev,
      ])
      setBooking(initialBooking)
    })

  /** แก้ไขใบจอง — แยกปลายทางตาม patch: ลูกค้าแนบสลิป vs เจ้าของร้านเปลี่ยนสถานะ/บันทึกแผนกำลังคน */
  const handleUpdateBooking = (id: string, patch: Partial<Booking>) =>
    runAction(async () => {
      const token = await withToken()
      const updated =
        'paymentSlip' in patch && patch.paymentSlip
          ? await api.uploadPaymentSlip(token, id, patch.paymentSlip)
          : await api.updateBookingAsOwner(token, id, {
              status: patch.status,
              staffAuto: patch.staffAuto,
              staffActual: patch.staffActual,
              staffNote: patch.staffNote,
            })
      setBookings(prev => prev.map(b => (b.id === id ? updated : b)))
      // เปลี่ยนสถานะ (เช่นยกเลิกงาน) กระทบคิวรับงานที่ลูกค้าเห็น — ดึงใหม่ให้ตรงกัน กันวันนั้นค้างว่า "เต็ม" อยู่
      if (patch.status !== undefined) setAvailability(await api.bookingsAvailability(token))
    })

  // กำลังตรวจสอบ session ของ Auth0 (โหลดครั้งแรก / กลับจาก redirect)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">กำลังโหลด...</div>
    )
  }

  // ยังไม่ login
  if (!isAuthenticated) {
    return <Login />
  }

  // โหลดข้อมูลจาก backend ไม่สำเร็จ (เช่น server ไม่ทำงาน, token audience ไม่ตรง)
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-red-500 text-sm">โหลดข้อมูลไม่สำเร็จ: {loadError}</p>
        <button
          onClick={() => setRetryKey(k => k + 1)}
          className="text-sm text-orange-600 hover:text-orange-700 font-medium underline"
        >
          ลองใหม่
        </button>
      </div>
    )
  }

  // กำลังดึงข้อมูล bookings/packages/menus/settings จาก backend หลัง login
  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
    )
  }

  // login ด้วย Google ครั้งแรก — Auth0 ไม่มีเบอร์โทร/Line ID ให้ ขอเพิ่มก่อนเข้าใช้งาน
  if (needsProfile) {
    return (
      <>
        {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
        <CompleteProfile
          name={backendUser?.name || ''}
          surname={backendUser?.surname || ''}
          phone={backendUser?.phone || ''}
          lineId={backendUser?.lineId || ''}
          onComplete={(profile) =>
            runAction(async () => {
              const token = await withToken()
              const updated = await api.updateProfile(token, profile)
              setBackendUser(updated)
              setScreen('home')
            })
          }
        />
      </>
    )
  }

  // Owner screens
  if (OWNER_SCREENS.includes(effectiveScreen)) {
    return (
      <OwnerLayout
        navigate={navigate}
        currentScreen={effectiveScreen}
        user={user}
        bookings={bookings}
        shopName={settings.shopInfo.name}
      >
        {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
        {effectiveScreen === 'owner-dashboard' && (
          <Dashboard bookings={bookings} menus={menus} settings={settings} />
        )}
        {effectiveScreen === 'owner-orders' && (
          <Orders
            bookings={bookings}
            menus={menus}
            settings={settings}
            onUpdateBooking={handleUpdateBooking}
            onFetchBookingsPage={handleFetchBookingsPage}
          />
        )}
        {effectiveScreen === 'owner-calendar' && (
          <CalendarView bookings={bookings} onUpdateBooking={handleUpdateBooking} />
        )}
        {effectiveScreen === 'owner-packages' && (
          <Packages
            packages={packages}
            menus={menus}
            settings={settings}
            onCreatePackage={handleCreatePackage}
            onUpdatePackage={handleUpdatePackage}
            onDeletePackage={handleDeletePackage}
            onReorderPackages={handleReorderPackages}
          />
        )}
        {effectiveScreen === 'owner-menus' && (
          <Menus
            menus={menus}
            packages={packages}
            settings={settings}
            onSaveMenu={handleSaveMenu}
            onDeleteMenu={handleDeleteMenu}
            onUploadImage={handleUploadImage}
          />
        )}
        {effectiveScreen === 'owner-documents' && (
          <Documents bookings={bookings} menus={menus} settings={settings} />
        )}
        {effectiveScreen === 'owner-reports' && (
          <Reports bookings={bookings} menus={menus} settings={settings} />
        )}
        {effectiveScreen === 'owner-users' && (
          <UserRoles
            onSearchUser={handleSearchUsers}
            onSetRole={handleSetUserRole}
            onListOwners={handleListOwners}
            currentAuth0Sub={backendUser?.auth0Sub}
          />
        )}
        {effectiveScreen === 'owner-settings' && (
          <Settings settings={settings} onUpdateSettings={handleUpdateSettings} onUploadImage={handleUploadImage} />
        )}
      </OwnerLayout>
    )
  }

  // Customer screens
  return (
    <>
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {/* เจ้าของร้านกำลังดูมุมมองลูกค้าอยู่ (กดปุ่ม "มุมมองลูกค้า" ใน OwnerLayout) — มีทางกลับเสมอ ไม่ว่าจะอยู่หน้าไหน */}
      {role === 'owner' && (
        <button
          onClick={() => navigate('owner-dashboard')}
          className="fixed top-3 right-4 sm:right-6 lg:right-8 z-[60] flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white px-3 py-2 rounded-xl shadow-lg text-sm font-medium transition-colors"
        >
          <LayoutDashboard size={16} />
          กลับสู่แดชบอร์ด
        </button>
      )}
      {effectiveScreen === 'home' && (
        <Home navigate={navigate} user={user} notifCount={notifCount} shopName={settings.shopInfo.name} />
      )}
      {effectiveScreen === 'booking-calendar' && (
        <BookingCalendar
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          shopName={settings.shopInfo.name}
          bookings={availability}
          onSelectDateTime={handleSelectDateTime}
        />
      )}
      {effectiveScreen === 'select-table' && (
        <SelectTable
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          shopName={settings.shopInfo.name}
          tables={booking.tables}
          onSetTables={handleSetTables}
          date={booking.date}
          timeSlot={booking.timeSlot}
          deliveryFee={settings.deliveryFee}
          freeDeliveryMinTables={settings.freeDeliveryMinTables}
        />
      )}
      {effectiveScreen === 'select-location' && (
        <SelectLocation
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          shopName={settings.shopInfo.name}
          tables={booking.tables}
          location={booking.location}
          onSetLocation={handleSetLocation}
          deliveryFee={settings.deliveryFee}
          freeDeliveryMinTables={settings.freeDeliveryMinTables}
          shopLocation={settings.shopLocation}
          fuelCostPerKm={settings.fuelCostPerKm}
        />
      )}
      {effectiveScreen === 'select-package' && (
        <SelectPackage
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          shopName={settings.shopInfo.name}
          packages={packages}
          tables={booking.tables}
          selectedPackageId={booking.packageId}
          onSelectPackage={handleSelectPackage}
        />
      )}
      {effectiveScreen === 'select-menu' && (
        <SelectMenu
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          shopName={settings.shopInfo.name}
          packages={packages}
          packageId={booking.packageId}
          selectedMenus={booking.selectedMenus}
          onSetMenus={handleSetMenus}
        />
      )}
      {effectiveScreen === 'cart' && (
        <Cart
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          shopName={settings.shopInfo.name}
          isOwnerPreview={role === 'owner'}
          packages={packages}
          booking={booking}
          onConfirm={handleConfirm}
          deliveryFee={settings.deliveryFee}
          freeDeliveryMinTables={settings.freeDeliveryMinTables}
          fuelCostPerKm={settings.fuelCostPerKm}
        />
      )}
      {effectiveScreen === 'history' && (
        <BookingHistory
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          bookings={bookings}
          onUpdateBooking={handleUpdateBooking}
          onUploadImage={handleUploadImage}
          settings={settings}
        />
      )}
      {effectiveScreen === 'notifications' && (
        <Notifications
          navigate={navigate}
          user={user}
          notifCount={notifCount}
          bookings={bookings}
          shopName={settings.shopInfo.name}
          notifSeenAt={notifPageSeenAt}
        />
      )}
    </>
  )
}
