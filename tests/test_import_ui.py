"""Excel upload tested through the real website in a browser (Playwright).

Needs the site running (npm run dev -> http://localhost:5173) and:
    python -m playwright install chromium
Run with the browser visible:  pytest -m ui --headed --slowmo 300
"""
import re

import pytest
from playwright.sync_api import Page, expect

from helpers import UI_URL, WORKBOOK, load_cases

pytestmark = pytest.mark.ui

CASES = load_cases()


def count(status):
    return sum(1 for c in CASES if c["expected_status"] == status)


def upload_in_browser(page: Page, file_path):
    page.goto(UI_URL)
    page.get_by_label("Excel file").set_input_files(str(file_path))
    page.get_by_role("button", name="Validate file").click()


def test_validate_button_is_disabled_until_a_file_is_chosen(page: Page, fresh_db):
    page.goto(UI_URL)
    expect(page.get_by_role("button", name="Validate file")).to_be_disabled()
    expect(page.get_by_role("button", name="Import valid rows")).to_be_disabled()


def test_validation_report_shows_the_expected_result_for_every_row(page: Page, fresh_db):
    upload_in_browser(page, WORKBOOK)
    expect(page.get_by_role("table", name="Validation report")).to_be_visible()

    expect(page.get_by_text(
        f"{len(CASES)} rows checked: {count('new')} ready to add, {count('replace')} to replace, "
        f"{count('skip')} skipped, {count('invalid')} with errors"
    )).to_be_visible()

    problems = []
    for case in CASES:
        row = page.locator(f'tr[data-row="{case["row"]}"]')
        if row.count() == 0:
            problems.append(f"{case['case_id']}: row {case['row']} not shown")
            continue
        status = row.get_attribute("data-status")
        if status != case["expected_status"]:
            problems.append(f"{case['case_id']}: expected {case['expected_status']}, got {status}")
        wanted = case["expected_error_contains"]
        if wanted and wanted.lower() not in row.inner_text().lower():
            problems.append(f"{case['case_id']}: message '{wanted}' not shown")
    assert not problems, "\n".join(problems)


def test_importing_adds_new_rows_and_replaces_existing_ones(page: Page, fresh_db):
    upload_in_browser(page, WORKBOOK)
    page.get_by_role("button", name="Import valid rows").click()

    expect(page.get_by_text(f"Imported {count('new')} new, replaced {count('replace')}")).to_be_visible()

    employees = page.get_by_role("table", name="Employee list")
    expect(employees.get_by_text("Asha Menon")).to_be_visible()                     # new row
    replaced = employees.locator("tr", has_text="existing.candidate@testdata.example")
    expect(replaced).to_have_count(1)                                              # not duplicated
    expect(replaced).to_contain_text("Operations")                                 # department replaced
    expect(page.get_by_role("button", name="Import valid rows")).to_be_disabled()  # cannot import twice


def test_a_file_that_is_not_excel_shows_an_error(page: Page, fresh_db, tmp_path):
    fake = tmp_path / "notes.xlsx"
    fake.write_text("this is not a spreadsheet")
    upload_in_browser(page, fake)
    expect(page.get_by_role("alert")).to_contain_text("valid .xlsx")
