from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import uuid
import bcrypt
import jwt
import requests
from pathlib import Path
from pdf_report import build_daily_pdf, default_filename
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "qc-inspect"

app = FastAPI(title="QC Inspect API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Object storage helpers (sync -> run in threadpool)
# ---------------------------------------------------------------------------
_storage_key: Optional[str] = None


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str):
    global _storage_key
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(hours=JWT_EXPIRE_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except Exception:
        return None


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_token(creds.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    department: Optional[str] = "Quality Control"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BatchIn(BaseModel):
    product_id: str
    batch_number: str
    production_date: str  # YYYY-MM-DD
    shift: str
    production_line: Optional[str] = None
    machine: Optional[str] = None
    operator: Optional[str] = None
    start_time: Optional[str] = None


class CorrectiveAction(BaseModel):
    issue: Optional[str] = None
    root_cause: Optional[str] = None
    corrective_action: Optional[str] = None
    responsible_person: Optional[str] = None
    status: str = "Open"


class ResultIn(BaseModel):
    item_id: str
    value: Optional[Any] = None
    numeric_value: Optional[float] = None
    result: Optional[str] = None  # PASS / FAIL / NA
    remarks: Optional[str] = None
    photo_path: Optional[str] = None
    corrective_action: Optional[CorrectiveAction] = None


class CcpReadingIn(BaseModel):
    ccp_id: str
    reading_time: str
    actual_value: float
    remarks: Optional[str] = None
    corrective_action: Optional[CorrectiveAction] = None
    photo_path: Optional[str] = None


class SubmitIn(BaseModel):
    remarks: Optional[str] = None


# ---------------------------------------------------------------------------
# Evaluation helpers
# ---------------------------------------------------------------------------
def eval_numeric(value: Optional[float], mn: Optional[float], mx: Optional[float]) -> str:
    if value is None:
        return "NA"
    if mn is not None and value < mn:
        return "FAIL"
    if mx is not None and value > mx:
        return "FAIL"
    return "PASS"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def audit(action: str, entity: str, entity_id: str, user: dict, before=None, after=None):
    await db.audit_trail.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "before": before,
        "after": after,
        "timestamp": now_iso(),
    })


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(data: RegisterIn):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "email": data.email.lower(),
        "hashed_password": hash_password(data.password),
        "role": "qc_executive",  # public registration is always QC Executive
        "department": data.department or "Quality Control",
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"])
    public = {k: user[k] for k in ("id", "name", "email", "role", "department", "active")}
    return {"access_token": token, "user": public}


@api_router.post("/auth/login")
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=401, detail="Account disabled")
    token = create_token(user["id"])
    public = {k: user[k] for k in ("id", "name", "email", "role", "department", "active")}
    return {"access_token": token, "user": public}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Products & checklist
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products(search: Optional[str] = None, include_inactive: bool = False,
                        user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if not (include_inactive and user["role"] == "admin"):
        q["active"] = True
    if search:
        q["$or"] = [
            {"product_name": {"$regex": search, "$options": "i"}},
            {"product_code": {"$regex": search, "$options": "i"}},
            {"category": {"$regex": search, "$options": "i"}},
        ]
    products = await db.products.find(q, {"_id": 0}).sort("product_name", 1).to_list(500)
    return products


@api_router.get("/products/{product_id}")
async def get_product(product_id: str, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return p


@api_router.get("/products/{product_id}/checklist")
async def get_checklist(product_id: str, user: dict = Depends(get_current_user)):
    template = await db.checklist_templates.find_one(
        {"product_id": product_id, "active": True}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="No checklist configured for this product")
    items = await db.checklist_items.find(
        {"checklist_template_id": template["id"]}, {"_id": 0}).sort("sequence", 1).to_list(500)
    ccps = await db.ccps.find(
        {"product_id": product_id, "active": True}, {"_id": 0}).sort("ccp_number", 1).to_list(200)
    return {"template": template, "items": items, "ccps": ccps}


# ---------------------------------------------------------------------------
# Admin: product / checklist / CCP management
# ---------------------------------------------------------------------------
class ProductIn(BaseModel):
    product_code: str
    product_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    standard_weight: Optional[float] = None
    weight_tolerance: Optional[float] = None
    standard_dimensions: Optional[str] = None
    dimension_tolerance: Optional[float] = None
    shelf_life: Optional[str] = None
    storage_condition: Optional[str] = None
    packaging_type: Optional[str] = None
    active: bool = True


class ChecklistItemIn(BaseModel):
    parameter_name: str
    parameter_type: str  # passfail | numeric | dropdown | text | datetime | photo | yesno
    section: str = "Finished Product"
    unit: Optional[str] = None
    minimum_value: Optional[float] = None
    maximum_value: Optional[float] = None
    options: Optional[List[str]] = None
    is_required: bool = True
    requires_photo: bool = False
    sequence: int = 0


class CcpIn(BaseModel):
    ccp_number: str
    name: str
    process_step: Optional[str] = None
    hazard: Optional[str] = None
    critical_limit_min: Optional[float] = None
    critical_limit_max: Optional[float] = None
    unit: Optional[str] = None
    monitoring_frequency: Optional[str] = None
    corrective_action: Optional[str] = None
    active: bool = True


async def _template_for(product_id: str) -> dict:
    template = await db.checklist_templates.find_one(
        {"product_id": product_id, "active": True}, {"_id": 0})
    if not template:
        template = {
            "id": str(uuid.uuid4()), "product_id": product_id,
            "name": "QC Checklist", "version": 1, "active": True, "created_at": now_iso(),
        }
        await db.checklist_templates.insert_one(dict(template))
    return template


@api_router.post("/products")
async def create_product(data: ProductIn, user: dict = Depends(require_roles("admin"))):
    existing = await db.products.find_one({"product_code": data.product_code})
    if existing:
        raise HTTPException(status_code=409, detail="Product code already exists")
    product = {"id": str(uuid.uuid4()), **data.dict(), "photo_url": None, "created_at": now_iso()}
    await db.products.insert_one(dict(product))
    await _template_for(product["id"])
    await audit("create", "product", product["id"], user, after={"code": data.product_code})
    product.pop("_id", None)
    return product


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductIn, user: dict = Depends(require_roles("admin"))):
    before = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.products.update_one({"id": product_id}, {"$set": data.dict()})
    await audit("update", "product", product_id, user, before=before, after=data.dict())
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api_router.post("/products/{product_id}/checklist-items")
async def add_checklist_item(product_id: str, data: ChecklistItemIn, user: dict = Depends(require_roles("admin"))):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    template = await _template_for(product_id)
    item = {
        "id": str(uuid.uuid4()), "checklist_template_id": template["id"],
        **data.dict(), "created_at": now_iso(),
    }
    await db.checklist_items.insert_one(dict(item))
    await audit("create", "checklist_item", item["id"], user, after={"name": data.parameter_name})
    item.pop("_id", None)
    return item


@api_router.put("/checklist-items/{item_id}")
async def update_checklist_item(item_id: str, data: ChecklistItemIn, user: dict = Depends(require_roles("admin"))):
    before = await db.checklist_items.find_one({"id": item_id}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    await db.checklist_items.update_one({"id": item_id}, {"$set": data.dict()})
    await audit("update", "checklist_item", item_id, user, before=before, after=data.dict())
    return await db.checklist_items.find_one({"id": item_id}, {"_id": 0})


@api_router.delete("/checklist-items/{item_id}")
async def delete_checklist_item(item_id: str, user: dict = Depends(require_roles("admin"))):
    res = await db.checklist_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    await audit("delete", "checklist_item", item_id, user)
    return {"deleted": True}


@api_router.post("/products/{product_id}/ccps")
async def add_ccp(product_id: str, data: CcpIn, user: dict = Depends(require_roles("admin"))):
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ccp = {"id": str(uuid.uuid4()), "product_id": product_id, **data.dict(), "created_at": now_iso()}
    await db.ccps.insert_one(dict(ccp))
    await audit("create", "ccp", ccp["id"], user, after={"name": data.name})
    ccp.pop("_id", None)
    return ccp


@api_router.put("/ccps/{ccp_id}")
async def update_ccp(ccp_id: str, data: CcpIn, user: dict = Depends(require_roles("admin"))):
    before = await db.ccps.find_one({"id": ccp_id}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="CCP not found")
    await db.ccps.update_one({"id": ccp_id}, {"$set": data.dict()})
    await audit("update", "ccp", ccp_id, user, before=before, after=data.dict())
    return await db.ccps.find_one({"id": ccp_id}, {"_id": 0})


@api_router.delete("/ccps/{ccp_id}")
async def delete_ccp(ccp_id: str, user: dict = Depends(require_roles("admin"))):
    res = await db.ccps.delete_one({"id": ccp_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="CCP not found")
    await audit("delete", "ccp", ccp_id, user)
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Inspections
# ---------------------------------------------------------------------------
async def _load_inspection_or_404(inspection_id: str) -> dict:
    insp = await db.inspections.find_one({"id": inspection_id}, {"_id": 0})
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return insp


def _compute_overall(insp: dict) -> str:
    for r in insp.get("results", []):
        if r.get("result") == "FAIL":
            return "FAIL"
    for rd in insp.get("ccp_readings", []):
        if rd.get("result") == "FAIL":
            return "FAIL"
    return "PASS"


@api_router.post("/inspections")
async def create_inspection(data: BatchIn, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    template = await db.checklist_templates.find_one(
        {"product_id": data.product_id, "active": True}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="No checklist configured for this product")
    items = await db.checklist_items.find(
        {"checklist_template_id": template["id"]}, {"_id": 0}).sort("sequence", 1).to_list(500)
    ccps = await db.ccps.find(
        {"product_id": data.product_id, "active": True}, {"_id": 0}).sort("ccp_number", 1).to_list(200)

    insp = {
        "id": str(uuid.uuid4()),
        "product_id": product["id"],
        "product_name": product["product_name"],
        "product_code": product.get("product_code"),
        "batch_number": data.batch_number,
        "production_date": data.production_date,
        "shift": data.shift,
        "production_line": data.production_line,
        "machine": data.machine,
        "operator": data.operator,
        "qc_user_id": user["id"],
        "qc_user_name": user["name"],
        "start_time": data.start_time or now_iso(),
        "end_time": None,
        "status": "in_progress",
        "overall_result": None,
        "remarks": None,
        "checklist_template_id": template["id"],
        "checklist_version": template.get("version", 1),
        # audit-safe snapshot of the checklist at inspection time
        "snapshot": {"items": items, "ccps": ccps},
        "results": [],
        "ccp_readings": [],
        "created_at": now_iso(),
    }
    await db.inspections.insert_one(insp)
    await audit("create", "inspection", insp["id"], user, after={"batch": data.batch_number})
    insp.pop("_id", None)
    return insp


@api_router.get("/inspections")
async def list_inspections(
    date: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product_id: Optional[str] = None,
    batch_number: Optional[str] = None,
    shift: Optional[str] = None,
    result: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    # QC executives only see their own records; admins see all
    if user["role"] != "admin":
        q["qc_user_id"] = user["id"]
    if date:
        q["production_date"] = date
    if date_from or date_to:
        rng: Dict[str, Any] = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        q["production_date"] = rng
    if product_id:
        q["product_id"] = product_id
    if batch_number:
        q["batch_number"] = {"$regex": batch_number, "$options": "i"}
    if shift:
        q["shift"] = shift
    if result:
        q["overall_result"] = result
    if status:
        q["status"] = status
    docs = await db.inspections.find(q, {"_id": 0, "snapshot": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for d in docs:
        total = len(d.get("results", [])) + len(d.get("ccp_readings", []))
        passed = sum(1 for r in d.get("results", []) if r.get("result") == "PASS") + \
            sum(1 for r in d.get("ccp_readings", []) if r.get("result") == "PASS")
        failed = sum(1 for r in d.get("results", []) if r.get("result") == "FAIL") + \
            sum(1 for r in d.get("ccp_readings", []) if r.get("result") == "FAIL")
        d["total_checks"] = total
        d["passed_checks"] = passed
        d["failed_checks"] = failed
        d.pop("results", None)
        d.pop("ccp_readings", None)
        out.append(d)
    return out


@api_router.get("/inspections/{inspection_id}")
async def get_inspection(inspection_id: str, user: dict = Depends(get_current_user)):
    insp = await _load_inspection_or_404(inspection_id)
    if user["role"] != "admin" and insp["qc_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this inspection")
    return insp


@api_router.put("/inspections/{inspection_id}/results")
async def upsert_result(inspection_id: str, data: ResultIn, user: dict = Depends(get_current_user)):
    insp = await _load_inspection_or_404(inspection_id)
    if insp["status"] == "submitted":
        raise HTTPException(status_code=400, detail="Inspection already submitted")
    item = next((i for i in insp["snapshot"]["items"] if i["id"] == data.item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    result = data.result
    if item["parameter_type"] == "numeric":
        result = eval_numeric(data.numeric_value, item.get("minimum_value"), item.get("maximum_value"))

    record = {
        "item_id": data.item_id,
        "parameter_name": item["parameter_name"],
        "section": item.get("section"),
        "value": data.value,
        "numeric_value": data.numeric_value,
        "unit": item.get("unit"),
        "result": result,
        "remarks": data.remarks,
        "photo_path": data.photo_path,
        "corrective_action": data.corrective_action.dict() if data.corrective_action else None,
        "updated_at": now_iso(),
    }
    results = [r for r in insp.get("results", []) if r["item_id"] != data.item_id]
    results.append(record)
    await db.inspections.update_one({"id": inspection_id}, {"$set": {"results": results}})
    return record


@api_router.post("/inspections/{inspection_id}/ccp-readings")
async def add_ccp_reading(inspection_id: str, data: CcpReadingIn, user: dict = Depends(get_current_user)):
    insp = await _load_inspection_or_404(inspection_id)
    if insp["status"] == "submitted":
        raise HTTPException(status_code=400, detail="Inspection already submitted")
    ccp = next((c for c in insp["snapshot"]["ccps"] if c["id"] == data.ccp_id), None)
    if not ccp:
        raise HTTPException(status_code=404, detail="CCP not found")
    result = eval_numeric(data.actual_value, ccp.get("critical_limit_min"), ccp.get("critical_limit_max"))
    reading = {
        "id": str(uuid.uuid4()),
        "ccp_id": data.ccp_id,
        "ccp_name": ccp["name"],
        "ccp_number": ccp.get("ccp_number"),
        "reading_time": data.reading_time,
        "actual_value": data.actual_value,
        "unit": ccp.get("unit"),
        "critical_limit_min": ccp.get("critical_limit_min"),
        "critical_limit_max": ccp.get("critical_limit_max"),
        "result": result,
        "remarks": data.remarks,
        "corrective_action": data.corrective_action.dict() if data.corrective_action else None,
        "photo_path": data.photo_path,
        "created_at": now_iso(),
    }
    # append only — never overwrite previous readings (audit traceability)
    await db.inspections.update_one({"id": inspection_id}, {"$push": {"ccp_readings": reading}})
    return reading


@api_router.post("/inspections/{inspection_id}/submit")
async def submit_inspection(inspection_id: str, data: SubmitIn, user: dict = Depends(get_current_user)):
    insp = await _load_inspection_or_404(inspection_id)
    if insp["status"] == "submitted":
        raise HTTPException(status_code=400, detail="Inspection already submitted")
    overall = _compute_overall(insp)
    update = {
        "status": "submitted",
        "overall_result": overall,
        "end_time": now_iso(),
        "remarks": data.remarks,
    }
    await db.inspections.update_one({"id": inspection_id}, {"$set": update})
    await audit("submit", "inspection", inspection_id, user, after={"overall_result": overall})
    insp.update(update)
    return insp


# ---------------------------------------------------------------------------
# Dashboard & reports
# ---------------------------------------------------------------------------
@api_router.get("/dashboard/stats")
async def dashboard_stats(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    q: Dict[str, Any] = {"production_date": date}
    if user["role"] != "admin":
        q["qc_user_id"] = user["id"]
    docs = await db.inspections.find(q, {"_id": 0}).to_list(2000)
    submitted = [d for d in docs if d.get("status") == "submitted"]
    products = {d["product_id"] for d in docs}
    total_checks = 0
    open_actions = 0
    passed = 0
    failed = 0
    for d in docs:
        total_checks += len(d.get("results", [])) + len(d.get("ccp_readings", []))
        for r in d.get("results", []) + d.get("ccp_readings", []):
            ca = r.get("corrective_action")
            if ca and ca.get("status") not in (None, "Verified", "Closed"):
                open_actions += 1
    for d in submitted:
        if d.get("overall_result") == "PASS":
            passed += 1
        elif d.get("overall_result") == "FAIL":
            failed += 1
    return {
        "date": date,
        "inspections_completed": len(submitted),
        "inspections_in_progress": len(docs) - len(submitted),
        "products_inspected": len(products),
        "total_checks": total_checks,
        "passed_inspections": passed,
        "failed_inspections": failed,
        "open_corrective_actions": open_actions,
    }


async def _build_daily_report(date: Optional[str], user: dict):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    q: Dict[str, Any] = {"production_date": date}
    if user["role"] != "admin":
        q["qc_user_id"] = user["id"]
    docs = await db.inspections.find(q, {"_id": 0}).sort("created_at", 1).to_list(2000)

    batches = {d["batch_number"] for d in docs}
    products = {d["product_id"] for d in docs}
    submitted = [d for d in docs if d.get("status") == "submitted"]
    passed = sum(1 for d in submitted if d.get("overall_result") == "PASS")
    failed = sum(1 for d in submitted if d.get("overall_result") == "FAIL")
    pending = len(docs) - len(submitted)

    ccp_monitored = ccp_passed = ccp_failed = 0
    nonconformances = []
    product_summary = []
    for d in docs:
        findings = []
        for rd in d.get("ccp_readings", []):
            ccp_monitored += 1
            if rd.get("result") == "PASS":
                ccp_passed += 1
            elif rd.get("result") == "FAIL":
                ccp_failed += 1
                findings.append(f"CCP {rd.get('ccp_name')} out of limit ({rd.get('actual_value')}{rd.get('unit') or ''})")
        for r in d.get("results", []):
            if r.get("result") == "FAIL":
                findings.append(f"{r.get('parameter_name')} FAIL")
                ca = r.get("corrective_action") or {}
                nonconformances.append({
                    "product": d["product_name"],
                    "batch": d["batch_number"],
                    "issue": ca.get("issue") or r.get("parameter_name"),
                    "corrective_action": ca.get("corrective_action") or r.get("remarks"),
                    "status": ca.get("status") or "Open",
                })
        for rd in d.get("ccp_readings", []):
            if rd.get("result") == "FAIL":
                ca = rd.get("corrective_action") or {}
                nonconformances.append({
                    "product": d["product_name"],
                    "batch": d["batch_number"],
                    "issue": ca.get("issue") or f"CCP {rd.get('ccp_name')} breach",
                    "corrective_action": ca.get("corrective_action") or rd.get("remarks"),
                    "status": ca.get("status") or "Open",
                })
        product_summary.append({
            "product": d["product_name"],
            "batch": d["batch_number"],
            "shift": d.get("shift"),
            "result": d.get("overall_result") or "PENDING",
            "findings": findings,
            "inspection_id": d["id"],
        })

    report = {
        "header": {"company": "QC Inspect", "department": "Quality Control Department", "date": date},
        "scope": "ALL INSPECTIONS" if user["role"] == "admin" else f"{user['name'].upper()} (OWN RECORDS)",
        "production_summary": {
            "products_inspected": len(products),
            "batches_inspected": len(batches),
            "total_inspections": len(docs),
        },
        "qc_summary": {"passed": passed, "failed": failed, "pending": pending},
        "ccp_summary": {"monitored": ccp_monitored, "passed": ccp_passed, "failed": ccp_failed},
        "product_summary": product_summary,
        "nonconformance_summary": nonconformances,
        "prepared_by": user["name"],
        "generated_at": now_iso(),
    }
    return report, docs


@api_router.get("/reports/daily")
async def daily_report(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    report, _ = await _build_daily_report(date, user)
    return report


@api_router.post("/reports/daily/pdf")
async def daily_report_pdf(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    report, docs = await _build_daily_report(date, user)
    report_date = report["header"]["date"]

    # collect photo evidence referenced by checks / CCP readings
    paths: List[str] = []
    for d in docs:
        for r in d.get("results", []) + d.get("ccp_readings", []):
            p = r.get("photo_path")
            if p and p not in paths:
                paths.append(p)
    photos: Dict[str, bytes] = {}
    for p in paths[:60]:
        try:
            content, _ct = await run_in_threadpool(_get_object, p)
            photos[p] = content
        except Exception:
            logger.warning("report photo missing: %s", p)

    try:
        pdf_bytes = await run_in_threadpool(build_daily_pdf, report, docs, photos)
    except Exception as e:
        logger.exception("pdf build failed")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = default_filename(report_date)
    storage_path = f"{APP_NAME}/reports/{uuid.uuid4()}.pdf"
    try:
        result = await run_in_threadpool(_put_object, storage_path, pdf_bytes, "application/pdf")
        storage_path = result.get("path", storage_path)
    except Exception as e:
        logger.exception("pdf upload failed")
        raise HTTPException(status_code=502, detail=f"PDF upload failed: {e}")

    token = uuid.uuid4().hex
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await db.report_exports.insert_one({
        "id": str(uuid.uuid4()),
        "token": token,
        "report_date": report_date,
        "filename": filename,
        "storage_path": storage_path,
        "created_by": user["id"],
        "created_by_name": user["name"],
        "size_bytes": len(pdf_bytes),
        "photo_count": len(photos),
        "created_at": now_iso(),
        "expires_at": expires_at,
    })
    await audit("export", "daily_report", token, user, after={"date": report_date})
    return {
        "token": token,
        "filename": filename,
        "share_path": f"/api/reports/shared/{token}",
        "size_bytes": len(pdf_bytes),
        "photo_count": len(photos),
        "expires_at": expires_at,
    }


@api_router.get("/reports/shared/{token}")
async def shared_report(token: str, download: int = 0):
    rec = await db.report_exports.find_one({"token": token})
    if not rec:
        raise HTTPException(status_code=404, detail="Report link not found")
    if rec.get("expires_at") and rec["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=410, detail="Report link has expired")
    content = None
    for attempt in range(4):
        try:
            content, _ct = await run_in_threadpool(_get_object, rec["storage_path"])
            break
        except Exception:
            if attempt == 3:
                raise HTTPException(status_code=404, detail="Report file not found")
            await asyncio.sleep(1.5)
    disp = "attachment" if download else "inline"
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disp}; filename="{rec["filename"]}"'})


@api_router.get("/reports/exports")
async def list_exports(date: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if date:
        q["report_date"] = date
    if user["role"] != "admin":
        q["created_by"] = user["id"]
    return await db.report_exports.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)


# ---------------------------------------------------------------------------
# Photo upload / serve
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "photo.jpg").split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    content_type = file.content_type or "image/jpeg"
    try:
        result = await run_in_threadpool(_put_object, path, data, content_type)
    except Exception as e:
        logger.exception("upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    await db.photographs.insert_one({
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "storage_path": result["path"],
        "created_at": now_iso(),
    })
    return {"path": result["path"]}


@api_router.get("/files/{path:path}")
async def serve_file(path: str, token: Optional[str] = Query(None),
                     creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    jwt_token = None
    if creds:
        jwt_token = creds.credentials
    elif token:
        jwt_token = token
    if not jwt_token or not decode_token(jwt_token):
        raise HTTPException(status_code=401, detail="Not authenticated")
    rec = await db.photographs.find_one({"storage_path": path})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content, content_type = await run_in_threadpool(_get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=content, media_type=content_type)


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
async def seed():
    if await db.users.find_one({"email": "admin@qc.com"}) is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "QC Admin", "email": "admin@qc.com",
            "hashed_password": hash_password("Admin@12345"), "role": "admin",
            "department": "Quality Control", "active": True, "created_at": now_iso(),
        })
        logger.info("Seeded admin user")
    if await db.users.find_one({"email": "qc@qc.com"}) is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "Ravi Kumar", "email": "qc@qc.com",
            "hashed_password": hash_password("Qcuser@12345"), "role": "qc_executive",
            "department": "Quality Control", "active": True, "created_at": now_iso(),
        })
        logger.info("Seeded QC executive user")

    if await db.products.count_documents({}) > 0:
        return

    def mk_item(tid, name, ptype, section, seq, unit=None, mn=None, mx=None,
                options=None, required=True, photo=False):
        return {
            "id": str(uuid.uuid4()), "checklist_template_id": tid, "parameter_name": name,
            "parameter_type": ptype, "unit": unit, "minimum_value": mn, "maximum_value": mx,
            "options": options, "is_required": required, "requires_photo": photo,
            "sequence": seq, "section": section, "created_at": now_iso(),
        }

    # ---- Honey Cake ----
    hc_id = str(uuid.uuid4())
    hc_tid = str(uuid.uuid4())
    await db.products.insert_one({
        "id": hc_id, "product_code": "HC-500", "product_name": "Honey Cake",
        "category": "Cakes", "description": "Classic honey sponge cake, 500g pack.",
        "standard_weight": 500, "weight_tolerance": 10, "standard_dimensions": "180 x 90 x 45 mm",
        "dimension_tolerance": 3, "shelf_life": "7 days", "storage_condition": "Ambient, dry",
        "packaging_type": "Flow wrap", "photo_url": None, "active": True, "created_at": now_iso(),
    })
    await db.checklist_templates.insert_one({
        "id": hc_tid, "product_id": hc_id, "name": "Honey Cake QC Checklist",
        "version": 1, "active": True, "created_at": now_iso(),
    })
    await db.ccps.insert_many([
        {"id": str(uuid.uuid4()), "product_id": hc_id, "ccp_number": "CCP-1", "name": "Baking Temperature",
         "process_step": "Baking", "hazard": "Undercooked product (microbial)",
         "critical_limit_min": 175, "critical_limit_max": 185, "unit": "°C",
         "monitoring_frequency": "Every 30 minutes", "corrective_action": "Adjust oven, re-bake / reject batch",
         "active": True, "created_at": now_iso()},
        {"id": str(uuid.uuid4()), "product_id": hc_id, "ccp_number": "CCP-2", "name": "Internal Temperature",
         "process_step": "Baking", "hazard": "Undercooked centre",
         "critical_limit_min": 95, "critical_limit_max": None, "unit": "°C",
         "monitoring_frequency": "Per batch", "corrective_action": "Extend bake time / reject",
         "active": True, "created_at": now_iso()},
        {"id": str(uuid.uuid4()), "product_id": hc_id, "ccp_number": "CCP-3", "name": "Metal Detector",
         "process_step": "Packing", "hazard": "Metal foreign body",
         "critical_limit_min": 1, "critical_limit_max": 1, "unit": "pass(1)/fail(0)",
         "monitoring_frequency": "Continuous", "corrective_action": "Isolate & reject affected units",
         "active": True, "created_at": now_iso()},
    ])
    await db.checklist_items.insert_many([
        mk_item(hc_tid, "Sponge Appearance", "passfail", "Finished Product", 1, photo=True),
        mk_item(hc_tid, "Sponge Colour", "dropdown", "Finished Product", 2,
                options=["Light Brown", "Golden Brown", "Dark Brown"]),
        mk_item(hc_tid, "Surface Free From Burning", "yesno", "Finished Product", 3),
        mk_item(hc_tid, "Sponge Height", "numeric", "Finished Product", 4, unit="mm", mn=40, mx=48),
        mk_item(hc_tid, "Net Weight", "numeric", "Finished Product", 5, unit="g", mn=490, mx=510),
        mk_item(hc_tid, "Length", "numeric", "Finished Product", 6, unit="mm", mn=177, mx=183),
        mk_item(hc_tid, "Width", "numeric", "Finished Product", 7, unit="mm", mn=87, mx=93),
        mk_item(hc_tid, "Packaging Seal Intact", "yesno", "Packaging", 8),
        mk_item(hc_tid, "Label Verification", "passfail", "Packaging", 9),
        mk_item(hc_tid, "Batch / Expiry Coding", "passfail", "Packaging", 10),
        mk_item(hc_tid, "Production Time", "datetime", "General", 11, required=False),
        mk_item(hc_tid, "General Observations", "text", "General", 12, required=False),
    ])

    # ---- Butter Croissant ----
    bc_id = str(uuid.uuid4())
    bc_tid = str(uuid.uuid4())
    await db.products.insert_one({
        "id": bc_id, "product_code": "BC-80", "product_name": "Butter Croissant",
        "category": "Viennoiserie", "description": "All-butter laminated croissant, 80g.",
        "standard_weight": 80, "weight_tolerance": 5, "standard_dimensions": "120 x 60 x 50 mm",
        "dimension_tolerance": 5, "shelf_life": "2 days", "storage_condition": "Ambient",
        "packaging_type": "Paper bag", "photo_url": None, "active": True, "created_at": now_iso(),
    })
    await db.checklist_templates.insert_one({
        "id": bc_tid, "product_id": bc_id, "name": "Butter Croissant QC Checklist",
        "version": 1, "active": True, "created_at": now_iso(),
    })
    await db.ccps.insert_many([
        {"id": str(uuid.uuid4()), "product_id": bc_id, "ccp_number": "CCP-1", "name": "Baking Temperature",
         "process_step": "Baking", "hazard": "Undercooked dough",
         "critical_limit_min": 190, "critical_limit_max": 210, "unit": "°C",
         "monitoring_frequency": "Every 30 minutes", "corrective_action": "Adjust oven / reject",
         "active": True, "created_at": now_iso()},
        {"id": str(uuid.uuid4()), "product_id": bc_id, "ccp_number": "CCP-2", "name": "Metal Detector",
         "process_step": "Packing", "hazard": "Metal foreign body",
         "critical_limit_min": 1, "critical_limit_max": 1, "unit": "pass(1)/fail(0)",
         "monitoring_frequency": "Continuous", "corrective_action": "Isolate & reject",
         "active": True, "created_at": now_iso()},
    ])
    await db.checklist_items.insert_many([
        mk_item(bc_tid, "Lamination / Flakiness", "passfail", "Finished Product", 1, photo=True),
        mk_item(bc_tid, "Colour", "dropdown", "Finished Product", 2,
                options=["Pale", "Golden", "Dark"]),
        mk_item(bc_tid, "Net Weight", "numeric", "Finished Product", 3, unit="g", mn=75, mx=85),
        mk_item(bc_tid, "Length", "numeric", "Finished Product", 4, unit="mm", mn=115, mx=125),
        mk_item(bc_tid, "Aroma Acceptable", "yesno", "Sensory", 5),
        mk_item(bc_tid, "Packaging Integrity", "passfail", "Packaging", 6),
        mk_item(bc_tid, "General Observations", "text", "General", 7, required=False),
    ])

    # ---- Whole Wheat Bread ----
    wb_id = str(uuid.uuid4())
    wb_tid = str(uuid.uuid4())
    await db.products.insert_one({
        "id": wb_id, "product_code": "WB-400", "product_name": "Whole Wheat Bread",
        "category": "Bread", "description": "Whole wheat sandwich loaf, 400g.",
        "standard_weight": 400, "weight_tolerance": 12, "standard_dimensions": "110 x 100 x 100 mm",
        "dimension_tolerance": 5, "shelf_life": "4 days", "storage_condition": "Ambient",
        "packaging_type": "Poly bag", "photo_url": None, "active": True, "created_at": now_iso(),
    })
    await db.checklist_templates.insert_one({
        "id": wb_tid, "product_id": wb_id, "name": "Whole Wheat Bread QC Checklist",
        "version": 1, "active": True, "created_at": now_iso(),
    })
    await db.ccps.insert_many([
        {"id": str(uuid.uuid4()), "product_id": wb_id, "ccp_number": "CCP-1", "name": "Core Temperature",
         "process_step": "Baking", "hazard": "Undercooked crumb",
         "critical_limit_min": 92, "critical_limit_max": None, "unit": "°C",
         "monitoring_frequency": "Per batch", "corrective_action": "Extend bake / reject",
         "active": True, "created_at": now_iso()},
        {"id": str(uuid.uuid4()), "product_id": wb_id, "ccp_number": "CCP-2", "name": "Metal Detector",
         "process_step": "Packing", "hazard": "Metal foreign body",
         "critical_limit_min": 1, "critical_limit_max": 1, "unit": "pass(1)/fail(0)",
         "monitoring_frequency": "Continuous", "corrective_action": "Isolate & reject",
         "active": True, "created_at": now_iso()},
    ])
    await db.checklist_items.insert_many([
        mk_item(wb_tid, "Crust Appearance", "passfail", "Finished Product", 1, photo=True),
        mk_item(wb_tid, "Crumb Structure", "dropdown", "Finished Product", 2,
                options=["Fine", "Open", "Dense"]),
        mk_item(wb_tid, "Net Weight", "numeric", "Finished Product", 3, unit="g", mn=388, mx=412),
        mk_item(wb_tid, "Height", "numeric", "Finished Product", 4, unit="mm", mn=95, mx=105),
        mk_item(wb_tid, "No Foreign Material", "yesno", "Finished Product", 5),
        mk_item(wb_tid, "Packaging Seal Intact", "yesno", "Packaging", 6),
        mk_item(wb_tid, "Label & MRP Verification", "passfail", "Packaging", 7),
        mk_item(wb_tid, "General Observations", "text", "General", 8, required=False),
    ])
    logger.info("Seeded products, checklists and CCPs")


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.inspections.create_index("production_date")
    await db.inspections.create_index("qc_user_id")
    try:
        await run_in_threadpool(_init_storage)
    except Exception:
        logger.warning("Storage init deferred")
    await seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
