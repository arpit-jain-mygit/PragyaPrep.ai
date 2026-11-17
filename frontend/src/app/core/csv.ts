/**
 * Rows of text as a CSV file's content. Quotes, commas and line breaks are handled, and a cell that begins with
 * = + - @ gets a leading apostrophe so a spreadsheet never runs it as a formula (names and emails are typed by people).
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined): string => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
