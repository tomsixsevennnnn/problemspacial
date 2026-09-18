import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { PackagesModule } from '../packages/packages.module'
import { UploadsModule } from '../uploads/uploads.module'
import { MenusController } from './menus.controller'
import { MenusService } from './menus.service'

@Module({
  imports: [AuditModule, UploadsModule, PackagesModule],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}
