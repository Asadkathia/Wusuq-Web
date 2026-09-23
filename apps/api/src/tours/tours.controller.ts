/**
 * Self-scoped guided-tour progress routes. Reachable by every authenticated
 * role (no @RequirePermissions — PermissionsGuard passes, JwtAuthGuard still
 * requires a token), and bound to `actor.sub` only: no route accepts a user id.
 */
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { SaveTourProgressDto } from './dto/save-tour-progress.dto';
import { ToursService } from './tours.service';

@Controller('tours/progress')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Get()
  list(@CurrentUser() actor: JwtUser | undefined) {
    return this.toursService.list(actor!.sub);
  }

  @Put(':tourId')
  save(
    @CurrentUser() actor: JwtUser | undefined,
    @Param('tourId') tourId: string,
    @Body() dto: SaveTourProgressDto,
  ) {
    return this.toursService.save(actor!.sub, tourId, dto);
  }

  @Delete(':tourId')
  remove(
    @CurrentUser() actor: JwtUser | undefined,
    @Param('tourId') tourId: string,
  ) {
    return this.toursService.remove(actor!.sub, tourId);
  }
}
