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
};

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
  };
}
