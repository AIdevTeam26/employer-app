import { useState } from 'react';
import { importEmployees } from './api.js';

const STATUS_LABEL = {
  new: 'Ready to add',
  replace: 'Will replace existing',
  skip: 'Skipped (already exists)',
  invalid: 'Error',
};

// Step 1: choose an .xlsx file and click Validate (nothing is saved).
// Step 2: review the report, then click Import to save the valid rows.
export default function ImportPanel({ onImported }) {
  const [file, setFile] = useState(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [report, setReport] = useState(null);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function clearResult() {
    setReport(null); setDone(false); setMessage(''); setError('');
  }

  async function run(mode) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await importEmployees(file, { mode, replaceExisting });
      setReport(result);
      if (mode === 'commit') {
        const { created, replaced, skipped } = result.imported;
        setMessage(`Imported ${created} new, replaced ${replaced}, skipped ${skipped}.`);
        setDone(true);
        onImported?.();
      }
    } catch (e) {
      setReport(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const s = report?.summary;
  const importable = s ? s.new + s.replace : 0;

  return (
    <section className="form import" aria-labelledby="import-title">
      <h2 id="import-title">Import from Excel</h2>
      <p className="muted">
        Columns: full_name, email, department, position (required), salary, hire_date (optional).{' '}
        <a href="/api/employees/import/template">Download template</a>
      </p>

      <div className="import-controls">
        <label>
          Excel file
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => { setFile(e.target.files?.[0] || null); clearResult(); }}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => { setReplaceExisting(e.target.checked); clearResult(); }}
          />
          Replace existing employees that have the same email
        </label>
      </div>

      <div className="actions">
        <button type="button" onClick={() => run('validate')} disabled={!file || busy}>
          Validate file
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => run('commit')}
          disabled={!report || importable === 0 || done || busy}
        >
          Import valid rows
        </button>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {message && <p className="import-done">{message}</p>}

      {s && (
        <>
          <p className="import-summary">
            {`${s.total} rows checked: ${s.new} ready to add, ${s.replace} to replace, ${s.skip} skipped, ${s.invalid} with errors`}
          </p>
          <div className="tablewrap">
            <table aria-label="Validation report">
              <thead>
                <tr><th>Row</th><th>Status</th><th>Employee</th><th>Details</th></tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.row} data-row={r.row} data-status={r.status}>
                    <td>{r.row}</td>
                    <td><span className={`badge badge-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td>
                      {r.input.full_name || <span className="muted">(no name)</span>}
                      <br /><span className="muted">{r.input.email || '(no email)'}</span>
                    </td>
                    <td>
                      {[...r.errors, ...r.notes].map((m) => <div key={m}>{m}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
