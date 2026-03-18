import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CabinetService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return {
      items: await this.prisma.cabinetSeat.findMany({
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
        include: {
          election: {
            select: { id: true, name: true, year: true, tenure: true },
          },
        },
      }),
    };
  }
}
