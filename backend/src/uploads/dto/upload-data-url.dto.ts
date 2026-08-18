import { IsNotEmpty, IsString } from 'class-validator'

export class UploadDataUrlDto {
  /** data URL (base64) จาก pickImageAsDataUrl ฝั่ง frontend เช่น "data:image/png;base64,...." */
  @IsString() @IsNotEmpty() dataUrl!: string
}
