/**
 * Verifies that uploadCaseFile persists caseMeta onto PersonalFile when
 * intake-style case fields are provided.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PersonalFilesService } from './personal-files.service';

type PrismaFileMock = {
  id: string;
  userId: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: null;
  serviceId: null;
  cityId: null;
  courtName: null;
  courtType: null;
  attachedTicketId: null;
  storageKey: string;
  originalName: string;
  caseMeta: Record<string, string> | null;
};

function makeService() {
  const createdFile: PrismaFileMock = {
    id: 'file-1',
    userId: 'user-1',
    displayName: 'test.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    createdAt: new Date('2026-06-21T00:00:00Z'),
    deletedAt: null,
    serviceId: null,
    cityId: null,
    courtName: null,
    courtType: null,
    attachedTicketId: null,
    storageKey: 'user_user-1/2026/06/abc_test.pdf',
    originalName: 'test.pdf',
    caseMeta: null,
  };

  const updatedFile: PrismaFileMock = { ...createdFile };

  // Capture the update data so the test can inspect it.
  const updateSpy = jest.fn(async (args: { where: unknown; data: unknown }) => {
    const data = args.data as Partial<PrismaFileMock>;
    Object.assign(updatedFile, data);
    return updatedFile;
  });

  const prisma = {
    personalFile: {
      create: jest.fn(async () => createdFile),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      update: updateSpy,
    },
    userStorageUsage: {
      upsert: jest.fn(async () => ({
        userId: 'user-1',
        bytesUsed: BigInt(0),
        fileCount: 0,
        updatedAt: new Date(),
      })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        personalFile: { create: prisma.personalFile.create },
        userStorageUsage: { upsert: prisma.userStorageUsage.upsert },
      }),
    ),
  } as unknown as Parameters<
    typeof PersonalFilesService.prototype.uploadCaseFile
  >[0];

  const storage = {
    put: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };

  const auditLogs = {
    create: jest.fn(async () => undefined),
  };

  const service = new PersonalFilesService(
    prisma as never,
    storage as never,
    auditLogs as never,
  );

  return { service, updateSpy, updatedFile };
}

describe('PersonalFilesService.uploadCaseFile — caseMeta persistence', () => {
  // PDF magic bytes (%PDF-) so sniffAllowedType returns { mime: 'application/pdf' }.
  const PDF_BUF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const FILE = {
    buffer: PDF_BUF,
    originalName: 'test.pdf',
    declaredMime: 'application/pdf',
  };

  it('persists caseMeta when intake-style case fields are provided', async () => {
    const { service, updateSpy } = makeService();

    await service.uploadCaseFile('user-1', null, FILE, {
      serviceId: 'svc_judicial_case_files',
      cityId: 'city-1',
      caseNo: '1234/2024',
      caseYear: '2024',
      caseTitle: 'Ahmed vs State',
      courtLevel: 'High Court',
      caseType: 'Civil Revision',
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updateData = (updateSpy.mock.calls[0] as [{ data: unknown }])[0]
      .data as {
      caseMeta: Record<string, string> | null;
    };
    expect(updateData.caseMeta).toEqual({
      caseNo: '1234/2024',
      caseYear: '2024',
      caseTitle: 'Ahmed vs State',
      courtLevel: 'High Court',
      caseType: 'Civil Revision',
    });
  });

  it('omits caseMeta from the update when no case fields are provided', async () => {
    const { service, updateSpy } = makeService();

    await service.uploadCaseFile('user-1', null, FILE, {
      serviceId: 'svc_judicial_case_files',
      cityId: 'city-1',
    });

    // caseMeta must NOT be present in the update data (null is not assignable
    // to Prisma's NullableJson — we omit it so the column stays at DB default).
    const updateData = (updateSpy.mock.calls[0] as [{ data: unknown }])[0]
      .data as Record<string, unknown>;
    expect('caseMeta' in updateData).toBe(false);
  });

  it('omits falsy case fields from caseMeta', async () => {
    const { service, updateSpy } = makeService();

    await service.uploadCaseFile('user-1', null, FILE, {
      serviceId: 'svc_judicial_case_files',
      cityId: 'city-1',
      caseNo: '999/2023',
      // caseYear, caseTitle, courtLevel, caseType intentionally omitted
    });

    const updateData = (updateSpy.mock.calls[0] as [{ data: unknown }])[0]
      .data as {
      caseMeta: Record<string, string> | null;
    };
    expect(updateData.caseMeta).toEqual({ caseNo: '999/2023' });
  });
});
