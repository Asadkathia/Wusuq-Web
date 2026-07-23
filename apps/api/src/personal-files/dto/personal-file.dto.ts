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
};

/** Best-effort read of `caseTitle` off the JSON `caseMeta` column — the
 * column is untyped Json, so this never throws on an unexpected shape. */
function readCaseTitle(caseMeta: unknown): string | null {
  if (caseMeta && typeof caseMeta === 'object') {
    const title = (caseMeta as Record<string, unknown>).caseTitle;
    if (typeof title === 'string' && title.trim()) return title;
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
    caseTitle: readCaseTitle(row.caseMeta),
  };
}
