# Understanding Document: Employer Team Directory

A small full-stack app where an employer can add, view, search, edit and remove employees.
Three containers, one command to start them.

---

## 1. Big picture

```
 Browser
   |  http://localhost:3000
   v
+------------------+   /api/*     +------------------+   SQL    +------------------+
| frontend         | -----------> | backend          | -------> | db               |
| nginx + React    |  (proxied)   | Node + Express   |  (pg)    | PostgreSQL 16    |
| port 80 (->3000) |              | port 4000        |          | port 5432        |
+------------------+              +------------------+          +--------+---------+
                                                                         |
                                                                  volume: pgdata
                                                              (data persists on disk)
```

- **React** draws the page and talks to the API with `fetch`.
- **nginx** serves the built React files and forwards any URL starting with `/api/` to the backend. Because the browser only ever talks to one address, there are no CORS problems.
- **Express (Node.js)** exposes a REST API and runs SQL against Postgres.
- **PostgreSQL** stores the data. A Docker *volume* keeps it safe when containers are rebuilt.
- **Docker Compose** starts all three, puts them on a shared private network, and lets them reach each other **by service name** (`db`, `backend`).

## 2. Folder structure

```
employer-app/
├── docker-compose.yml      # defines the 3 services
├── .env                    # DB credentials (not committed to git)
├── db/init.sql             # creates the table + sample rows
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js        # Express app, health check, error handler
│       ├── db.js           # PostgreSQL connection pool
│       └── routes/employees.js   # CRUD endpoints
└── frontend/
    ├── Dockerfile          # 2 stages: build React, serve with nginx
    ├── nginx.conf          # serves files + proxies /api
    ├── vite.config.js      # dev server config
    ├── index.html
    └── src/ main.jsx, App.jsx, api.js, styles.css
```

## 3. How each part works

### 3.1 Database (PostgreSQL)
- We use the official `postgres:16-alpine` image, no custom Dockerfile.
- Environment variables `POSTGRES_USER / PASSWORD / DB` create the user and database on first start. They come from `.env`.
- Any `.sql` file mounted into `/docker-entrypoint-initdb.d/` runs **once**, only when the data folder is empty. That is how `init.sql` creates the `employees` table and seeds 3 rows.
- `volumes: pgdata:` stores data outside the container. Deleting the container does not delete your data. `docker compose down -v` does.
- A **healthcheck** (`pg_isready`) tells Compose when Postgres is truly ready.

> Changed `init.sql` and nothing happened? It only runs on a fresh volume. Run `docker compose down -v` then `up --build`.

### 3.2 Backend (Node.js + Express)
- `db.js` creates a `Pool` from `DATABASE_URL`. In Compose that URL is  
  `postgres://USER:PASS@db:5432/DBNAME`. The host is `db`, the service name, not `localhost`.
- `routes/employees.js` holds the REST endpoints:

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/employees?search=` | list, optional search |
| POST | `/api/employees` | create |
| PUT | `/api/employees/:id` | update |
| DELETE | `/api/employees/:id` | delete |
| GET | `/api/health` | checks API and DB |

- **Parameterised queries** (`$1, $2`) are used everywhere. Never build SQL by joining strings; that is how SQL injection happens.
- The error handler turns Postgres error `23505` (duplicate email) into a friendly `409` response.
- `"type": "module"` in `package.json` enables `import` syntax.

### 3.3 Frontend (React + Vite)
- Vite builds the React app. `npm run build` outputs plain static files into `dist/`.
- `api.js` wraps `fetch` so components never repeat URLs or headers. It uses relative paths like `/api/employees`.
- `App.jsx` keeps state with `useState` (`employees`, `form`, `editingId`, `search`, `error`) and uses `useEffect` to reload the list when the search text changes (with a 250 ms delay so it doesn't query on every keystroke).
- One form is used for both add and edit: if `editingId` is set, submit calls `PUT`, otherwise `POST`.

### 3.4 Dockerfiles
**Backend**: `node:20-alpine` → copy `package.json` → `npm install` → copy source → run.  
Copying `package.json` *before* the source means Docker caches the install layer, so rebuilds are fast unless dependencies change.

**Frontend (multi-stage)**:
1. Stage `build`: Node installs deps and runs `vite build`.
2. Final stage: a tiny `nginx:alpine` image receives only the built `dist/` files. Node is not in the final image.

### 3.5 docker-compose.yml
- `build:` builds from a local Dockerfile; `image:` pulls a ready-made one.
- `depends_on` with `condition: service_healthy` makes the backend wait for a healthy DB.
- `ports: "3000:80"` means *your machine's port 3000 → container's port 80*.
- All services share a default network, which is why `db` and `backend` work as hostnames.

## 4. Request walkthrough: "Add employee"

1. You fill the form and click **Add employee**.
2. `submit()` calls `createEmployee(form)` → `POST /api/employees` with JSON.
3. nginx sees `/api/`, forwards to `http://backend:4000`.
4. Express validates the body, runs `INSERT ... RETURNING *` through the pool.
5. Postgres stores the row; Express replies `201` with the new row.
6. React clears the form and calls `load()`, which re-fetches the list and re-renders the table.

## 5. Running it

```bash
docker compose up --build        # build and start everything
docker compose up -d --build     # same, in background
docker compose logs -f backend   # follow one service's logs
docker compose ps                # status
docker compose down              # stop and remove containers (data kept)
docker compose down -v           # also delete the database volume
```

Inspect the database directly:
```bash
docker compose exec db psql -U employer -d employer_db -c "SELECT * FROM employees;"
```

Test the API without the UI:
```bash
curl http://localhost:4000/api/employees
curl -X POST http://localhost:4000/api/employees \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User","email":"t@example.com","department":"Sales","position":"Rep","salary":500000}'
```

### Developing without rebuilding images every time
Run only the database in Docker and the two apps locally:
```bash
docker compose up db -d
cd backend  && npm install && DATABASE_URL=postgres://employer:change_me@localhost:5432/employer_db npm run dev
cd frontend && npm install && npm run dev      # http://localhost:5173
```
(For this, add `ports: ["5432:5432"]` under the `db` service.)

## 6. How to rebuild this from scratch (the recipe)

1. **Plan the data**: write the table in `db/init.sql`.
2. **Create the DB service** in `docker-compose.yml` (image, env, volume, healthcheck). Run `docker compose up db` and confirm the table exists with `psql`.
3. **Backend**: `npm init -y`, install `express pg cors`; write `db.js`, then one route file, then `index.js`. Add a Dockerfile. Add the service to Compose with `DATABASE_URL` pointing at host `db`.
4. **Test the API with curl** before touching React.
5. **Frontend**: `npm create vite@latest frontend -- --template react`. Write `api.js` first, then the UI. Add the proxy in `vite.config.js` for dev.
6. **Production frontend**: multi-stage Dockerfile + `nginx.conf` with the `/api/` proxy. Add the service to Compose.
7. **Run everything**: `docker compose up --build`.

Order matters: database → API → UI. Verify each layer works before adding the next.

## 7. Adapting it to your own idea

Different entity (jobs, candidates, leave requests, products)?
1. Change the table in `init.sql`.
2. Copy `routes/employees.js` → `routes/jobs.js`, change table/columns; register it in `index.js` with `app.use('/api/jobs', jobs)`.
3. Copy `api.js` functions and adjust the UI fields.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `port is already allocated` | Another app uses 3000/4000. Change the left number in `ports:` |
| Backend can't connect to DB | Using `localhost` instead of `db` in `DATABASE_URL` inside Docker |
| Table missing / old schema | `init.sql` only runs on a fresh volume → `docker compose down -v` |
| Changed code not showing | Rebuild: `docker compose up --build` |
| Page loads but list is empty with error | Check `docker compose logs backend` |
| Blank page after refresh on a sub-URL | nginx `try_files` rule handles this; make sure `nginx.conf` is copied |

## 9. Honest limitations and next steps

This is a *basic* starter, not production-ready:
- **No login.** Anyone who can reach it can edit data. Next: add `users` table, `bcrypt` password hashing, JWT or session cookies, and protect routes with middleware.
- **Passwords in `.env`**: change `change_me`, never commit `.env`; use secrets in real deployments.
- **No migrations tool**: use something like `node-pg-migrate` or Prisma when the schema starts changing.
- **No tests, no HTTPS**: add Jest/Vitest, and put a reverse proxy (Caddy/Traefik) with TLS in front for deployment.
- Salary is sensitive data; restrict who can see it once auth exists.

## 10. Glossary

- **Image**: a packaged filesystem and start command. **Container**: a running image.
- **Volume**: storage that outlives containers.
- **Compose**: a file that describes several containers and how they connect.
- **REST API**: URLs + HTTP verbs (GET/POST/PUT/DELETE) used to read and change data.
- **CRUD**: Create, Read, Update, Delete.
- **Reverse proxy**: a server (nginx) that forwards requests to another server.
- **Connection pool**: reusable DB connections, faster than opening one per request.

---

## 11. npm workflow (React + Node on your machine, DB in Docker)

This is the day-to-day way to develop. Docker only provides PostgreSQL.

### What changed vs. the full-Docker mode
| | Full Docker | npm dev mode |
|---|---|---|
| Compose file | `docker-compose.yml` | `docker-compose.dev.yml` (DB only, exposes 5432) |
| DB host in `DATABASE_URL` | `db` | `localhost` |
| React served by | nginx on :3000 | Vite dev server on :5173 |
| `/api` forwarded by | nginx | Vite proxy (`vite.config.js`) |
| Reload on change | rebuild image | automatic |

### The pieces
- **Root `package.json`** holds helper scripts so you never `cd` around. `concurrently` runs the API and React dev server in one terminal.
- **`backend/.env`** holds `DATABASE_URL` and `PORT`. `npm run dev` in the backend uses `node --env-file=.env --watch`, which loads that file and restarts on save. This needs Node 20.6+; no `dotenv` package required.
- **`frontend`** runs `vite`, which gives hot reload. Its proxy sends `/api/*` to `http://localhost:4000`, so `api.js` is identical in both modes.
- The credentials in `backend/.env` must match the root `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).

### Steps
```bash
npm run setup     # one time: installs all three package.json files
npm run db:up     # DB container up; init.sql creates the table on first run
npm run dev       # API + React together
```
Open http://localhost:5173.

### Creating this setup from scratch with npm
```bash
mkdir employer-app && cd employer-app && npm init -y
npm i -D concurrently

mkdir backend && cd backend && npm init -y
npm i express pg cors            # then set "type": "module" in package.json
cd ..

npm create vite@latest frontend -- --template react
cd frontend && npm install && cd ..
```
Then add the scripts shown in the root `package.json`, the proxy in `vite.config.js`, and the DB-only compose file.

### Troubleshooting (npm mode)
| Symptom | Fix |
|---|---|
| `node: --env-file= is not allowed` / unknown option | Node is older than 20.6. Upgrade Node (check with `node -v`) |
| `ECONNREFUSED 127.0.0.1:5432` | DB not running: `npm run db:up`, then `docker ps` |
| `password authentication failed` | `backend/.env` doesn't match root `.env`. If you changed the password after first start, run `npm run db:reset` |
| Frontend shows "Request failed" | API not running or crashed. Check the `api` output in the terminal |
| Port 5432 already in use | A local Postgres is running. Stop it or change the left side of `"5432:5432"` and update `DATABASE_URL` |

---

## 12. Connecting to the database and debugging "Something went wrong on the server"

That message is the backend's catch-all for an unexpected error. The real reason is always printed in the backend logs, so look there first.

### Step 1: read the real error
```bash
docker compose logs --tail=50 backend      # full Docker mode
# npm mode: look at the "api" lines in the terminal running npm run dev
```
Look for a line starting with `[API ERROR]`. It shows the Postgres error code and message.

### Step 2: check the API can reach the DB
```bash
curl http://localhost:4000/api/health
```
`{"status":"ok","database":"connected"}` means the connection works, so the problem is in a specific query, not the connection.

### Step 3: connect to the database yourself
Command line (works in Docker mode, no extra setup):
```bash
docker compose exec db psql -U employer -d employer_db
```
Handy commands inside psql: `\dt` (tables), `\d employees` (columns), `SELECT * FROM employees;`, `\q` (quit).

GUI tool (DBeaver, pgAdmin, TablePlus): the DB port is only published in npm dev mode. In full Docker mode add this under the `db:` service and re-run `docker compose up -d`:
```yaml
    ports:
      - "5432:5432"
```
Then connect with: Host `localhost`, Port `5432`, Database `employer_db`, User `employer`, Password = the one in `.env`.

### How the backend connects (connection string)
`postgres://USER:PASSWORD@HOST:5432/DBNAME`
- Full Docker mode: HOST is `db` (the service name).
- npm mode: HOST is `localhost`.
Using the wrong host is the classic cause of `ECONNREFUSED` or `ENOTFOUND`.

### Common causes of this error
| Log message | Meaning | Fix |
|---|---|---|
| `invalid input syntax for type numeric: ""` (code 22P02) | An empty salary was sent to a numeric column | Fixed in the latest version (salary '' becomes 0) |
| `ECONNREFUSED` / `ENOTFOUND db` | Wrong host or DB not running | Check `DATABASE_URL`, `docker compose ps` |
| `password authentication failed` (28P01) | Password in `.env` differs from the one the DB was created with | `docker compose down -v` then `up --build` (this wipes data) |
| `relation "employees" does not exist` (42P01) | `init.sql` never ran | `docker compose down -v` then `up --build` |
| `database "..." does not exist` (3D000) | `POSTGRES_DB` was changed after first start | same as above |

---

## 13. Why npm mode uses port 5439

On Windows (and many Macs), a locally installed PostgreSQL often already listens on port 5432. The backend then talks to that one instead of the Docker container and gets `password authentication failed`, even though the password is correct. To avoid this, npm dev mode publishes the Docker database on **5439** (`"5439:5432"` in `docker-compose.dev.yml`) and `backend/.env` uses `127.0.0.1:5439`. Inside Docker the database still uses 5432; only the port on your machine differs.

If you change the database password, run `npm run db:reset` and update both `.env` (root) and `backend/.env`.

---

## 14. The db:check command

`npm run db:check` (npm mode) prints the host, port, database, user and password length the backend actually uses, tries to connect, and explains the failure. Run it before guessing. Error codes it recognises:

| Code | Meaning |
|---|---|
| `ECONNREFUSED` | Nothing listening on that port: DB container not running, or wrong port |
| `ENOTFOUND` | Wrong host (`db` only works inside Docker; use `127.0.0.1` in npm mode) |
| `28P01` | Wrong password, or a different Postgres owns that port |
| `3D000` | Database name does not exist |

Note: after editing `backend/.env`, the dev server now restarts automatically (it watches `src` and `.env`). The older setup did not, which is why changes to `.env` seemed to have no effect.

---

## 15. Error 28P01 ("password authentication failed") checklist

Postgres reports this same error for a wrong password AND for a user that does not exist. Most causes:

1. **Old volume.** The password/user is only applied when the volume is first created. Fix: `npm run db:reset`.
2. **Unreadable root `.env`.** If the file was saved with a BOM (some Windows editors) or has quotes/spaces, Docker may ignore a variable and Postgres creates the default `postgres` user instead of `employer`. The compose files now fall back to `employer` / `change_me` / `employer_db` if a variable is missing.
3. **Another Postgres on the same port.** Check with `netstat -ano | findstr :5433`.
4. **See what the container really got:**
   `docker compose -f docker-compose.dev.yml exec db env` (look at the POSTGRES_ lines) and
   `docker compose -f docker-compose.dev.yml exec db psql -U employer -d employer_db -c "\du"`.

---

## 16. Git, VS Code, Copilot and frontend tests

### 16.1 Unit tests (frontend)
- **Vitest** is the test runner (made for Vite projects). **jsdom** simulates a browser. **React Testing Library** renders components and finds elements the way a user would (by label or role). **user-event** simulates typing and clicking.
- `src/test/setup.js` runs before every test file (adds `toBeInTheDocument()` etc.).
- `src/api.test.js` replaces `fetch` with a fake and checks each API function sends the right URL, method and body, and throws the server's error message.
- `src/App.test.jsx` replaces the whole `api.js` module with `vi.mock`, so no backend is needed. It covers list, empty state, error banner, search, add, duplicate-email error, edit, delete and cancelled delete.
- Run: `npm test` (root). Watch mode: `npm run test:watch --prefix frontend`.
- Pattern for a new test: **arrange** (mock the API) → **act** (render, type, click) → **assert** (expect something visible or a mock call).

### 16.2 Git
- `.gitignore` keeps `.env`, `node_modules`, `dist` and `coverage` out of the repository. Only `.env.example` files are committed.
- `.gitattributes` avoids line-ending noise between Windows and Linux.
- After your first `npm run setup`, commit the generated `package-lock.json` files (root, backend, frontend) so everyone installs identical versions.
- Do not keep the repo inside a OneDrive-synced folder if you can avoid it; OneDrive and `.git` / `node_modules` do not mix well.

### 16.3 What the `.github` and `.vscode` files do
| File | Purpose |
|---|---|
| `.github/copilot-instructions.md` | Project facts and rules Copilot reads for every chat request |
| `.github/instructions/frontend-tests.instructions.md` | Extra rules applied only when Copilot works on test files |
| `.github/agents/frontend-test-agent.agent.md` | A custom Copilot agent that writes, runs and fixes frontend tests |
| `.github/prompts/add-frontend-tests.prompt.md` | A reusable prompt, run in chat by typing `/add-frontend-tests` |
| `.github/workflows/ci.yml` | GitHub Actions: runs tests and a build on every push and pull request |
| `.vscode/extensions.json` | Suggests Copilot, Vitest, Docker and a PostgreSQL client |
| `.vscode/tasks.json` | Run DB, dev server and tests from the Command Palette (Tasks: Run Task) |
| `.vscode/launch.json` | Debug the backend with breakpoints (F5) |

### 16.4 Using the Frontend Test Agent
1. Open the folder in VS Code and install the recommended extensions. Sign in to GitHub (Copilot Free works, with usage limits).
2. Open Copilot Chat. In the agent picker (where Ask / Edit / Agent are listed), choose **Frontend Test Agent**.
3. Ask, for example: `Add tests for the salary formatting in App.jsx` or `Raise coverage of App.jsx`.
4. The agent edits test files, asks permission to run `npm test --prefix frontend`, reads failures and fixes them in a loop.
5. Review every change in the diff before you keep it. Agents can be wrong.

The agent file format and tool names change between VS Code versions. If the agent does not show up, update VS Code and Copilot Chat, then check the tools list in the agent picker and adjust the `tools:` line.

### 16.5 CI
`.github/workflows/ci.yml` runs on GitHub after each push: install, `npm test`, `npm run build` for the frontend. A red cross on a commit means a test or the build failed.

---

## 17. Excel upload, validation and pytest tests

### 17.1 The feature
In the website, the **Import from Excel** panel lets you pick an `.xlsx`, press **Validate file** (nothing is saved, you get a row-by-row report), then **Import valid rows**.

Flow: browser (`FormData` upload) → nginx / Vite proxy → `POST /api/employees/import` → multer (keeps the file in memory) → exceljs (reads cells) → `importValidation.js` (rules) → PostgreSQL (one transaction on commit).

Excel rules (`backend/src/importValidation.js`):
| Check | Rule | Message example |
|---|---|---|
| Required fields | full_name, email, department, position cannot be empty or only spaces | `full_name is required` |
| Data type | text fields must be text (not a number); max 120/160/80/80 characters | `full_name must be text` |
| Data type | salary is a number, not negative (optional) | `salary must be a number` |
| Data type | hire_date is a real date, e.g. 2024-02-31 is rejected (optional) | `hire_date must be a valid date (YYYY-MM-DD)` |
| Email | must look like `name@domain.ext`, no spaces | `email is not valid` |
| Duplicate in file | the same email twice in one file | `Duplicate email in file (first used on row 2)` |
| Existing employee | email already in the database (case-insensitive) → **replace** (or skip if the checkbox is off) | status `replace` / `skip` |

Row statuses: `new`, `replace`, `skip`, `invalid`. Invalid rows are never saved. Blank optional cells (salary, hire_date) keep the old value when an existing employee is replaced. Emails are stored in lower case. Unknown columns (like `case_id`) are ignored. Limits: 2 MB, 1000 rows.

### 17.2 The Excel test workbook (`test-data/upload_test_data.xlsx`)
- **Candidates**: the file you upload. 20 rows, one test case each, with real Excel dates and numbers, some deliberately wrong.
- **Expected**: for each Excel row: `case_id`, `check` (required/datatype/email/replace/valid/duplicate), `expected_status`, and `expected_error_contains`.
- **About**: short notes.
- Regenerate with `python tests/build_test_workbook.py`, or edit the file in Excel (keep both sheets in sync).

### 17.3 How pytest uses it
```
tests/
  conftest.py        fixtures: fresh_db (creates the 2 "existing" employees, cleans up after)
  helpers.py         reads the workbook, calls the API, cleans test data
  test_import_api.py API tests, one test per Expected row + commit/replace/file-level tests
  test_import_ui.py  browser tests (Playwright) that upload the same workbook through the website
  build_test_workbook.py
pytest.ini           settings and marker names
```
- `@pytest.mark.parametrize` creates one test per Excel row, named by case id (`test_row_validation[TC14]`). Add a row to the Expected sheet and a new test appears, without writing Python.
- Markers select groups: `pytest -m required`, `-m datatype`, `-m email`, `-m replace`, `-m ui`, `-m "not ui"`.
- **Safety:** tests create and delete only employees whose email ends with `@testdata.example`. They run against the real running database, not a separate test database.
- Replace test: the fixture first creates `existing.candidate@testdata.example` (Sales) and `existing.mixed@testdata.example`; after the import the test asserts there is exactly ONE record per email, the department is changed, the mixed-case email was matched, and a blank salary kept the old value.

### 17.4 Test run order
1. `npm run db:up` and `npm run dev` (API on 4000, site on 5173; in Docker mode set `UI_URL=http://localhost:3000`).
2. Activate the Python venv, `pytest -m "not ui"`.
3. `pytest -m ui --headed --slowmo 300` to watch the browser upload the file.

### 17.5 Troubleshooting
| Symptom | Fix |
|---|---|
| `Cannot reach the API at http://localhost:4000` | Start the app first (`npm run dev`) |
| `Cannot find package 'exceljs'` or `multer` | Run `npm run setup` again (Docker: `docker compose up --build`) |
| Replace tests fail with "found 2 records" or fixtures leave data behind | Backend is the old version (search ignores email). Restart the backend |
| `playwright: command not found` / browser missing | `python -m playwright install chromium` |
| UI tests time out on `Excel file` | Wrong `UI_URL`, or the site is not running |
| 413 error in Docker mode | Rebuild the frontend image (`nginx.conf` now allows 3 MB) |

### 17.6 Vitest vs pytest
The earlier Vitest tests (`npm test`) still cover React components in isolation. pytest covers the upload feature end to end (API and real browser). Keep both, or delete the Vitest files if you want pytest only.
