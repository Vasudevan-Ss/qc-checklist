"""Admin RBAC + product/checklist/CCP management tests (new feature)."""
import uuid

import requests


# ---- RBAC: qc_executive must be rejected on admin routes ----
class TestAdminRBAC:
    def _prod_id(self, api_base, admin_headers):
        r = requests.get(f"{api_base}/products", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        return r.json()[0]["id"]

    def test_qc_cannot_create_product(self, api_base, qc_headers):
        payload = {"product_code": f"TEST-{uuid.uuid4().hex[:6]}",
                   "product_name": "TEST Denied"}
        r = requests.post(f"{api_base}/products", json=payload,
                          headers=qc_headers, timeout=30)
        assert r.status_code == 403

    def test_qc_cannot_update_product(self, api_base, qc_headers, admin_headers):
        pid = self._prod_id(api_base, admin_headers)
        r = requests.put(f"{api_base}/products/{pid}",
                         json={"product_code": "X", "product_name": "X"},
                         headers=qc_headers, timeout=30)
        assert r.status_code == 403

    def test_qc_cannot_add_checklist_item(self, api_base, qc_headers, admin_headers):
        pid = self._prod_id(api_base, admin_headers)
        r = requests.post(f"{api_base}/products/{pid}/checklist-items",
                          json={"parameter_name": "X", "parameter_type": "passfail"},
                          headers=qc_headers, timeout=30)
        assert r.status_code == 403

    def test_qc_cannot_update_or_delete_item(self, api_base, qc_headers):
        # Any random id — RBAC must trip before existence check
        r1 = requests.put(f"{api_base}/checklist-items/does-not-exist",
                          json={"parameter_name": "X", "parameter_type": "passfail"},
                          headers=qc_headers, timeout=30)
        r2 = requests.delete(f"{api_base}/checklist-items/does-not-exist",
                             headers=qc_headers, timeout=30)
        assert r1.status_code == 403
        assert r2.status_code == 403

    def test_qc_cannot_add_ccp(self, api_base, qc_headers, admin_headers):
        pid = self._prod_id(api_base, admin_headers)
        r = requests.post(f"{api_base}/products/{pid}/ccps",
                          json={"ccp_number": "CCP-X", "name": "TEST"},
                          headers=qc_headers, timeout=30)
        assert r.status_code == 403

    def test_qc_cannot_update_or_delete_ccp(self, api_base, qc_headers):
        r1 = requests.put(f"{api_base}/ccps/does-not-exist",
                          json={"ccp_number": "X", "name": "X"},
                          headers=qc_headers, timeout=30)
        r2 = requests.delete(f"{api_base}/ccps/does-not-exist",
                             headers=qc_headers, timeout=30)
        assert r1.status_code == 403
        assert r2.status_code == 403

    def test_include_inactive_admin_only(self, api_base, qc_headers, admin_headers):
        # Non-admin: include_inactive must be ignored -> only active products
        r_qc = requests.get(f"{api_base}/products?include_inactive=1",
                            headers=qc_headers, timeout=30)
        assert r_qc.status_code == 200
        assert all(p.get("active", True) for p in r_qc.json())
        # Admin still gets 200 (may or may not have inactive rows)
        r_ad = requests.get(f"{api_base}/products?include_inactive=1",
                            headers=admin_headers, timeout=30)
        assert r_ad.status_code == 200


# ---- Admin CRUD: product + auto template + items + ccps ----
class TestAdminCRUD:
    def test_full_admin_flow(self, api_base, admin_headers):
        code = f"TEST-{uuid.uuid4().hex[:6]}"
        # 1) Create product (admin)
        p = requests.post(f"{api_base}/products",
                          json={
                              "product_code": code,
                              "product_name": "TEST Cookie",
                              "category": "Bakery",
                              "standard_weight": 100,
                              "weight_tolerance": 5,
                              "active": True,
                          },
                          headers=admin_headers, timeout=30)
        assert p.status_code == 200, p.text
        prod = p.json()
        pid = prod["id"]
        assert prod["product_code"] == code

        # 2) GET checklist -> template auto-created (version 1, active), 0 items/ccps
        chk = requests.get(f"{api_base}/products/{pid}/checklist",
                           headers=admin_headers, timeout=30)
        assert chk.status_code == 200
        d = chk.json()
        assert d["template"]["version"] == 1 and d["template"]["active"] is True
        assert d["items"] == [] and d["ccps"] == []

        # 3) Add checklist items covering multiple param types
        variants = [
            {"parameter_name": "TEST Net Weight", "parameter_type": "numeric",
             "unit": "g", "minimum_value": 95, "maximum_value": 105, "sequence": 1},
            {"parameter_name": "TEST Colour OK", "parameter_type": "passfail",
             "sequence": 2},
            {"parameter_name": "TEST Packaging Intact", "parameter_type": "yesno",
             "sequence": 3},
            {"parameter_name": "TEST Flavour", "parameter_type": "dropdown",
             "options": ["Vanilla", "Chocolate"], "sequence": 4},
            {"parameter_name": "TEST Notes", "parameter_type": "text", "sequence": 5},
        ]
        created_items = []
        for v in variants:
            r = requests.post(f"{api_base}/products/{pid}/checklist-items",
                              json=v, headers=admin_headers, timeout=30)
            assert r.status_code == 200, r.text
            item = r.json()
            assert item["parameter_name"] == v["parameter_name"]
            created_items.append(item)

        # 4) Add CCP with critical limits
        ccp_r = requests.post(f"{api_base}/products/{pid}/ccps",
                              json={"ccp_number": "CCP-T1",
                                    "name": "TEST Baking Temp",
                                    "critical_limit_min": 170,
                                    "critical_limit_max": 190,
                                    "unit": "C"},
                              headers=admin_headers, timeout=30)
        assert ccp_r.status_code == 200
        ccp = ccp_r.json()
        assert ccp["critical_limit_min"] == 170 and ccp["critical_limit_max"] == 190

        # 5) GET checklist to verify persistence & shape
        chk2 = requests.get(f"{api_base}/products/{pid}/checklist",
                            headers=admin_headers, timeout=30).json()
        assert len(chk2["items"]) == len(variants)
        assert len(chk2["ccps"]) == 1
        nw = next(i for i in chk2["items"] if i["parameter_name"] == "TEST Net Weight")
        assert nw["minimum_value"] == 95 and nw["maximum_value"] == 105

        # 6) Edit an item -> verify via GET
        edit = requests.put(f"{api_base}/checklist-items/{created_items[0]['id']}",
                            json={"parameter_name": "TEST Net Weight",
                                  "parameter_type": "numeric", "unit": "g",
                                  "minimum_value": 90, "maximum_value": 110,
                                  "sequence": 1},
                            headers=admin_headers, timeout=30)
        assert edit.status_code == 200
        assert edit.json()["minimum_value"] == 90

        # 7) Edit CCP -> verify via GET
        ecp = requests.put(f"{api_base}/ccps/{ccp['id']}",
                           json={"ccp_number": "CCP-T1",
                                 "name": "TEST Baking Temp",
                                 "critical_limit_min": 175,
                                 "critical_limit_max": 185,
                                 "unit": "C"},
                           headers=admin_headers, timeout=30)
        assert ecp.status_code == 200
        assert ecp.json()["critical_limit_min"] == 175

        # 8) Delete last item and delete CCP -> verify counts
        del_item = requests.delete(f"{api_base}/checklist-items/{created_items[-1]['id']}",
                                   headers=admin_headers, timeout=30)
        assert del_item.status_code == 200
        del_ccp = requests.delete(f"{api_base}/ccps/{ccp['id']}",
                                  headers=admin_headers, timeout=30)
        assert del_ccp.status_code == 200

        chk3 = requests.get(f"{api_base}/products/{pid}/checklist",
                            headers=admin_headers, timeout=30).json()
        assert len(chk3["items"]) == len(variants) - 1
        assert chk3["ccps"] == []

        # 9) Update product itself
        up = requests.put(f"{api_base}/products/{pid}",
                          json={
                              "product_code": code,
                              "product_name": "TEST Cookie v2",
                              "category": "Snacks",
                              "active": False,
                          },
                          headers=admin_headers, timeout=30)
        assert up.status_code == 200
        assert up.json()["product_name"] == "TEST Cookie v2"
        assert up.json()["active"] is False

    def test_duplicate_product_code_conflict(self, api_base, admin_headers):
        code = f"TEST-{uuid.uuid4().hex[:6]}"
        base = {"product_code": code, "product_name": "TEST Dup"}
        r1 = requests.post(f"{api_base}/products", json=base,
                           headers=admin_headers, timeout=30)
        assert r1.status_code == 200
        r2 = requests.post(f"{api_base}/products", json=base,
                           headers=admin_headers, timeout=30)
        assert r2.status_code == 409

    def test_404_on_missing_item_or_ccp(self, api_base, admin_headers):
        r1 = requests.put(f"{api_base}/checklist-items/nope",
                          json={"parameter_name": "X", "parameter_type": "passfail"},
                          headers=admin_headers, timeout=30)
        r2 = requests.delete(f"{api_base}/checklist-items/nope",
                             headers=admin_headers, timeout=30)
        r3 = requests.put(f"{api_base}/ccps/nope",
                          json={"ccp_number": "X", "name": "X"},
                          headers=admin_headers, timeout=30)
        r4 = requests.delete(f"{api_base}/ccps/nope",
                             headers=admin_headers, timeout=30)
        assert r1.status_code == 404
        assert r2.status_code == 404
        assert r3.status_code == 404
        assert r4.status_code == 404
