# Employer Team Directory (React + Node.js + PostgreSQL)

Two ways to run it. Both use npm.

## A) Develop with npm (recommended while building)
Only PostgreSQL runs in Docker. React and Node run on your machine with npm.

Needs: Node.js 20.6+ and Docker.

```bash
cd employer-app
npm run setup      # installs root, backend and frontend packages
npm run db:up      # starts PostgreSQL in Docker (port 5432)
npm run dev        # starts API (:4000) and React (:5173) together
```
Open http://localhost:5173. Code changes reload automatically.

Other scripts: `npm run backend`, `npm run frontend`, `npm run db:down`, `npm run db:reset` (wipes DB).

## B) Everything in Docker (like a deployment)
```bash
docker compose up --build
```
Open http://localhost:3000. Stop with `docker compose down`.

See **UNDERSTANDING.md** for how it all works.

## Tests
```bash
npm test                              # frontend unit tests (Vitest + React Testing Library)
npm run test:watch --prefix frontend  # re-run on save
npm run test:coverage --prefix frontend
```

## Git and GitHub
```bash
git init
git add .
git status          # make sure no .env file is listed
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/employer-app.git
git push -u origin main
```

## VS Code + GitHub Copilot
Open the folder in VS Code, accept the recommended extensions, sign in to GitHub, open Copilot Chat and pick the **Frontend Test Agent**. See UNDERSTANDING.md section 16.

## Excel upload and pytest tests
```bash
# 1. app running:   npm run setup   (once, installs exceljs/multer)  ->  npm run db:up  ->  npm run dev
# 2. Python tools (once):
python -m venv .venv
.venv\Scripts\Activate.ps1                 # Windows PowerShell  (Mac/Linux: source .venv/bin/activate)
pip install -r tests/requirements.txt
python -m playwright install chromium
# 3. run
pytest -m "not ui"                         # API tests (fast)
pytest -m ui --headed --slowmo 300         # browser tests, you can watch them
pytest -m email                            # only the email checks
```
Test data: `test-data/upload_test_data.xlsx` (sheets Candidates + Expected). Upload it in the website under "Import from Excel".
