import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { BookingsModule } from './bookings/bookings.module'
import { GeoModule } from './geo/geo.module'
import { MenusModule } from './menus/menus.module'
import { PackagesModule } from './packages/packages.module'
import { PrismaModule } from './prisma/prisma.module'
import { RealtimeModule } from './realtime/realtime.module'
import { SettingsModule } from './settings/settings.module'
import { UploadsModule } from './uploads/uploads.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // default: 60 request/นาที/IP — route ที่เสี่ยง spam กว่านี้ (จอง, sync profile) ใส่ @Throttle() คุมเข้มกว่านี้เอง
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    BookingsModule,
    GeoModule,
    PackagesModule,
    MenusModule,
    SettingsModule,
    UploadsModule,
    RealtimeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
