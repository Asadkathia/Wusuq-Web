import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateElectionDto } from './dto/create-election.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { UpdateElectionDto } from './dto/update-election.dto';

@Injectable()
export class ElectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list() {
    const items = await this.prisma.election.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { candidates: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        electionName: item.name,
        electionYear: item.year,
        electionTenure: item.tenure,
        status: item.status,
        totalCandidates: item._count.candidates,
        createdBy: item.createdBy?.name ?? 'System',
      })),
    };
  }

  async create(
    payload: CreateElectionDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const created = await this.prisma.election.create({
      data: {
        ...payload,
        status: 'ACTIVE',
        createdByUserId: actor?.actorUserId,
      },
    });

    await this.auditLogsService.create({
      action: 'ELECTION_CREATED',
      entity: 'ELECTION',
      entityId: created.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return created;
  }

  async update(
    id: string,
    payload: UpdateElectionDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const updated = await this.prisma.election.update({
      where: { id },
      data: payload,
    });

    await this.auditLogsService.create({
      action: 'ELECTION_UPDATED',
      entity: 'ELECTION',
      entityId: updated.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return updated;
  }

  async remove(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.prisma.election.delete({ where: { id } });

    await this.auditLogsService.create({
      action: 'ELECTION_DELETED',
      entity: 'ELECTION',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return { success: true };
  }

  async addCandidate(
    electionId: string,
    payload: CreateCandidateDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.ensureElectionExists(electionId);

    const created = await this.prisma.candidate.create({
      data: {
        electionId,
        position: payload.position,
        memberName: payload.memberName,
        votes: payload.votes ?? 0,
      },
    });

    await this.auditLogsService.create({
      action: 'ELECTION_CANDIDATE_ADDED',
      entity: 'CANDIDATE',
      entityId: created.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { electionId },
    });

    return created;
  }

  async listCandidates(electionId: string) {
    await this.ensureElectionExists(electionId);

    return {
      items: await this.prisma.candidate.findMany({
        where: { electionId },
        orderBy: [{ position: 'asc' }, { votes: 'desc' }],
      }),
    };
  }

  async updateCandidate(
    electionId: string,
    candidateId: string,
    payload: UpdateCandidateDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.ensureElectionExists(electionId);

    const updated = await this.prisma.candidate.update({
      where: { id: candidateId },
      data: payload,
    });

    await this.auditLogsService.create({
      action: 'ELECTION_CANDIDATE_UPDATED',
      entity: 'CANDIDATE',
      entityId: updated.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { electionId },
    });

    return updated;
  }

  async finalize(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const election = await this.prisma.election.findUnique({ where: { id } });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    const candidates = await this.prisma.candidate.findMany({
      where: { electionId: id },
    });

    const winnersByPosition = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const current = winnersByPosition.get(candidate.position);
      if (!current || candidate.votes > current.votes) {
        winnersByPosition.set(candidate.position, candidate);
      }
    }

    const winnerIds = new Set(
      Array.from(winnersByPosition.values()).map((w) => w.id),
    );

    await this.prisma.$transaction([
      this.prisma.candidate.updateMany({
        where: { electionId: id },
        data: { isWinner: false },
      }),
      this.prisma.candidate.updateMany({
        where: { id: { in: Array.from(winnerIds) } },
        data: { isWinner: true },
      }),
      this.prisma.cabinetSeat.deleteMany({ where: { electionId: id } }),
      ...Array.from(winnersByPosition.values()).map((winner) =>
        this.prisma.cabinetSeat.create({
          data: {
            electionId: id,
            candidateId: winner.id,
            position: winner.position,
            memberName: winner.memberName,
            votes: winner.votes,
            year: election.year,
            tenure: election.tenure,
          },
        }),
      ),
      this.prisma.election.update({
        where: { id },
        data: { status: 'FINALIZED', finalizedAt: new Date() },
      }),
    ]);

    await this.auditLogsService.create({
      action: 'ELECTION_FINALIZED',
      entity: 'ELECTION',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { winners: Array.from(winnerIds) },
    });

    return {
      id,
      finalized: true,
      seats: Array.from(winnersByPosition.values()).length,
    };
  }

  private async ensureElectionExists(id: string) {
    const election = await this.prisma.election.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }
  }
}
