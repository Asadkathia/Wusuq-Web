/**
 * Guided-tour progress — one row per (user, tour).
 *
 * Every method takes the caller's user id from the controller (JWT subject);
 * there is no path that reads or writes another user's rows. Tour ids and
 * versions are validated against the shared registry so a client cannot
 * create junk rows or mark a newer tour version as seen.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { expectedTourVersion, isKnownTourId } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveTourProgressDto } from './dto/save-tour-progress.dto';

const PUBLIC_FIELDS = { tourId: true, version: true, status: true } as const;

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.userTourProgress.findMany({
      where: { userId },
      select: PUBLIC_FIELDS,
    });
  }

  async save(userId: string, tourId: string, dto: SaveTourProgressDto) {
    this.assertKnown(tourId);
    if (dto.version !== expectedTourVersion(tourId)) {
      throw new BadRequestException(
        `Tour ${tourId} is not at version ${dto.version}`,
      );
    }
    return this.prisma.userTourProgress.upsert({
      where: { userId_tourId: { userId, tourId } },
      create: { userId, tourId, version: dto.version, status: dto.status },
      update: { version: dto.version, status: dto.status },
      select: PUBLIC_FIELDS,
    });
  }

  async remove(userId: string, tourId: string) {
    this.assertKnown(tourId);
    const { count } = await this.prisma.userTourProgress.deleteMany({
      where: { userId, tourId },
    });
    return { deleted: count > 0 };
  }

  private assertKnown(tourId: string) {
    if (!isKnownTourId(tourId))
      throw new BadRequestException(`Unknown tour: ${tourId}`);
  }
}
