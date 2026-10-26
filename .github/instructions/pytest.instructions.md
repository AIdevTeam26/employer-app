---
applyTo: "tests/**/*.py"
---
# Rules for pytest files
- Test data comes from `test-data/upload_test_data.xlsx` through `tests/helpers.py`. Do not hard-code row data in Python when it belongs in the workbook.
- Only touch employees whose email ends with `@testdata.example`. Use the `fresh_db` fixture for tests that write to the database.
- Mark tests: `api` or `ui`, plus `required`, `datatype`, `email`, `replace`, `valid`, `duplicate` where relevant (markers are registered in `pytest.ini`).
- API tests use `requests`; browser tests use `pytest-playwright` (`page` fixture) and query by role or label.
- Assertion messages must include the case id and what was expected.
