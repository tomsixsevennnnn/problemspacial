import { IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator'

export class UpdateSettingsDto {
  /** version ของ settings ที่ client โหลดมาตอนเปิดหน้า — กันสองแท็บ/สองคนแก้ทับกันเงียบๆ (ดู settings.service.ts) */
  @IsInt() expectedVersion!: number

  @IsOptional() @IsString() shopName?: string
  @IsOptional() @IsString() shopNameEn?: string
  @IsOptional() @IsString() shopInitials?: string
  @IsOptional() @IsString() shopAddress?: string
  @IsOptional() @IsString() shopPhone?: string
  @IsOptional() @IsString() shopLine?: string

  @IsOptional() @IsString() bankName?: string
  @IsOptional() @IsString() bankAccountNumber?: string
  @IsOptional() @IsString() bankAccountName?: string
  /** path จาก POST /uploads/promptpay-qr เท่านั้น (ข้อ 3) หรือ '' เพื่อลบรูปออก */
  @IsOptional()
  @Matches(/^(\/uploads\/.+)?$/, { message: 'promptPayQr ต้องเป็น path จาก /uploads/promptpay-qr หรือค่าว่างเท่านั้น' })
  promptPayQr?: string

  @IsOptional() @IsNumber() @Min(0) @Max(1) depositRate?: number
  @IsOptional() @IsInt() @Min(0) deliveryFee?: number
  @IsOptional() @IsInt() @Min(0) freeDeliveryMinTables?: number

  @IsOptional() @IsInt() @Min(0) wageChef?: number
  @IsOptional() @IsInt() @Min(0) wageAssistant?: number
  @IsOptional() @IsInt() @Min(0) wageServerPerTable?: number
  @IsOptional() @IsInt() @Min(0) wageDishwasher?: number

  @IsOptional() @IsArray() @IsString({ each: true }) categoryOrder?: string[]

  @IsOptional() @IsNumber() shopLocationLat?: number
  @IsOptional() @IsNumber() shopLocationLng?: number
  @IsOptional() @IsNumber() @Min(0) fuelCostPerKm?: number
}
