import { useEffect, useState } from 'react';
import { listEmployees, createEmployee, updateEmployee, deleteEmployee } from './api.js';
import ImportPanel from './ImportPanel.jsx';

const EMPTY = { full_name: '', email: '', department: '', position: '', salary: '', hire_date: '' };

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setEmployees(await listEmployees(search));
      setError('');
    } catch (e) { setError(e.message); }
  }

  // Reload whenever the search text changes (with a short delay while typing)
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search]);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    try {
      if (editingId) await updateEmployee(editingId, form);
      else await createEmployee(form);
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) { setError(err.message); }
  }

  function edit(emp) {
    setEditingId(emp.id);
    setForm({ ...emp, salary: emp.salary, hire_date: emp.hire_date?.slice(0, 10) || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(emp) {
    if (!confirm(`Remove ${emp.full_name}?`)) return;
    try { await deleteEmployee(emp.id); await load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <main className="page">
      <header className="top">
        <h1>Team directory</h1>
        <p>{employees.length} {employees.length === 1 ? 'person' : 'people'} on your team</p>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <form className="form" onSubmit={submit}>
        <h2>{editingId ? 'Edit employee' : 'Add employee'}</h2>
        <div className="grid">
          <label>Full name<input name="full_name" value={form.full_name} onChange={change} required /></label>
          <label>Email<input name="email" type="email" value={form.email} onChange={change} required /></label>
          <label>Department<input name="department" value={form.department} onChange={change} required /></label>
          <label>Position<input name="position" value={form.position} onChange={change} required /></label>
          <label>Salary (yearly)<input name="salary" type="number" min="0" value={form.salary} onChange={change} /></label>
          <label>Hire date<input name="hire_date" type="date" value={form.hire_date} onChange={change} /></label>
        </div>
        <div className="actions">
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Add employee'}</button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>
          )}
        </div>
      </form>

      <ImportPanel onImported={load} />

      <input
        className="search"
        placeholder="Search by name, email, department or position"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search employees"
      />

      {employees.length === 0 ? (
        <p className="empty">No employees found. Add your first one above.</p>
      ) : (
        <div className="tablewrap">
          <table aria-label="Employee list">
            <thead>
              <tr><th>Name</th><th>Department</th><th>Position</th><th>Salary</th><th>Hired</th><th></th></tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td><strong>{emp.full_name}</strong><br /><span className="muted">{emp.email}</span></td>
                  <td>{emp.department}</td>
                  <td>{emp.position}</td>
                  <td>₹{Number(emp.salary).toLocaleString('en-IN')}</td>
                  <td>{new Date(emp.hire_date).toLocaleDateString('en-IN')}</td>
                  <td className="rowactions">
                    <button onClick={() => edit(emp)}>Edit</button>
                    <button className="danger" onClick={() => remove(emp)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
