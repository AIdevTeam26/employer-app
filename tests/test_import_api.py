"""Excel upload validation, tested against the REST API.

The test cases come from the 'Expected' sheet of test-data/upload_test_data.xlsx,
so a tester can add a row in Excel without touching Python.
"""
import pytest

from helpers import (
    EXISTING, WORKBOOK, delete_test_employees, find_by_email, list_test_employees,
    load_candidate_rows, load_cases, make_xlsx_bytes, seed_existing, upload,
)

pytestmark = pytest.mark.api

CASES = load_cases()
CASE_PARAMS = [pytest.param(c, id=c["case_id"], marks=getattr(pytest.mark, c["check"])) for c in CASES]


@pytest.fixture(scope="module")
def report():
    """Upload the workbook ONCE in validate mode (nothing is saved) and keep the report."""
    seed_existing()
    try:
        resp = upload(WORKBOOK, mode="validate")
        assert resp.status_code == 200, resp.text
        return resp.json()
    finally:
        delete_test_employees()


# ---------------------------------------------------------------- one test per row of the Expected sheet
@pytest.mark.parametrize("case", CASE_PARAMS)
def test_row_validation(case, report):
    row = next((r for r in report["rows"] if r["row"] == case["row"]), None)
    assert row is not None, f"row {case['row']} missing from the report"

    assert row["status"] == case["expected_status"], (
        f"{case['case_id']} {case['description']}: expected {case['expected_status']}, "
        f"got {row['status']} {row['errors']}"
    )
    if case["expected_error_contains"]:
        wanted = case["expected_error_contains"].lower()
        assert any(wanted in e.lower() for e in row["errors"]), f"expected '{wanted}' in {row['errors']}"
    else:
        assert row["errors"] == []


# ---------------------------------------------------------------- whole-report checks
def test_every_workbook_row_has_an_expected_result(report):
    assert {r["row"] for r in report["rows"]} == {c["row"] for c in CASES}


def test_summary_counts_match_expected_sheet(report):
    expected = {s: sum(1 for c in CASES if c["expected_status"] == s) for s in ("new", "replace", "skip", "invalid")}
    s = report["summary"]
    assert (s["new"], s["replace"], s["skip"], s["invalid"]) == (
        expected["new"], expected["replace"], expected["skip"], expected["invalid"])
    assert s["total"] == len(CASES)


def test_validate_mode_does_not_write_to_the_database(fresh_db):
    before = sorted(e["email"] for e in list_test_employees())
    assert upload(WORKBOOK, mode="validate").status_code == 200
    assert sorted(e["email"] for e in list_test_employees()) == before


# ---------------------------------------------------------------- commit behaviour
@pytest.mark.replace
def test_commit_adds_new_replaces_existing_and_skips_invalid(fresh_db):
    resp = upload(WORKBOOK, mode="commit", replace_existing=True)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    n_new = sum(1 for c in CASES if c["expected_status"] == "new")
    n_replace = sum(1 for c in CASES if c["expected_status"] == "replace")
    assert body["imported"]["created"] == n_new
    assert body["imported"]["replaced"] == n_replace

    sheet = load_candidate_rows()
    originals = {e["email"].lower(): e for e in EXISTING}

    for case in CASES:
        values = sheet[case["row"]]
        email = (values["email"] or "").strip().lower()

        if case["expected_status"] == "new":
            found = find_by_email(email)
            assert len(found) == 1, f"{case['case_id']}: new employee was not created"

        elif case["expected_status"] == "replace":
            found = find_by_email(email)
            assert len(found) == 1, f"{case['case_id']}: expected ONE record, found {len(found)} (duplicate created?)"
            record = found[0]
            assert record["email"] == email                      # stored in lower case
            assert record["department"] == values["department"]  # replaced
            expected_salary = values["salary"] if values["salary"] is not None else originals[email]["salary"]
            assert float(record["salary"]) == float(expected_salary)  # blank salary keeps the old value

        elif case["check"] in ("required", "datatype") and "@" in email:
            assert find_by_email(email) == [], f"{case['case_id']}: invalid row was saved"


@pytest.mark.replace
def test_replace_can_be_switched_off(fresh_db):
    """With 'replace existing' off, rows for existing emails are skipped and left untouched."""
    resp = upload(WORKBOOK, mode="validate", replace_existing=False)
    rows = {r["row"]: r for r in resp.json()["rows"]}
    replace_rows = [c["row"] for c in CASES if c["expected_status"] == "replace"]
    assert all(rows[r]["status"] == "skip" for r in replace_rows)

    body = upload(WORKBOOK, mode="commit", replace_existing=False).json()
    assert body["imported"]["replaced"] == 0
    unchanged = find_by_email(EXISTING[0]["email"])
    assert len(unchanged) == 1 and unchanged[0]["department"] == EXISTING[0]["department"]


# ---------------------------------------------------------------- problems with the file itself
def test_no_file_is_rejected():
    import requests
    from helpers import API_URL
    r = requests.post(f"{API_URL}/api/employees/import", timeout=15)
    assert r.status_code == 400 and "No file" in r.json()["error"]


def test_file_that_is_not_excel_is_rejected():
    r = upload(b"this is not an excel file", filename="fake.xlsx")
    assert r.status_code == 400 and "valid .xlsx" in r.json()["error"]


def test_missing_required_column_is_rejected():
    data = make_xlsx_bytes([["full_name", "email", "department"], ["A B", f"a.b@testdata.example", "IT"]])
    r = upload(data)
    assert r.status_code == 400
    assert "Missing required column" in r.json()["error"] and "position" in r.json()["error"]


def test_sheet_with_only_headers_is_rejected():
    r = upload(make_xlsx_bytes([["full_name", "email", "department", "position"]]))
    assert r.status_code == 400 and "no data rows" in r.json()["error"]


def test_header_names_are_forgiving_about_case_and_spaces():
    data = make_xlsx_bytes([
        ["Full Name", "EMAIL", " Department ", "Position"],
        ["Header Variant", "header.variant@testdata.example", "IT", "Admin"],
    ])
    r = upload(data, mode="validate")
    assert r.status_code == 200
    assert r.json()["rows"][0]["status"] == "new"
