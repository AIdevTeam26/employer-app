import express from 'express';
import cors from 'cors';
import employees from './routes/employees.js';
import importRoutes from './routes/import.js';
import { pool } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/employees/import', importRoutes);
app.use('/api/employees', employees);

// Central error handler: turns database errors into readable responses
app.use((err, _req, res, _next) => {
  console.error('[API ERROR]', err.code || '', err.message);
  if (err.code === '23505') return res.status(409).json({ error: 'That email already exists' });
  if (err.code === '22P02' || err.code === '22007') return res.status(400).json({ error: 'A number or date has an invalid format' });
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '28P01' || err.code === '3D000')
    return res.status(500).json({ error: `Cannot connect to the database (${err.code}). Run "npm run db:check" for details` });
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
