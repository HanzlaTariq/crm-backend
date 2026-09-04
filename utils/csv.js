// Minimal CSV serializer (RFC 4126-ish) — deliberately dependency-free.
// Wraps a value in quotes if it contains a comma, quote, or newline, and
// escapes embedded quotes by doubling them.
const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// columns: [{ label: 'Name', value: 'name' | (row) => row.foo }]
export const toCsv = (rows, columns) => {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvValue(typeof c.value === 'function' ? c.value(row) : row[c.value]))
      .join(',')
  );
  return [header, ...lines].join('\r\n');
};

export default toCsv;
