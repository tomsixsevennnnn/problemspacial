/**
 * แบ่งหน้าแบบ opt-in — ไม่ส่ง page/limit มาเลย = พฤติกรรมเดิม (คืน array เต็ม) เพื่อไม่ให้หน้าที่ต้องการข้อมูลทั้งชุด
 * (เช่น Dashboard/Reports ที่คำนวณยอดรวมจากทั้งหมด) พัง แค่เปิดทางให้ endpoint ที่รายการยาวขอเป็นหน้าได้
 */
export interface PageArgs {
  skip: number
  take: number
  page: number
  limit: number
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

const DEFAULT_LIMIT = 20

export const pageArgsFor = (page?: number, limit?: number): PageArgs | null => {
  if (page == null && limit == null) return null
  const take = limit ?? DEFAULT_LIMIT
  const currentPage = page ?? 1
  return { skip: (currentPage - 1) * take, take, page: currentPage, limit: take }
}
