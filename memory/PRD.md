# QC Inspect — Product Requirements Document

## Original Problem Statement
Production-ready mobile Quality Control (QC) checklist & reporting app for the baking/food
manufacturing industry. A QC Executive selects a product, auto-loads its predefined checklist,
records CCP (Critical Control Point) readings, records finished-product quality parameters,
attaches photos, marks Pass/Fail or enters measurements (with automatic evaluation), adds
corrective actions on failures, submits inspections, and generates an end-of-day report.
Must scale toward a full Food Manufacturing QC Management System.

User requested Flutter + Supabase; platform only supports React Native (Expo) + FastAPI + MongoDB.
User agreed to build on this equivalent stack with the same feature set.

## Architecture
- **Frontend:** Expo (React Native), expo-router stack navigation, brutalist industrial light theme
  (SpaceGrotesk + JetBrainsMono fonts), react-native-keyboard-controller for forms.
- **Backend:** FastAPI (`/app/backend/server.py`), all routes under `/api`.
- **DB:** MongoDB (motor). UUID string ids, `_id` excluded from responses.
- **Auth:** JWT (pyjwt) + bcrypt, roles `qc_executive` / `admin`, role read from DB per request.
- **Storage:** Emergent Object Storage for photos (backend proxy, JWT-gated `/api/files`).
- Checklist engine is dynamic & DB-driven; each inspection stores an immutable snapshot of the
  checklist + CCPs + version (audit-safe). CCP readings & results embedded as append-only arrays.

## User Personas
1. **QC Executive** — performs inspections, records readings, uploads photos, views own history.
2. **QC Manager / Admin** — sees all inspections, reports (broader access; management UI is backlog).

## Core Requirements (static)
- Product master with specs + linked checklist.
- Dynamic checklist parameter types: passfail, numeric (auto spec eval), dropdown, text, datetime, photo, yesno.
- CCP management with critical limits + recurring, timestamped, append-only readings.
- Automatic Pass/Fail for numeric params & CCPs against min/max limits.
- Non-conformance / corrective action capture (status: Open → ... → Closed).
- Inspection review + submit (locked after submit).
- History with filters; daily QC report (viewable + shareable).
- Role-based access + audit trail.

## Implemented (2026-08-25)
- JWT auth (login/register/me) with roles; seeded admin + QC users.
- Product Master (list, search, detail) — 3 seeded products (Honey Cake, Butter Croissant, Whole Wheat Bread).
- Batch entry → creates inspection with checklist snapshot + version.
- Dynamic inspection form: all 7 parameter types, live auto Pass/Fail, inline corrective-action block on FAIL.
- CCP cards with append-only recurring readings + auto-eval + failure warning.
- Review & Submit screen (fails-first summary, overall result, remarks).
- Dashboard KPIs + quick actions; ADMIN-only section for management.
- History (filter chips) → Inspection Detail (read-only, photo thumbnails, corrective actions).
- Daily QC Report (production/QC/CCP summaries, product findings, non-conformances) with native Share.
- Photo capture (camera/library) with full permission handling → Emergent Object Storage.
- Audit trail collection records create/update/delete/submit actions.
- **Admin management (2026-08-25):** admin-only endpoints + screens to create/edit products,
  build checklists (add/edit/delete parameters of all types), and manage CCPs (limits, frequency).
  RBAC enforced (qc→403). `include_inactive` listing for admins. Auto-creates checklist template v1.
- Tested: 22/22 core backend pytest + 10/10 admin backend pytest + frontend e2e (incl. admin) passed.

## Prioritized Backlog
### P1
- PDF / Excel-CSV export of reports.
- Offline-first capture + sync queue.
- Corrective-action (NCR/CAPA) management screen with status transitions & verification.
- Analytics dashboard (rejection rate, CCP failure frequency, defect trends).
### P2
- Multi-factory / multi-line scoping, supplier & raw-material QC, calibration/hygiene modules,
  barcode/QR scan, manager approval workflow, email/report notifications.

## Next Tasks
1. Build Admin Checklist Builder (product + checklist + CCP CRUD).
2. Add PDF export + share for daily report.
3. Add offline queue for inspections/readings.
