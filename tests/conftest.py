import pytest
import requests

from helpers import API_URL, delete_test_employees, seed_existing


@pytest.fixture(scope="session", autouse=True)
def api_is_running():
    """Stop early with a clear message if the backend is not reachable."""
    try:
        r = requests.get(f"{API_URL}/api/health", timeout=5)
        r.raise_for_status()
    except Exception as exc:
        pytest.exit(
            f"Cannot reach the API at {API_URL} ({exc}).\n"
            "Start it first:  npm run db:up   then   npm run dev",
            returncode=2,
        )


@pytest.fixture
def fresh_db():
    """Clean test data, create the two 'existing' employees, and clean up again afterwards."""
    seed_existing()
    yield
    delete_test_employees()
