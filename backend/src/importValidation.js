// Pure validation rules for the Excel import. No database and no libraries here,
// so the rules are easy to read, test and change.

export const REQUIRED = ['full_name', 'email', 'department', 'position'];
export const COLUMNS = [...REQUIRED, 'salary', 'hire_date'];

const MAX_LEN = { full_name: 120, email: 160, department: 80, position: 80 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// "Full Name " -> "full_name"
export function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// Excel cells can hold formulas, rich text or hyperlinks (typical for email cells).
// Reduce them all to a plain value.
export function plainValue(v) {
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return plainValue(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return plainValue(v.text);
    if ('error' in v) return String(v.error);
  }
  return v;
}

const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

function toIsoDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    const real = dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
    return real ? v.trim() : null;   // rejects 2024-02-31
  }
  return null;
}

// Checks ONE row. Returns the cleaned data and a list of error messages.
export function validateRecord(raw) {
  const errors = [];
  const data = {};

  // 1) Required fields + text type + length
  for (const field of REQUIRED) {
    const v = raw[field];
    if (isBlank(v)) { errors.push(`${field} is required`); continue; }
    if (typeof v !== 'string') { errors.push(`${field} must be text`); continue; }
    const t = v.trim();
    if (t.length > MAX_LEN[field]) {
      errors.push(`${field} must be ${MAX_LEN[field]} characters or fewer`);
      continue;
    }
    data[field] = t;
  }

  // 2) Email format
  if (data.email !== undefined) {
    if (!EMAIL_RE.test(data.email)) { errors.push('email is not valid'); delete data.email; }
    else data.email = data.email.toLowerCase();
  }

  // 3) Optional salary: number, not negative
  data.salary = null;
  if (!isBlank(raw.salary)) {
    const s = typeof raw.salary === 'string' ? raw.salary.trim() : raw.salary;
    const n = typeof s === 'number' ? s
      : (typeof s === 'string' && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);
    if (!Number.isFinite(n)) errors.push('salary must be a number');
    else if (n < 0) errors.push('salary cannot be negative');
    else if (n >= 1e10) errors.push('salary is too large');
    else data.salary = Math.round(n * 100) / 100;
  }

  // 4) Optional hire date: a real calendar date
  data.hire_date = null;
  if (!isBlank(raw.hire_date)) {
    const d = toIsoDate(raw.hire_date);
    if (!d) errors.push('hire_date must be a valid date (YYYY-MM-DD)');
    else data.hire_date = d;
  }

  return { errors, data };
}

const shown = (v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

// Checks all rows. `existingEmails` is a Set of lower-case emails already in the database.
// Status: new | replace | skip | invalid
export function validateRows(records, existingEmails, replaceExisting = true) {
  const firstSeen = new Map();   // email -> row number, to catch duplicates inside the file
  return records.map(({ row, raw }) => {
    const { errors, data } = validateRecord(raw);
    const notes = [];
    let status = 'invalid';

    if (errors.length === 0) {
      if (firstSeen.has(data.email)) {
        errors.push(`Duplicate email in file (first used on row ${firstSeen.get(data.email)})`);
      } else {
        firstSeen.set(data.email, row);
        if (existingEmails.has(data.email)) {
          if (replaceExisting) {
            status = 'replace';
            notes.push('An employee with this email already exists and will be replaced');
          } else {
            status = 'skip';
            notes.push('An employee with this email already exists; this row will be skipped');
          }
        } else {
          status = 'new';
        }
      }
    }
    return {
      row, status, errors, notes, data,
      input: { full_name: shown(raw.full_name), email: shown(raw.email) },
    };
  });
}

export function summarize(rows) {
  const s = { total: rows.length, new: 0, replace: 0, skip: 0, invalid: 0 };
  for (const r of rows) s[r.status] += 1;
  return s;
}
