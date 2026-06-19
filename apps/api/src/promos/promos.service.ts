import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { round2 } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromoDto } from './dto/create-promo.dto';

export interface PromoValidation {
  valid: boolean;
  reason?: string;
  discount: number;
  promoCodeId?: string;
}

@Injectable()
export class PromosService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(args: {
    code: string;
    userId: string;
    flow: string;
    subtotal: number;
    tx?: Prisma.TransactionClient;
  }): Promise<PromoValidation> {
    const db = args.tx ?? this.prisma;
    const code = args.code.trim().toUpperCase();
    const promo = await db.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.active) {
      return { valid: false, reason: 'Invalid or inactive code', discount: 0 };
    }
    const now = new Date();
    if (promo.startsAt && now < promo.startsAt) {
      return { valid: false, reason: 'Code not yet active', discount: 0 };
    }
    if (promo.endsAt && now > promo.endsAt) {
      return { valid: false, reason: 'Code has expired', discount: 0 };
    }
    if (
      promo.serviceScope.length > 0 &&
      !promo.serviceScope.includes(args.flow)
    ) {
      return {
        valid: false,
        reason: 'Code not valid for this service',
        discount: 0,
      };
    }
    if (promo.totalUsageLimit != null) {
      const total = await db.promoRedemption.count({
        where: { promoCodeId: promo.id },
      });
      if (total >= promo.totalUsageLimit) {
        return {
          valid: false,
          reason: 'Code usage limit reached',
          discount: 0,
        };
      }
    }
    if (promo.perUserLimit != null) {
      const mine = await db.promoRedemption.count({
        where: { promoCodeId: promo.id, userId: args.userId },
      });
      if (mine >= promo.perUserLimit) {
        return { valid: false, reason: 'Per-user limit reached', discount: 0 };
      }
    }

    const subtotal = Math.max(0, args.subtotal);
    let discount: number;
    if (promo.type === 'PERCENT') {
      discount = round2((subtotal * Number(promo.value)) / 100);
      if (promo.maxDiscount != null) {
        discount = Math.min(discount, Number(promo.maxDiscount));
      }
    } else {
      discount = Number(promo.value);
    }
    discount = round2(Math.min(discount, subtotal));
    return { valid: true, discount, promoCodeId: promo.id };
  }

  /**
   * Enforces totalUsageLimit / perUserLimit atomically inside a transaction.
   * Acquires a FOR UPDATE row lock on the PromoCode row so concurrent
   * redemptions of the same code serialize and cannot both pass the count check.
   * Throws ConflictException when either limit is exceeded.
   */
  async assertWithinLimits(
    tx: Prisma.TransactionClient,
    promoCodeId: string,
    userId: string,
  ): Promise<void> {
    // Lock the PromoCode row so concurrent redemptions of the same code serialize.
    await tx.$executeRaw`SELECT id FROM "PromoCode" WHERE id = ${promoCodeId} FOR UPDATE`;
    const promo = await tx.promoCode.findUnique({ where: { id: promoCodeId } });
    if (!promo) throw new NotFoundException('Promo code not found');
    if (promo.totalUsageLimit != null) {
      const total = await tx.promoRedemption.count({ where: { promoCodeId } });
      if (total >= promo.totalUsageLimit) {
        throw new ConflictException('Promo code usage limit reached');
      }
    }
    if (promo.perUserLimit != null) {
      const mine = await tx.promoRedemption.count({
        where: { promoCodeId, userId },
      });
      if (mine >= promo.perUserLimit) {
        throw new ConflictException('Promo code per-user limit reached');
      }
    }
  }

  create(dto: CreatePromoDto, actorUserId?: string) {
    return this.prisma.promoCode.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        type: dto.type,
        value: dto.value,
        maxDiscount: dto.maxDiscount ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        totalUsageLimit: dto.totalUsageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        serviceScope: dto.serviceScope ?? [],
        createdByUserId: actorUserId,
      },
    });
  }

  list() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async deactivate(id: string) {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Promo code not found');
    return this.prisma.promoCode.update({
      where: { id },
      data: { active: false },
    });
  }
}
