import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { pool } from '../db.js';
import {
  COLUMNS, REQUIRED, normalizeHeader, plainValue, validateRows, summarize,
} from '../importValidation.js';

const MAX_ROWS = 1000;
const router = Router();

// Keep the uploaded file in memory (max 2 MB); we never save it to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (max 2 MB)' });
    return res.status(400).json({ error: 'Could not read the upload. Send the file in a field named "file"' });
  });
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

// Excel file -> [{ row: <Excel row number>, raw: { full_name, email, ... } }]
async function readRecords(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw badRequest('Could not read the file. Please upload a valid .xlsx Excel file');
  }
  const sheet = wb.getWorksheet('Candidates') || wb.worksheets[0];
  if (!sheet) throw badRequest('The workbook has no sheets');

  const headers = {};   // column number -> normalised header name
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = normalizeHeader(plainValue(cell.value));
  });
  const missing = REQUIRED.filter((c) => !Object.values(headers).includes(c));
  if (missing.length) throw badRequest(`Missing required column(s): ${missing.join(', ')}`);

  const records = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const raw = {};
    let hasData = false;
    for (const [col, name] of Object.entries(headers)) {
      if (!COLUMNS.includes(name)) continue;            // unknown columns (e.g. case_id) are ignored
      const v = plainValue(sheet.getRow(r).getCell(Number(col)).value);
      raw[name] = v;
      if (!(v == null || (typeof v === 'string' && v.trim() === ''))) hasData = true;
    }
    if (hasData) records.push({ row: r, raw });          // completely empty rows are skipped
  }
  if (records.length === 0) throw badRequest('The sheet has no data rows');
  if (records.length > MAX_ROWS) throw badRequest(`Too many rows (max ${MAX_ROWS})`);
  return records;
}

// POST /api/employees/import?mode=validate|commit&replaceExisting=true|false
router.post('/', receiveFile, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send an .xlsx file in the "file" field' });
    }
    const mode = req.query.mode === 'commit' ? 'commit' : 'validate';
    const replaceExisting = req.query.replaceExisting !== 'false';

    const records = await readRecords(req.file.buffer);

    // Which of these emails already exist in the database? (case-insensitive)
    const emails = records
      .map((r) => (typeof r.raw.email === 'string' ? r.raw.email.trim().toLowerCase() : null))
      .filter(Boolean);
    const found = await pool.query(
      'SELECT lower(email) AS email FROM employees WHERE lower(email) = ANY($1)', [emails]
    );
    const existing = new Set(found.rows.map((r) => r.email));

    const rows = validateRows(records, existing, replaceExisting);
    const summary = summarize(rows);

    if (mode === 'validate') return res.json({ mode, summary, rows });

    // commit: write valid rows inside ONE transaction (all written, or none)
    const client = await pool.connect();
    let created = 0;
    let replaced = 0;
    try {
      await client.query('BEGIN');
      for (const { status, data: d } of rows) {
        if (status === 'new') {
          await client.query(
            `INSERT INTO employees (full_name, email, department, position, salary, hire_date)
             VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, CURRENT_DATE))`,
            [d.full_name, d.email, d.department, d.position, d.salary, d.hire_date]
          );
          created += 1;
        } else if (status === 'replace') {
          // Blank optional cells keep the old value instead of wiping it
          await client.query(
            `UPDATE employees
             SET full_name=$1, email=$2, department=$3, position=$4,
                 salary=COALESCE($5, salary), hire_date=COALESCE($6, hire_date)
             WHERE lower(email) = $2`,
            [d.full_name, d.email, d.department, d.position, d.salary, d.hire_date]
          );
          replaced += 1;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return res.json({
      mode, summary, rows,
      imported: { created, replaced, skipped: summary.invalid + summary.skip },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
});

// GET /api/employees/import/template -> a ready-to-fill Excel file
router.get('/template', async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Candidates');
    ws.columns = [
      { header: 'full_name', key: 'full_name', width: 26 },
      { header: 'email', key: 'email', width: 32 },
      { header: 'department', key: 'department', width: 18 },
      { header: 'position', key: 'position', width: 22 },
      { header: 'salary', key: 'salary', width: 14 },
      { header: 'hire_date', key: 'hire_date', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getColumn('hire_date').numFmt = 'yyyy-mm-dd';
    ws.addRow({
      full_name: 'Jane Doe', email: 'jane.doe@example.com', department: 'Engineering',
      position: 'Developer', salary: 900000, hire_date: new Date(Date.UTC(2024, 0, 15)),
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employees-template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

export default router;
