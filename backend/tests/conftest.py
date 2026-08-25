import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_base() -> str:
    return API


@pytest.fixture(scope="session")
def qc_token() -> str:
    r = requests.post(f"{API}/auth/login",
                      json={"email": "qc@qc.com", "password": "Qcuser@12345"}, timeout=30)
    assert r.status_code == 200, f"QC login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@qc.com", "password": "Admin@12345"}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def qc_headers(qc_token):
    return {"Authorization": f"Bearer {qc_token}"}


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
