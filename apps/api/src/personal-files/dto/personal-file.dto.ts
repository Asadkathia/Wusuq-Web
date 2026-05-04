export type PersonalFileDto = {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  deletedAt: string | null;
};

export function toPersonalFileDto(row: {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: Date | null;
}): PersonalFileDto {
  return {
    id: row.id,
    displayName: row.displayName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
