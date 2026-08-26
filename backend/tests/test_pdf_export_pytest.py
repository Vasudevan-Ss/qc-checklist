"""Tests for the Daily QC Report PDF export feature.

Covers:
- POST /api/reports/daily/pdf (admin & qc executive)
- GET  /api/reports/shared/{token} (public, inline / download)
- GET  /api/reports/shared/{invalid} -> 404
- GET  /api/reports/exports scope (own for qc, all for admin)
- Regression: GET /api/reports/daily still returns expected shape (+scope field)
- PDF content sanity: %PDF header, size, photo_count matches inspections
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://qc-checklist-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@qc.com"
ADMIN_PW = "Admin@12345"
QC_EMAIL = "qc@qc.com"
QC_PW = "Qcuser@12345"

# Only date reported to have data with photos
TARGET_DATE = "2026-08-26"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def qc_token():
    r = requests.post(f"{API}/auth/login", json={"email": QC_EMAIL, "password": QC_PW}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Regression: /reports/daily still works ----------
def test_reports_daily_shape_admin(admin_token):
    r = requests.get(f"{API}/reports/daily?date={TARGET_DATE}", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    for key in ("header", "scope", "production_summary", "qc_summary", "ccp_summary",
                "product_summary", "nonconformance_summary", "prepared_by"):
        assert key in j, f"missing {key}"
    assert j["header"]["date"] == TARGET_DATE
    assert j["scope"] == "ALL INSPECTIONS"


def test_reports_daily_scope_qc(qc_token):
    r = requests.get(f"{API}/reports/daily?date={TARGET_DATE}", headers=_h(qc_token), timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "scope" in j
    assert "OWN RECORDS" in j["scope"].upper()


def test_dashboard_stats_unaffected(admin_token):
    r = requests.get(f"{API}/dashboard/stats?date={TARGET_DATE}", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    j = r.json()
    for k in ("date", "inspections_completed", "products_inspected", "total_checks",
             "passed_inspections", "failed_inspections", "open_corrective_actions"):
        assert k in j


def test_inspections_crud_unaffected(admin_token):
    r = requests.get(f"{API}/inspections?date={TARGET_DATE}", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- PDF generation (admin) ----------
@pytest.fixture(scope="module")
def admin_pdf_export(admin_token):
    r = requests.post(f"{API}/reports/daily/pdf?date={TARGET_DATE}", headers=_h(admin_token), timeout=180)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("token", "filename", "share_path", "size_bytes", "photo_count", "expires_at"):
        assert k in data, f"missing {k}"
    assert data["share_path"].startswith("/api/reports/shared/")
    assert data["filename"].endswith(".pdf")
    assert data["size_bytes"] > 3000, f"pdf too small: {data['size_bytes']}"
    return data


def test_admin_pdf_photo_count_matches_inspection_photos(admin_token, admin_pdf_export):
    """photo_count must equal number of distinct photo_paths across the date's inspections."""
    r = requests.get(f"{API}/inspections?date={TARGET_DATE}", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    lst = r.json()
    paths = set()
    for row in lst:
        d = requests.get(f"{API}/inspections/{row['id']}", headers=_h(admin_token), timeout=30).json()
        for x in d.get("results", []) + d.get("ccp_readings", []):
            p = x.get("photo_path")
            if p:
                paths.add(p)
    # photo_count is what backend could actually fetch; must be <= distinct paths, and equal when storage healthy
    assert admin_pdf_export["photo_count"] <= len(paths) + 0, \
        f"photo_count {admin_pdf_export['photo_count']} > distinct paths {len(paths)}"
    # Best-effort strict equality (storage is expected to be reachable in this env)
    assert admin_pdf_export["photo_count"] == len(paths), \
        f"expected {len(paths)} photos, got {admin_pdf_export['photo_count']}"


# ---------- Public share endpoint ----------
def test_shared_pdf_inline_no_auth(admin_pdf_export):
    url = f"{BASE_URL}{admin_pdf_export['share_path']}"
    # storage may have read-after-write delay; endpoint retries internally, but give one client retry too
    last = None
    for _ in range(3):
        r = requests.get(url, timeout=60)
        last = r
        if r.status_code == 200:
            break
        time.sleep(2)
    assert last.status_code == 200, last.text[:400]
    assert last.headers.get("content-type", "").startswith("application/pdf")
    assert last.content[:4] == b"%PDF", last.content[:20]
    disp = last.headers.get("content-disposition", "")
    assert "inline" in disp.lower(), disp
    assert admin_pdf_export["filename"] in disp


def test_shared_pdf_download_attachment(admin_pdf_export):
    url = f"{BASE_URL}{admin_pdf_export['share_path']}?download=1"
    r = requests.get(url, timeout=60)
    assert r.status_code == 200
    disp = r.headers.get("content-disposition", "").lower()
    assert "attachment" in disp, disp
    assert r.content[:4] == b"%PDF"


def test_shared_invalid_token_returns_404():
    url = f"{API}/reports/shared/this-token-does-not-exist-xyz-000"
    r = requests.get(url, timeout=30)
    assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"


# ---------- QC executive PDF (scope=own) ----------
@pytest.fixture(scope="module")
def qc_pdf_export(qc_token):
    r = requests.post(f"{API}/reports/daily/pdf?date={TARGET_DATE}", headers=_h(qc_token), timeout=180)
    assert r.status_code == 200, r.text
    return r.json()


def test_qc_pdf_generated(qc_pdf_export):
    assert qc_pdf_export["size_bytes"] > 3000
    assert qc_pdf_export["share_path"].startswith("/api/reports/shared/")


def test_qc_pdf_publicly_downloadable(qc_pdf_export):
    url = f"{BASE_URL}{qc_pdf_export['share_path']}"
    last = None
    for _ in range(3):
        r = requests.get(url, timeout=60)
        last = r
        if r.status_code == 200:
            break
        time.sleep(2)
    assert last.status_code == 200
    assert last.content[:4] == b"%PDF"


# ---------- /reports/exports scoping ----------
def test_exports_scoping(admin_token, qc_token, admin_pdf_export, qc_pdf_export):
    # QC executive
    r = requests.get(f"{API}/reports/exports", headers=_h(qc_token), timeout=30)
    assert r.status_code == 200
    qc_list = r.json()
    qc_tokens = {x["token"] for x in qc_list}
    assert qc_pdf_export["token"] in qc_tokens, "qc user should see own export"
    assert admin_pdf_export["token"] not in qc_tokens, "qc user should NOT see admin export"

    # Admin
    r = requests.get(f"{API}/reports/exports", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    admin_list = r.json()
    admin_tokens = {x["token"] for x in admin_list}
    assert admin_pdf_export["token"] in admin_tokens
    assert qc_pdf_export["token"] in admin_tokens, "admin should see qc's export too"
