# Project instructions for GitHub Copilot

## What this project is
Employer "Team directory": add, search, edit and remove employees.
- `frontend/`: React 18 + Vite (JavaScript, JSX). Tests: Vitest + React Testing Library.
- `backend/`: Node.js 20 + Express (ES modules) + `pg` (PostgreSQL).
- `db/init.sql`: schema and seed data. PostgreSQL runs in Docker.

## Commands (run from the repository root)
- `npm run setup`: install all packages
- `npm run db:up` / `npm run db:down` / `npm run db:reset` / `npm run db:check`: database in Docker
- `npm run dev`: API (:4000) and React (:5173) together
- `npm test`: frontend unit tests (same as `npm test --prefix frontend`)
- `docker compose up --build`: everything in Docker, site on :3000

## Conventions
- Backend: ES modules (`import`), parameterised SQL only (`$1, $2`), never string-concatenate SQL. Return JSON errors as `{ error: "message" }`.
- Frontend: function components and hooks. All network calls go through `frontend/src/api.js` using relative `/api/...` URLs.
- Keep code simple and commented for beginners. Do not add new dependencies unless needed.
- Never commit `.env` files or real secrets. Use `.env.example` for placeholders.

## Testing rules (frontend)
- Test files sit next to the code: `Component.test.jsx`, `module.test.js`.
- Use Vitest + React Testing Library + `@testing-library/user-event`.
- Mock `./api.js` with `vi.mock`; tests must never call the real backend or database.
- Query by role or label (`getByRole`, `getByLabelText`), not by CSS class or implementation details.
- Every test must be independent and pass with `npm test`.

## Excel import and pytest tests
- Feature: upload an `.xlsx` of employees. `POST /api/employees/import?mode=validate|commit&replaceExisting=true|false`.
  Rules live in `backend/src/importValidation.js` (required fields, text/number/date types, email format, duplicate email in file, existing email -> replace).
- Test tool for this feature: **pytest** (`tests/`), plus Playwright for the browser tests.
- Test data lives in `test-data/upload_test_data.xlsx`: sheet `Candidates` (uploaded file) and sheet `Expected` (what each row must produce).
  Regenerate it with `python tests/build_test_workbook.py`. Never edit one sheet without updating the other.
- Commands: `pytest -m "not ui"` (API), `pytest -m ui --headed` (browser), `pytest -m email` (one check type).
- Tests only create/delete employees whose email ends with `@testdata.example`.
