export type PersonalFileDto = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
  serviceId: string | null;
  cityId: string | null;
  courtName: string | null;
  courtType: string | null;
  attachedTicketId: string | null;
  /** From `caseMeta.caseTitle` (D1: case-files group header). Null when the
   *  upload didn't carry intake-style case metadata. */
  caseTitle: string | null;
  /** From `caseMeta.judgeName` (D1: case-files group header). */
  judgeName: string | null;
};

/** Best-effort read of a string key off the JSON `caseMeta` column — the
 * column is untyped Json, so this never throws on an unexpected shape. */
function readCaseMetaString(caseMeta: unknown, key: string): string | null {
  if (caseMeta && typeof caseMeta === 'object') {
    const v = (caseMeta as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

export function toPersonalFileDto(row: {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: Date | null;
  serviceId?: string | null;
  cityId?: string | null;
  courtName?: string | null;
  courtType?: string | null;
  attachedTicketId?: string | null;
  caseMeta?: unknown;
}): PersonalFileDto {
  return {
    id: row.id,
    displayName: row.displayName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    serviceId: row.serviceId ?? null,
    cityId: row.cityId ?? null,
    courtName: row.courtName ?? null,
    courtType: row.courtType ?? null,
    attachedTicketId: row.attachedTicketId ?? null,
    caseTitle: readCaseMetaString(row.caseMeta, 'caseTitle'),
    judgeName: readCaseMetaString(row.caseMeta, 'judgeName'),
  };
}
