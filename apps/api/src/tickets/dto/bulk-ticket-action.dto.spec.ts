import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BulkTicketActionDto } from './bulk-ticket-action.dto';

describe('BulkTicketActionDto', () => {
  it('rejects unsupported actions', () => {
    const dto = plainToInstance(BulkTicketActionDto, {
      action: 'assign',
      ticketIds: ['abc'],
    });

    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
