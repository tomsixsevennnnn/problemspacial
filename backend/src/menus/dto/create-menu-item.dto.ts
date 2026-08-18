import { IsBoolean, IsInt, IsOptional, IsString, Matches } from 'class-validator'

export class CreateMenuItemDto {
  @IsString() name!: string
  @IsString() category!: string

  @IsOptional() @IsString() description?: string
  /** ต้องเป็น path จาก POST /uploads/menu-image หรือ '' เพื่อลบรูปออก (ข้อ 3/7 ใน code review) */
  @IsOptional()
  @Matches(/^(\/uploads\/.+)?$/, { message: 'image ต้องเป็น path จาก /uploads/menu-image หรือค่าว่างเท่านั้น' })
  image?: string
  @IsOptional() @IsInt() costPrice?: number
  @IsOptional() @IsBoolean() active?: boolean
}
