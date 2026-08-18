import { Matches } from 'class-validator'

/** ต้องเป็น path จาก POST /uploads/payment-slip เท่านั้น — ห้ามรับ data URL ตรงๆ อีกต่อไป (ข้อ 3 ใน code review) */
export class UpdatePaymentSlipDto {
  @Matches(/^\/uploads\//, { message: 'paymentSlipUrl ต้องเป็น path จาก /uploads/payment-slip เท่านั้น' })
  paymentSlipUrl!: string
}
