import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * Body for `DELETE /personal-files/bulk`. Mirrors the single-file soft
 * delete's ownership semantics — every id is checked against the caller's
 * own (non-deleted) files server-side; ids that aren't owned are silently
 * skipped rather than causing the whole request to fail.
 */
export class BulkDeletePersonalFilesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}
