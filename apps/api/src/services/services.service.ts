import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { ServiceType } from '@prisma/client';

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

const DEFAULT_SERVICE_CATALOG = [
  {
    id: 'svc_judicial_lower_court',
    name: 'Lower Court Paralegal Service',
    type: ServiceType.JUDICIAL,
    category: 'Judicial',
    courtLevel: 'Lower Court',
    description: 'Judicial service for lower court matters.',
    courts: ['Sessions Court', 'Magisterial Court', 'Civil Court', 'Family Court'],
  },
  {
    id: 'svc_judicial_special_court',
    name: 'Special Court Paralegal Service',
    type: ServiceType.JUDICIAL,
    category: 'Judicial',
    courtLevel: 'Special Court',
    description: 'Judicial service for special and tribunal matters.',
    courts: [
      'Accountability Courts',
      'Anti-Corruption Courts (Provincial)',
      'Anti-Terrorism Courts',
      'Anti-Dumping Appellate Tribunal no bail',
      'Appellate Tribunals Inland Revenue',
      'Banking Courts',
      'Banking Muhtasib',
      'Board of Revenue',
      'Child Protection Court',
      'Commercial Courts',
      'Competition Appellate Tribunal',
      'Consumer Courts',
      'Customs Appellate Tribunals',
      'Drug Courts',
      'Environmental Protection Tribunals',
      'Election Tribunal',
      'Federal Insurance Tribunal',
      'Federal Ombudsman',
      'Federal Service Tribunal',
      'Federal tax ombudsman',
      'Foreign Exchange Regulation Appellate Boards',
      'Income Tax Appellate Tribunal',
      'Insurance Appellate Tribunal',
      'Intellectual Property Tribunal',
      'Labor Appellate Tribunals',
      'Labor Courts',
      'Lahore Development Authority Tribunal',
      'National industrial relations commission (NIRC)',
      'Pakistan Maritime Carriage Appellate Tribunal',
      'Provincial Ombudsman',
      'Provincial Service Tribunals',
      'Special Courts (Central)',
      'Special Courts (Control of Narcotic Substances)',
      'Special Courts (Customs, Taxation Anti-Smuggling)',
      'Special Courts (Offences in Banks)',
      'Special Courts of Public Property (Removal of Encroachment)',
    ],
  },
  {
    id: 'svc_judicial_high_court',
    name: 'High Court Paralegal Service',
    type: ServiceType.JUDICIAL,
    category: 'Judicial',
    courtLevel: 'High Court',
    description: 'Judicial service for high court matters.',
    courts: [
      'Lahore High Court',
      'Sindh High Court',
      'Peshawar High Court',
      'Balochistan High Court',
      'Gilgit High Court',
      'Azad Kashmir High Court',
      'Islamabad High Court',
    ],
  },
  {
    id: 'svc_judicial_federal_shariat',
    name: 'Federal Shariat Court Paralegal Service',
    type: ServiceType.JUDICIAL,
    category: 'Judicial',
    courtLevel: 'Federal Shariat Court',
    description: 'Judicial service for federal shariat court matters.',
    courts: ['Islamabad Court'],
  },
  {
    id: 'svc_judicial_supreme_court',
    name: 'Superme Court Paralegal Service',
    type: ServiceType.JUDICIAL,
    category: 'Judicial',
    courtLevel: 'Supreme Court',
    description: 'Judicial service for supreme court matters.',
    courts: ['Supreme Court'],
  },
  {
    id: 'svc_non_judicial_registry_deed',
    name: 'Regitry/Deed Paralegal Service',
    type: ServiceType.NON_JUDICIAL,
    category: 'Non Judicial',
    courtLevel: null,
    description: 'Non-judicial registry and deed service.',
    courts: [],
  },
  {
    id: 'svc_non_judicial_fir',
    name: 'FIR',
    type: ServiceType.NON_JUDICIAL,
    category: 'Non Judicial',
    courtLevel: null,
    description: 'Non-judicial FIR service.',
    courts: [],
  },
] as const;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly catalogById = new Map<string, (typeof DEFAULT_SERVICE_CATALOG)[number]>(
    DEFAULT_SERVICE_CATALOG.map((service) => [service.id, service]),
  );

  private async ensureDefaultCatalogSeeded() {
    await Promise.all(
      DEFAULT_SERVICE_CATALOG.map((service) =>
        this.prisma.service.upsert({
          where: { id: service.id },
          update: {
            name: service.name,
            type: service.type,
            category: service.category,
            courtLevel: service.courtLevel,
            description: service.description,
            isActive: true,
          },
          create: {
            id: service.id,
            name: service.name,
            type: service.type,
            category: service.category,
            courtLevel: service.courtLevel,
            description: service.description,
            isActive: true,
          },
        }),
      ),
    );
  }

  async findAll(type?: string) {
    await this.ensureDefaultCatalogSeeded();
    const services = await this.prisma.service.findMany({
      where: type
        ? {
            type: type === 'judicial' ? 'JUDICIAL' : 'NON_JUDICIAL',
            isActive: true,
          }
        : { isActive: true },
      orderBy: { name: 'asc' },
    });

    return services.map((service) => ({
      ...service,
      courts: this.catalogById.get(service.id)?.courts ?? [],
    }));
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
