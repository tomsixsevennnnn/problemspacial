import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator'
import { LocationDetailDto } from './location-detail.dto'

/**
 * totalPrice/pricePerTable/deliveryFee ไม่ใช่ input ของ endpoint นี้โดยเจตนา — backend คำนวณเองเสมอจาก
 * Package.pricePerTable + Settings ปัจจุบันใน pricing.service.ts ห้ามเพิ่มฟิลด์ราคากลับเข้ามาที่นี่
 * (ดูข้อ 1 ใน code review: เดิม client ส่งราคามาตรงๆ แก้ raw request ได้)
 */
export class CreateBookingDto {
  /** รูปแบบ YYYY-MM-DD เท่านั้น — bookings.service.ts เทียบ string นี้ตรงๆ ตอนเช็ควันชนกัน ต้องเป็น format เดียวกันเสมอ */
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date ต้องเป็นรูปแบบ YYYY-MM-DD' }) date!: string
  @IsString() timeSlot!: string

  /** เพดานบนอิงจาก SLOT_CAPACITY ฝั่ง frontend src/availability.ts — ค่านั้นเป็นหน่วย "จำนวนโต๊ะ" อยู่แล้ว (ไม่ใช่ที่นั่ง) ใช้ตรงๆ ไม่ต้องหาร */
  @IsInt() @Min(1) @Max(500) tables!: number

  @IsString() packageId!: string
  @IsString() packageName!: string

  @IsString() location!: string
  @IsOptional() @ValidateNested() @Type(() => LocationDetailDto) locationDetail?: LocationDetailDto

  @IsArray() @IsString({ each: true }) menus!: string[]

  @IsOptional() @IsString() lineId?: string
}
