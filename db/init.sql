CREATE TABLE IF NOT EXISTS employees (
  id          SERIAL PRIMARY KEY,
  full_name   VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL UNIQUE,
  department  VARCHAR(80)  NOT NULL,
  position    VARCHAR(80)  NOT NULL,
  salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  hire_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO employees (full_name, email, department, position, salary, hire_date) VALUES
  ('Priya Raman',  'priya@example.com',  'Engineering', 'Backend Developer', 1200000, '2023-04-10'),
  ('Arjun Kumar',  'arjun@example.com',  'Design',      'UI Designer',        950000, '2022-11-01'),
  ('Meera Nair',   'meera@example.com',  'HR',          'HR Manager',        1100000, '2021-07-19')
ON CONFLICT (email) DO NOTHING;
