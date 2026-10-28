import { Module } from '@nestjs/common';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffGuard } from './staff.guard';
import { MerchantAdminController } from './merchant-admin.controller';
import { SupervisionController } from './supervision.controller';

@Module({
  controllers: [StaffAuthController, MerchantAdminController, SupervisionController],
  providers: [StaffAuthService, StaffGuard],
  exports: [StaffAuthService, StaffGuard],
})
export class StaffModule {}
