import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('joins cells with commas and rows with line breaks', () => {
    expect(toCsv([['a', 'b'], [1, 2.5]])).toBe('a,b\r\n1,2.5\r\n');
  });

  it('quotes cells with commas, quotes or line breaks, and doubles quotes', () => {
    expect(toCsv([['Rao, Asha', 'say "hi"', 'two\nlines']])).toBe('"Rao, Asha","say ""hi""","two\nlines"\r\n');
  });

  it('leaves empty and missing values blank', () => {
    expect(toCsv([['a', null, undefined, '']])).toBe('a,,,\r\n');
  });

  it('stops a cell that looks like a formula from running in a spreadsheet', () => {
    expect(toCsv([['=SUM(A1)', '+1 555', '-cmd', '@x']])).toBe("'=SUM(A1),'+1 555,'-cmd,'@x\r\n");
  });

  it('keeps real negative numbers as numbers', () => {
    expect(toCsv([[-2, '-0.25', '-4']])).toBe('-2,-0.25,-4\r\n');
  });
});
