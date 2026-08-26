import requests

BASE = "https://qc-checklist-hub.preview.emergentagent.com/api"


def login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def test_pdf_export():
    tok = login("admin@qc.com", "Admin@12345")
    h = {"Authorization": f"Bearer {tok}"}
    insp = requests.get(f"{BASE}/inspections", headers=h, timeout=30).json()
    date = insp[0]["production_date"] if insp else None
    r = requests.post(f"{BASE}/reports/daily/pdf" + (f"?date={date}" if date else ""), headers=h, timeout=180)
    print(r.status_code, r.text[:400])
    r.raise_for_status()
    data = r.json()
    dl = requests.get(BASE.replace("/api", "") + data["share_path"], timeout=60)
    assert dl.status_code == 200 and dl.content[:4] == b"%PDF", dl.status_code
    print("PDF bytes:", len(dl.content), "photos:", data["photo_count"], "date:", date)
    open("/tmp/report.pdf", "wb").write(dl.content)


if __name__ == "__main__":
    test_pdf_export()
