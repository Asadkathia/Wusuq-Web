import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';

const FLOWS = [
  {
    key: 'judicial_case_files',
    label: 'Case Files',
    type: 'judicial',
    route: '/create/judicialService/case-files',
  },
  {
    key: 'judicial_case_information',
    label: 'Case Information',
    type: 'judicial',
    route: '/create/judicialService/case-information',
  },
  {
    key: 'judicial_case_search',
    label: 'Case Search',
    type: 'judicial',
    route: '/create/judicialService/case-search',
  },
  {
    key: 'judicial_case_filing',
    label: 'Case Filling',
    type: 'judicial',
    route: '/create/judicialService/case-filling',
  },
  {
    key: 'judicial_power_of_attorney',
    label: 'Power of Attorney',
    type: 'judicial',
    route: '/create/judicialService/power-of-attorney',
  },
  {
    key: 'non_judicial_copy_of_fir',
    label: 'Copy of FIR',
    type: 'non-judicial',
    route: '/create/NonjudicialService/copy-of-fir',
  },
  {
    key: 'non_judicial_registry_deed',
    label: 'Registry/Deed',
    type: 'non-judicial',
    route: '/create/NonjudicialService/registry',
  },
] as const;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(type?: string) {
    return this.prisma.service.findMany({
      where: type
        ? {
            type: type === 'judicial' ? 'JUDICIAL' : 'NON_JUDICIAL',
            isActive: true,
          }
        : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        name: dto.name,
        type:
          dto.type.toLowerCase() === 'judicial' ? 'JUDICIAL' : 'NON_JUDICIAL',
        category: dto.category,
        courtLevel: dto.courtLevel,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
  }

  flows() {
    return FLOWS;
  }
}
