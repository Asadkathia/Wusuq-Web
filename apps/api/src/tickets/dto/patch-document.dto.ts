import { IsBoolean } from 'class-validator';

export class PatchDocumentDto {
  @IsBoolean()
  visibleToConsumer!: boolean;
}
