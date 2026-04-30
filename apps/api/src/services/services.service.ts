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

// court name → array of cities it serves
const COURT_CITIES: Record<string, string[]> = {
  'Supreme Court': ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Azad Kashmir', 'Gilgit Baltistan'],
  'Islamabad Court': ['Islamabad'],
  'Lahore High Court': ['Lahore', 'Bahawalpur', 'Multan', 'Rawalpindi'],
  'Sindh High Court': ['Karachi', 'Sukkur', 'Hyderabad', 'Larkana'],
  'Peshawar High Court': ['Peshawar', 'Abbottabad', 'Mingora', 'Dera Ismail Khan', 'Bannu'],
  'Balochistan High Court': ['Quetta', 'Sibi', 'Turbat'],
  'Gilgit High Court': ['Gilgit', 'Skardu', 'Diamir'],
  'Azad Kashmir High Court': ['Muzaffarabad', 'Mirpur', 'Rawla', 'Kotli'],
  'Islamabad High Court': ['Islamabad'],
  // Lower courts operate at district level — all major cities
  'Sessions Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Sheikhupura', 'Jhang', 'Okara', 'Kasur', 'Gujrat', 'Sahiwal',
    'Dera Ghazi Khan', 'Vehari', 'Muzaffargarh', 'Mianwali', 'Attock', 'Chakwal', 'Jhelum',
    'Khushab', 'Narowal', 'Toba Tek Singh', 'Peshawar', 'Mardan', 'Abbottabad', 'Kohat',
    'Bannu', 'Dera Ismail Khan', 'Nowshera', 'Charsadda', 'Haripur', 'Swabi', 'Swat',
    'Hyderabad', 'Sukkur', 'Larkana', 'Nawabshah', 'Mirpur Khas', 'Quetta', 'Turbat',
    'Khuzdar', 'Hub', 'Gwadar', 'Islamabad', 'Muzaffarabad', 'Mirpur',
  ],
  'Magisterial Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Peshawar', 'Mardan', 'Abbottabad', 'Hyderabad', 'Sukkur',
    'Quetta', 'Islamabad', 'Muzaffarabad', 'Mirpur',
  ],
  'Civil Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Peshawar', 'Hyderabad', 'Sukkur', 'Quetta', 'Islamabad',
    'Muzaffarabad', 'Mirpur',
  ],
  'Family Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Peshawar', 'Hyderabad', 'Sukkur', 'Quetta', 'Islamabad',
    'Muzaffarabad', 'Mirpur',
  ],
  // Special courts — major cities only
  'Accountability Courts': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi'],
  'Anti-Corruption Courts (Provincial)': ['Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Rawalpindi'],
  'Anti-Terrorism Courts': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi', 'Faisalabad'],
  'Anti-Dumping Appellate Tribunal no bail': ['Islamabad', 'Karachi', 'Lahore'],
  'Appellate Tribunals Inland Revenue': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Banking Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan'],
  'Banking Muhtasib': ['Karachi', 'Lahore', 'Islamabad'],
  'Board of Revenue': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Child Protection Court': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi'],
  'Commercial Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad'],
  'Competition Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Consumer Courts': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi', 'Faisalabad'],
  'Customs Appellate Tribunals': ['Karachi', 'Lahore', 'Islamabad', 'Peshawar', 'Quetta'],
  'Drug Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Peshawar'],
  'Environmental Protection Tribunals': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Election Tribunal': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Federal Insurance Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Federal Ombudsman': ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Federal Service Tribunal': ['Islamabad'],
  'Federal tax ombudsman': ['Islamabad', 'Lahore', 'Karachi'],
  'Foreign Exchange Regulation Appellate Boards': ['Islamabad', 'Karachi', 'Lahore'],
  'Income Tax Appellate Tribunal': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar'],
  'Insurance Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Intellectual Property Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Labor Appellate Tribunals': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Peshawar'],
  'Labor Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta'],
  'Lahore Development Authority Tribunal': ['Lahore'],
  'National industrial relations commission (NIRC)': ['Islamabad', 'Karachi', 'Lahore'],
  'Pakistan Maritime Carriage Appellate Tribunal': ['Karachi'],
  'Provincial Ombudsman': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Provincial Service Tribunals': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Special Courts (Central)': ['Islamabad', 'Karachi', 'Lahore'],
  'Special Courts (Control of Narcotic Substances)': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi'],
  'Special Courts (Customs, Taxation Anti-Smuggling)': ['Karachi', 'Lahore', 'Islamabad'],
  'Special Courts (Offences in Banks)': ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi'],
  'Special Courts of Public Property (Removal of Encroachment)': ['Lahore', 'Karachi', 'Islamabad'],
};

const CASE_TYPES: Record<string, string[]> = {
  svc_judicial_lower_court: [
    // Sessions (Criminal)
    'Bail Application (S)',
    'Criminal Appeal',
    'Criminal Misc.',
    'Criminal Revision',
    'Hadood Cases (Under Hadood Ordinance)',
    'Harrassment',
    'Illegal Dispossession Act',
    'Inquiry (S)',
    'Money Laundering Act',
    'Narcotics Cases (S)',
    'Other Cases (S)',
    'Petitions u/s 22-A/22-B Cr.P.C',
    'Sessions Cases (Murder)',
    'Sessions Cases (Others)',
    'STA Cases',
    'Superdari',
    'Habeas Corpus',
    'Execution Petition (S)',
    // Civil
    'Application for Succession',
    'Civil Appeal',
    'Civil Case of Summary Nature Involving Evidence',
    'Civil Misc.',
    'Civil Revision',
    'Civil Suit',
    'Commercial Cases',
    'Election Petition',
    'Execution Petition (C)',
    'Family Cases',
    'Guardianship Cases',
    'Inquiry (C)',
    'Insolvency Cases',
    'Insurance Cases',
    'Labour Cases',
    'Land Acquisition Cases',
    'Obejcton Petiton',
    'Original Suit',
    'Other Cases (C)',
    'Pauper Cases',
    'Rent Cases',
    'Small Clam & Minor Offence',
    // Magisterial
    'Bail Application (M)',
    'Ist Class Cases',
    'Minor Offences',
    'Narcotics Cases (M)',
    'Other Cases (M)',
    'Section 30 Case',
  ],
  svc_judicial_special_court: [
    'Pre-Arrest Bail Petition',
    'Post-Arrest Bail Petition',
    'Trail File',
    'Miscellaneous',
  ],
  svc_judicial_high_court: [
    'Writ Petition',
    'Criminal Miscellaneous',
    'Civil Revision',
    'Regular First Appeal',
    'First Appeal Against Order',
    'Criminal Appeal',
    'Criminal Revision',
    'Murder Reference',
    'Petition For Special Leave To Appeal',
    'Diary Number',
    'Intra Court Appeal',
    'Review Application',
    'Civil Suit',
    'Labour Appeal',
    'Arbitration Petition',
    'Companies Original',
    'Execution Petition',
    'Human Rights Petition',
    'Election Petition',
    'Suo Moto',
    'Tax Reference',
    'Regular Second Appeal',
    'Second Appeal Against Order',
    'Transfer Application',
    'Civil Original Suit',
    'Execution First Appeal',
    'Petition For Leave To Appear And Defend',
    'Execution Second Appeal',
    'Tax Appeal',
    'Custom Reference',
    'Civil Reference',
    'Cm Independent',
    'Wealth Tax Appeal',
    'Commercial Appeal',
    'Jail Appeal',
    'Capital Sentence Reference',
    'Federal Excise & Reference Application',
    'Sales Tax Reference',
    'Income Tax Reference',
    'Sales Tax Appeal',
    'Income Tax Appeal',
    'Custom Appeal',
    'C.T.R',
    'Objection Case',
    'Office Objection',
    'Criminal Original',
    'Succession Appeal',
    'Objection Petition',
    'Cross Objection',
    'Secp Appeal',
    'Judicial Reference',
    'Ogra Application',
    'Consumer Appeal',
    'Judicial Service Appeal',
    'Auqaf Appeal',
    'Election Appeal',
    'Criminal Original Case',
    'Civil Miscellaneous Appeals',
    'Miscellaneous Petitions',
    'Enforcement Petition',
    'Complaint',
    'Pre-Arrest Bail Petition',
    'Post-Arrest Bail Petition',
  ],
  svc_judicial_federal_shariat: [],
  svc_judicial_supreme_court: [
    'C.A.',
    'C.M.A.',
    'C.M.Appeal.',
    'C.P.',
    'C.R.P.',
    'C.Sh.A.',
    'C.Sh.P.',
    'C.Sh.R.P.',
    'Const.P.',
    'Crl.A.',
    'Crl.M.A.',
    'Crl.M.Appeal.',
    'Crl.O.P.',
    'Crl.P.',
    'Crl.R.P.',
    'Crl.S.M.R.P.',
    'Crl.S.M.Sh.R.P.',
    'Crl.Sh.A.',
    'Crl.Sh.P.',
    'Crl.Sh.R.P.',
    'D.S.A.',
    'H.R.C.',
    'H.R.M.A.',
    'I.C.A.',
    'J.P.',
    'J.Sh.P.',
    'Reference.',
    'S.M.C.',
    'S.M.R.P.',
  ],
  svc_non_judicial_registry_deed: [],
  svc_non_judicial_fir: [],
};

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
    name: 'Supreme Court Paralegal Service',
    type: ServiceType.JUDICIAL,
    category: 'Judicial',
    courtLevel: 'Supreme Court',
    description: 'Judicial service for supreme court matters.',
    courts: ['Supreme Court'],
  },
  {
    id: 'svc_non_judicial_registry_deed',
    name: 'Registry/Deed Paralegal Service',
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
    for (const service of DEFAULT_SERVICE_CATALOG) {
      await this.prisma.service.upsert({
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
      });
    }
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

    return services.map((service) => {
      const catalog = this.catalogById.get(service.id);
      const courts = catalog?.courts ? [...catalog.courts] : [];
      // Only include court→city entries for courts that belong to this service
      const courtCities: Record<string, string[]> = {};
      for (const courtName of courts) {
        courtCities[courtName] = COURT_CITIES[courtName] ?? [];
      }
      return {
        ...service,
        courts,
        courtCities,
        caseTypes: CASE_TYPES[service.id] ?? [],
      };
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
