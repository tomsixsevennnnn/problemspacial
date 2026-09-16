import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator'

/** ตำแหน่งครอปรูป (%) — คู่กับ imageScale ใช้จัดกรอบตอนแสดงผลจริง (ดู DishTile.tsx) */
export class ImagePositionDto {
  @IsNumber() @Min(0) @Max(100) x!: number
  @IsNumber() @Min(0) @Max(100) y!: number
}

export class CreateMenuItemDto {
  @IsString() name!: string
  @IsString() category!: string

  @IsOptional() @IsString() description?: string
  /** ต้องเป็น path จาก POST /uploads/menu-image หรือ '' เพื่อลบรูปออก (ข้อ 3/7 ใน code review) */
  @IsOptional()
  @Matches(/^(\/uploads\/.+)?$/, { message: 'image ต้องเป็น path จาก /uploads/menu-image หรือค่าว่างเท่านั้น' })
  image?: string
  @IsOptional() @ValidateNested() @Type(() => ImagePositionDto) imagePosition?: ImagePositionDto
  /** ต้องตรงช่วงกับ MIN_SCALE/MAX_SCALE ฝั่ง frontend (src/screens/owner/Menus.tsx) */
  @IsOptional() @IsNumber() @Min(1) @Max(3) imageScale?: number
  @IsOptional() @IsInt() costPrice?: number
  @IsOptional() @IsBoolean() active?: boolean
}
