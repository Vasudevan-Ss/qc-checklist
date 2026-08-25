"""End-to-end backend tests for QC Inspect."""
import io
import time
import uuid
from datetime import datetime, timezone

import pytest
import requests


# ---- auth ----
class TestAuth:
    def test_login_qc(self, api_base):
        r = requests.post(f"{api_base}/auth/login",
                          json={"email": "qc@qc.com", "password": "Qcuser@12345"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and d["user"]["role"] == "qc_executive"

    def test_login_admin(self, api_base):
        r = requests.post(f"{api_base}/auth/login",
                          json={"email": "admin@qc.com", "password": "Admin@12345"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_login_bad(self, api_base):
        r = requests.post(f"{api_base}/auth/login",
                          json={"email": "qc@qc.com", "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_register_public_qc_role(self, api_base):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@qc.com"
        r = requests.post(f"{api_base}/auth/register",
                          json={"name": "TEST User", "email": email, "password": "Passw0rd!"},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "qc_executive"

    def test_me_requires_auth(self, api_base):
        r = requests.get(f"{api_base}/auth/me", timeout=30)
        assert r.status_code in (401, 403)

    def test_me_returns_user(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/auth/me", headers=qc_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == "qc@qc.com"


# ---- products / checklist ----
class TestProducts:
    def test_list(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/products", headers=qc_headers, timeout=30)
        assert r.status_code == 200
        names = [p["product_name"] for p in r.json()]
        assert "Honey Cake" in names

    def test_search(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/products?search=honey", headers=qc_headers, timeout=30)
        assert r.status_code == 200
        assert any("honey" in p["product_name"].lower() for p in r.json())

    def test_checklist(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/products", headers=qc_headers, timeout=30)
        hc = next(p for p in r.json() if p["product_name"] == "Honey Cake")
        r2 = requests.get(f"{api_base}/products/{hc['id']}/checklist",
                          headers=qc_headers, timeout=30)
        assert r2.status_code == 200
        d = r2.json()
        assert d["template"]["active"] is True
        assert len(d["items"]) >= 10 and len(d["ccps"]) >= 3
        net = next(i for i in d["items"] if i["parameter_name"] == "Net Weight")
        assert net["minimum_value"] == 490 and net["maximum_value"] == 510

    def test_get_product_404(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/products/does-not-exist",
                         headers=qc_headers, timeout=30)
        assert r.status_code == 404


# ---- inspection lifecycle ----
@pytest.fixture(scope="module")
def honey_cake(api_base):
    tok = requests.post(f"{api_base}/auth/login",
                        json={"email": "qc@qc.com", "password": "Qcuser@12345"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    prods = requests.get(f"{api_base}/products", headers=h).json()
    hc = next(p for p in prods if p["product_name"] == "Honey Cake")
    chk = requests.get(f"{api_base}/products/{hc['id']}/checklist", headers=h).json()
    return hc, chk


class TestInspectionFlow:
    def _create(self, api_base, qc_headers, product_id, batch=None):
        payload = {
            "product_id": product_id,
            "batch_number": batch or f"TEST-{uuid.uuid4().hex[:6]}",
            "production_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "shift": "A",
            "production_line": "L1",
        }
        r = requests.post(f"{api_base}/inspections", json=payload,
                          headers=qc_headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_snapshots_checklist(self, api_base, qc_headers, honey_cake):
        hc, chk = honey_cake
        insp = self._create(api_base, qc_headers, hc["id"])
        assert insp["status"] == "in_progress"
        assert insp["snapshot"]["items"] and insp["snapshot"]["ccps"]
        assert insp["checklist_version"] == 1

    def test_numeric_pass(self, api_base, qc_headers, honey_cake):
        hc, chk = honey_cake
        insp = self._create(api_base, qc_headers, hc["id"])
        nw = next(i for i in chk["items"] if i["parameter_name"] == "Net Weight")
        r = requests.put(f"{api_base}/inspections/{insp['id']}/results",
                         json={"item_id": nw["id"], "numeric_value": 503},
                         headers=qc_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["result"] == "PASS"

    def test_numeric_fail(self, api_base, qc_headers, honey_cake):
        hc, chk = honey_cake
        insp = self._create(api_base, qc_headers, hc["id"])
        nw = next(i for i in chk["items"] if i["parameter_name"] == "Net Weight")
        r = requests.put(f"{api_base}/inspections/{insp['id']}/results",
                         json={"item_id": nw["id"], "numeric_value": 482},
                         headers=qc_headers, timeout=30)
        assert r.status_code == 200 and r.json()["result"] == "FAIL"

    def test_ccp_reading_pass_and_append(self, api_base, qc_headers, honey_cake):
        hc, chk = honey_cake
        insp = self._create(api_base, qc_headers, hc["id"])
        bake = next(c for c in chk["ccps"] if c["name"] == "Baking Temperature")
        r1 = requests.post(f"{api_base}/inspections/{insp['id']}/ccp-readings",
                           json={"ccp_id": bake["id"], "reading_time": "08:00",
                                 "actual_value": 180},
                           headers=qc_headers, timeout=30)
        assert r1.status_code == 200 and r1.json()["result"] == "PASS"
        r2 = requests.post(f"{api_base}/inspections/{insp['id']}/ccp-readings",
                           json={"ccp_id": bake["id"], "reading_time": "08:30",
                                 "actual_value": 200},
                           headers=qc_headers, timeout=30)
        assert r2.status_code == 200 and r2.json()["result"] == "FAIL"
        # Verify append semantics via GET
        got = requests.get(f"{api_base}/inspections/{insp['id']}",
                           headers=qc_headers, timeout=30).json()
        assert len(got["ccp_readings"]) == 2

    def test_submit_computes_fail_and_locks(self, api_base, qc_headers, honey_cake):
        hc, chk = honey_cake
        insp = self._create(api_base, qc_headers, hc["id"])
        nw = next(i for i in chk["items"] if i["parameter_name"] == "Net Weight")
        requests.put(f"{api_base}/inspections/{insp['id']}/results",
                     json={"item_id": nw["id"], "numeric_value": 480,
                           "corrective_action": {"issue": "Underweight", "status": "Open"}},
                     headers=qc_headers, timeout=30)
        sub = requests.post(f"{api_base}/inspections/{insp['id']}/submit",
                            json={"remarks": "TEST"}, headers=qc_headers, timeout=30)
        assert sub.status_code == 200
        assert sub.json()["overall_result"] == "FAIL"
        # cannot modify after submit
        r = requests.put(f"{api_base}/inspections/{insp['id']}/results",
                         json={"item_id": nw["id"], "numeric_value": 500},
                         headers=qc_headers, timeout=30)
        assert r.status_code == 400
        r2 = requests.post(f"{api_base}/inspections/{insp['id']}/submit",
                           json={"remarks": "again"}, headers=qc_headers, timeout=30)
        assert r2.status_code == 400

    def test_submit_pass_when_all_pass(self, api_base, qc_headers, honey_cake):
        hc, chk = honey_cake
        insp = self._create(api_base, qc_headers, hc["id"])
        nw = next(i for i in chk["items"] if i["parameter_name"] == "Net Weight")
        requests.put(f"{api_base}/inspections/{insp['id']}/results",
                     json={"item_id": nw["id"], "numeric_value": 500},
                     headers=qc_headers, timeout=30)
        sub = requests.post(f"{api_base}/inspections/{insp['id']}/submit",
                            json={}, headers=qc_headers, timeout=30).json()
        assert sub["overall_result"] == "PASS"


# ---- role scoping ----
class TestRoleScoping:
    def test_admin_sees_qc_inspection(self, api_base, qc_headers, admin_headers, honey_cake):
        hc, _ = honey_cake
        insp = requests.post(f"{api_base}/inspections",
                             json={"product_id": hc["id"],
                                   "batch_number": f"TEST-scope-{uuid.uuid4().hex[:6]}",
                                   "production_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                                   "shift": "B"},
                             headers=qc_headers, timeout=30).json()
        r = requests.get(f"{api_base}/inspections/{insp['id']}",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_qc_cannot_see_others(self, api_base, admin_headers):
        # register a fresh qc user and create an inspection with admin acting
        email = f"TEST_other_{uuid.uuid4().hex[:8]}@qc.com"
        reg = requests.post(f"{api_base}/auth/register",
                            json={"name": "TEST Other", "email": email,
                                  "password": "Passw0rd!"}, timeout=30).json()
        other_headers = {"Authorization": f"Bearer {reg['access_token']}"}
        prods = requests.get(f"{api_base}/products", headers=other_headers).json()
        hc = next(p for p in prods if p["product_name"] == "Honey Cake")
        insp = requests.post(f"{api_base}/inspections",
                             json={"product_id": hc["id"],
                                   "batch_number": f"TEST-o-{uuid.uuid4().hex[:6]}",
                                   "production_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                                   "shift": "A"},
                             headers=other_headers, timeout=30).json()
        # qc executive (seeded) must NOT see this record
        tok = requests.post(f"{api_base}/auth/login",
                            json={"email": "qc@qc.com", "password": "Qcuser@12345"}).json()["access_token"]
        r = requests.get(f"{api_base}/inspections/{insp['id']}",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 403


# ---- dashboard & report ----
class TestReports:
    def test_dashboard_today(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/dashboard/stats", headers=qc_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("inspections_completed", "inspections_in_progress",
                  "products_inspected", "total_checks",
                  "passed_inspections", "failed_inspections",
                  "open_corrective_actions"):
            assert k in d

    def test_daily_report(self, api_base, qc_headers):
        r = requests.get(f"{api_base}/reports/daily", headers=qc_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "header" in d and "production_summary" in d and "qc_summary" in d
        assert "ccp_summary" in d and "product_summary" in d


# ---- upload / file ----
class TestUpload:
    def test_upload_and_fetch(self, api_base, qc_headers, qc_token):
        # 1x1 PNG
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00"
               b"\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc"
               b"\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x5b\x8d\x64\xe8\x00\x00\x00"
               b"\x00IEND\xaeB`\x82")
        files = {"file": ("t.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{api_base}/upload", files=files,
                          headers=qc_headers, timeout=60)
        if r.status_code == 502:
            pytest.skip(f"Storage unavailable: {r.text}")
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        # fetch via token query
        r2 = requests.get(f"{api_base}/files/{path}?token={qc_token}", timeout=30)
        assert r2.status_code == 200
        assert r2.content.startswith(b"\x89PNG")

    def test_files_requires_auth(self, api_base):
        r = requests.get(f"{api_base}/files/some/fake/path", timeout=30)
        assert r.status_code == 401
