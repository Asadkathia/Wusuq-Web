import { Module } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';

@Module({
  providers: [RolesPermissionsService],
  exports: [RolesPermissionsService],
})
export class RolesPermissionsModule {}
