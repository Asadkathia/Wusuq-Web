import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateElectionDto } from './dto/create-election.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { UpdateElectionDto } from './dto/update-election.dto';
import { ElectionsService } from './elections.service';

@Controller('elections')
export class ElectionsController {
  constructor(private readonly electionsService: ElectionsService) {}

  @RequirePermissions('elections.read')
  @Get()
  list() {
    return this.electionsService.list();
  }

  @RequirePermissions('elections.write')
  @Post()
  create(
    @Body() payload: CreateElectionDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.electionsService.create(payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('elections.write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateElectionDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.electionsService.update(id, payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('elections.write')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: JwtUser | undefined) {
    return this.electionsService.remove(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('elections.write')
  @Post(':id/candidates')
  addCandidate(
    @Param('id') id: string,
    @Body() payload: CreateCandidateDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.electionsService.addCandidate(id, payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('elections.read')
  @Get(':id/candidates')
  listCandidates(@Param('id') id: string) {
    return this.electionsService.listCandidates(id);
  }

  @RequirePermissions('elections.write')
  @Patch(':id/candidates/:candidateId')
  updateCandidate(
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
    @Body() payload: UpdateCandidateDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.electionsService.updateCandidate(id, candidateId, payload, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('elections.vote')
  @Post(':id/vote')
  castVote(
    @Param('id') id: string,
    @Body() dto: CastVoteDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!actor?.sub) throw new UnauthorizedException();
    return this.electionsService.castVote(id, dto, actor.sub);
  }

  @RequirePermissions('elections.write')
  @Post(':id/finalize')
  finalize(@Param('id') id: string, @CurrentUser() actor: JwtUser | undefined) {
    return this.electionsService.finalize(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }
}
