import { invoiceFilename } from './download-invoice';

describe('invoiceFilename', () => {
  it('names the file by invoice number', () => {
    expect(invoiceFilename('000348')).toBe('invoice-000348.pdf');
  });
});

