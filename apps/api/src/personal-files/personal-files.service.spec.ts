import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PersonalFilesService } from './personal-files.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FILE_STORAGE_PROVIDER } from '../file-storage/file-storage.module';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';

type AnyMock = jest.Mock<any>;

function makePrisma() {
  const tx = {
    personalFile: {
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({
        id: 'f1',
        ...a.data,
        createdAt: new Date(),
        deletedAt: null,
      })) as AnyMock,
      findUnique: jest.fn() as AnyMock,
      delete: jest.fn() as AnyMock,
    },
    userStorageUsage: {
      upsert: jest.fn() as AnyMock,
      update: jest.fn() as AnyMock,
    },
  };
  return {
    personalFile: {
      findFirst: jest.fn() as AnyMock,
      findMany: jest.fn() as AnyMock,
      create: jest.fn() as AnyMock,
      update: jest.fn() as AnyMock,
      delete: jest.fn() as AnyMock,
      findUnique: jest.fn() as AnyMock,
    },
    userStorageUsage: {
      upsert: jest.fn() as AnyMock,
      update: jest.fn() as AnyMock,
    },
    $transaction: jest.fn(async (fn: (txArg: typeof tx) => unknown) =>
      typeof fn === 'function' ? fn(tx) : null,
    ) as AnyMock,
    _tx: tx,
  };
}

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n', 'utf-8'),
  Buffer.alloc(64, 0),
]);

describe('PersonalFilesService', () => {
  let service: PersonalFilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: {
    put: AnyMock;
    getSignedDownloadUrl: AnyMock;
    delete: AnyMock;
    exists: AnyMock;
  };
  let audit: { create: AnyMock };

  beforeEach(async () => {
    prisma = makePrisma();
    storage = {
      put: jest.fn() as AnyMock,
      getSignedDownloadUrl: (jest.fn() as AnyMock).mockResolvedValue('/signed'),
      delete: (jest.fn() as AnyMock).mockResolvedValue(undefined),
      exists: jest.fn() as AnyMock,
    };
    audit = { create: jest.fn() as AnyMock };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalFilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: audit },
        { provide: FILE_STORAGE_PROVIDER, useValue: storage },
        {
          provide: NotificationDispatcher,
          useValue: { caseFileUploaded: jest.fn(async () => undefined) },
        },
      ],
    }).compile();
    service = m.get(PersonalFilesService);
  });

  describe('upload', () => {
    it('rejects oversize files', async () => {
      const big = Buffer.alloc(11 * 1024 * 1024);
      await expect(
        service.upload('u1', null, {
          buffer: big,
          originalName: 'x.pdf',
          declaredMime: 'application/pdf',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid type', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({
        bytesUsed: BigInt(0),
        fileCount: 0,
      });
      const txt = Buffer.from('not a pdf');
      await expect(
        service.upload('u1', null, {
          buffer: txt,
          originalName: 'x.pdf',
          declaredMime: 'application/pdf',
        }),
      ).rejects.toMatchObject({ response: { error: 'invalid_type' } });
    });

    it('rejects when quota would be exceeded', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({
        bytesUsed: BigInt(500 * 1024 * 1024 - 32),
        fileCount: 100,
      });
      await expect(
        service.upload('u1', null, {
          buffer: PDF,
          originalName: 'x.pdf',
          declaredMime: 'application/pdf',
        }),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('writes to storage and audit-logs on success', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({
        bytesUsed: BigInt(0),
        fileCount: 0,
      });
      prisma.personalFile.findMany.mockResolvedValue([]);
      const r = await service.upload('u1', 'a@b', {
        buffer: PDF,
        originalName: 'order.pdf',
        declaredMime: 'application/pdf',
      });
      expect(storage.put).toHaveBeenCalled();
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERSONAL_FILE_UPLOAD' }),
      );
      expect(r.displayName).toBe('order.pdf');
      expect(r.mimeType).toBe('application/pdf');
    });

    it('resolves filename collisions with " (2)" suffix', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({
        bytesUsed: BigInt(0),
        fileCount: 0,
      });
      prisma.personalFile.findMany.mockResolvedValue([
        { displayName: 'order.pdf' },
      ]);
      const r = await service.upload('u1', null, {
        buffer: PDF,
        originalName: 'order.pdf',
        declaredMime: 'application/pdf',
      });
      expect(r.displayName).toBe('order (2).pdf');
    });

    it('rolls back the storage write on DB transaction failure', async () => {
      prisma.userStorageUsage.upsert.mockResolvedValue({
        bytesUsed: BigInt(0),
        fileCount: 0,
      });
      prisma.personalFile.findMany.mockResolvedValue([]);
      prisma.$transaction.mockRejectedValue(new Error('db down'));
      await expect(
        service.upload('u1', null, {
          buffer: PDF,
          originalName: 'x.pdf',
          declaredMime: 'application/pdf',
        }),
      ).rejects.toThrow('db down');
      expect(storage.delete).toHaveBeenCalled();
    });
  });

  describe('signDownload', () => {
    it('refuses files owned by other users (404, not 403)', async () => {
      prisma.personalFile.findFirst.mockResolvedValue(null);
      await expect(service.signDownload('u1', null, 'f1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns signed URL and audit-logs on success', async () => {
      prisma.personalFile.findFirst.mockResolvedValue({
        id: 'f1',
        userId: 'u1',
        storageKey: 'k',
        displayName: 'order.pdf',
      });
      const url = await service.signDownload('u1', null, 'f1');
      expect(url).toBe('/signed');
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERSONAL_FILE_DOWNLOAD' }),
      );
    });
  });

  describe('softDelete', () => {
    it('refuses already-deleted files', async () => {
      prisma.personalFile.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('u1', null, 'f1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets deletedAt and audit-logs', async () => {
      prisma.personalFile.findFirst.mockResolvedValue({
        id: 'f1',
        userId: 'u1',
        displayName: 'x.pdf',
        sizeBytes: 1,
      });
      await service.softDelete('u1', null, 'f1');
      expect(prisma.personalFile.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERSONAL_FILE_SOFT_DELETE' }),
      );
    });
  });

  describe('restore', () => {
    it('refuses outside the 30-day window', async () => {
      prisma.personalFile.findFirst.mockResolvedValue({
        id: 'f1',
        userId: 'u1',
        displayName: 'x.pdf',
        deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      await expect(service.restore('u1', null, 'f1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('restores within the window', async () => {
      const file = {
        id: 'f1',
        userId: 'u1',
        displayName: 'x.pdf',
        deletedAt: new Date(),
        createdAt: new Date(),
        mimeType: 'application/pdf',
        sizeBytes: 1,
      };
      prisma.personalFile.findFirst.mockResolvedValue(file);
      prisma.personalFile.update.mockResolvedValue({
        ...file,
        deletedAt: null,
      });
      const r = await service.restore('u1', null, 'f1');
      expect(r.deletedAt).toBeNull();
    });
  });
});
