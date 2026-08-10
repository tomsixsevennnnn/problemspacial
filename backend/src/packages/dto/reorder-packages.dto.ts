import { ArrayNotEmpty, IsArray, IsString } from 'class-validator'

/** ลำดับ id ของแพ็กเกจทั้งหมด เรียงตามที่เจ้าของร้านลากจัดไว้ */
export class ReorderPackagesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[]
}
