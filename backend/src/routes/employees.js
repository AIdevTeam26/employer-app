import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// Basic input check shared by create and update
function validate(body) {
  const { full_name, email, department, position } = body;
  if (!full_name || !email || !department || !position) {
    return 'full_name, email, department and position are required';
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'email is not valid';
  return null;
}

// Turn form values into what the database expects ('' is not a valid number)
function clean(body) {
  const salary = body.salary === '' || body.salary == null ? 0 : Number(body.salary);
  return {
    full_name: String(body.full_name).trim(),
    email: String(body.email).trim(),
    department: String(body.department).trim(),
    position: String(body.position).trim(),
    salary: Number.isFinite(salary) && salary >= 0 ? salary : NaN,
    hire_date: body.hire_date || null,
  };
}

// READ all (optional ?search=)
router.get('/', async (req, res, next) => {
  try {
    const search = `%${req.query.search || ''}%`;
    const { rows } = await pool.query(
      `SELECT * FROM employees
       WHERE full_name ILIKE $1 OR email ILIKE $1 OR department ILIKE $1 OR position ILIKE $1
       ORDER BY id DESC`,
      [search]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// CREATE
router.post('/', async (req, res, next) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });
  const { full_name, email, department, position, salary, hire_date } = clean(req.body);
  if (Number.isNaN(salary)) return res.status(400).json({ error: 'salary must be a positive number' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO employees (full_name, email, department, position, salary, hire_date)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE))
       RETURNING *`,
      [full_name, email, department, position, salary, hire_date]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// UPDATE
router.put('/:id', async (req, res, next) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });
  const { full_name, email, department, position, salary, hire_date } = clean(req.body);
  if (Number.isNaN(salary)) return res.status(400).json({ error: 'salary must be a positive number' });
  try {
    const { rows } = await pool.query(
      `UPDATE employees
       SET full_name=$1, email=$2, department=$3, position=$4, salary=$5,
           hire_date=COALESCE($6, hire_date)
       WHERE id=$7 RETURNING *`,
      [full_name, email, department, position, salary, hire_date, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
