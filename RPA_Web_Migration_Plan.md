# RPA SV Summary — Excel to Web Application Migration Plan

**Source file:** `RPA SV Summary - 2026.xlsx`
**Author:** Prepared for NESTON / Business Automation Team
**Date:** 28 April 2026
**Target users:** Internal RPA / Business Automation Team (intranet)
**Stack direction:** Modern full-stack (React + TypeScript + relational DB)

---

## 1. Executive Summary

The current `RPA SV Summary - 2026.xlsx` workbook is the team's single source of truth for: (a) revenue planning across all RPA service streams, (b) tracking the gap between booked / pipeline revenue and the annual head-count-driven target, and (c) lightweight resource planning. It contains 7 interconnected sheets, ~70 active projects across multiple revenue types, and date-driven recognition formulas that pro-rate revenue across fiscal years.

This document specifies how to re-implement that workbook as an internal web application that the team will use for the same purposes plus dashboards and what-if forecasting. The plan covers the existing Excel logic (so nothing is lost), the proposed data model, screens, technology choices, and a four-phase delivery roadmap with an MVP that exactly reproduces the workbook's current numbers.

---

## 1.1 Core Design Principle — Fiscal Year is the Universal Filter

The single most important behaviour rule for the new system: **every screen, every grid, every chart, and every total is scoped to the active fiscal year.** Changing the year selector at the top of the app must instantly re-pivot every visible number — including column headers — without any other action from the user.

Concretely:

- The Implementation workbench's "Progress 2025 / Progress 2026" columns become "Progress 2024 / Progress 2025" when the user picks FY 2025, and recompute `% Recognize`, `GM Recognize`, `Estimate`, and `Pipeline` from the corresponding cumulative-progress snapshots.
- Subscription MA, Percepture License, and the MTL/TRUE Outsource pro-ration formulas all use the active year as `Y` in the period-overlap formula (§4.1), so a contract spanning 2025-11-10 → 2026-11-09 contributes ~14% in FY 2025 and ~86% in FY 2026 — automatically.
- The Outsource monthly grid shows the months of the active year (with each engagement's actuals/forecast scoped to that year).
- Resource Planning shows the active year's monthly allocations.
- Dashboard tiles, pipeline blocks, target, and "Remaining" all roll up only the active year.

**Implication for the data model:** anything that has a per-year value (project progress, head count, target/head, rate cards, VAT, monthly outsource, monthly allocations) must be **stored as a time series keyed by year**, not as fixed-name columns. The current Excel hard-codes "2025" and "2026" into headers; the web app does not.

## 2. What the Excel Currently Does (Reverse-Engineered)

The workbook contains seven sheets. The numbers below reflect the values present in the file as of the snapshot reviewed.

### 2.1 Sheet `Total` (KPI Dashboard)

This is the executive summary sheet. Cell `B1 = 2026` is the **fiscal year driver** — every other sheet's recognition formula references it via `Total!$B$1`.

The sheet aggregates all revenue streams into two blocks (Backlog & Win, Pipeline 2026), computes total revenue, total target, and the remaining gap.

Key formulas:

| Cell | Formula | Meaning |
|---|---|---|
| B4 | `='Percepture License'!L17 + 'Percepture License'!Q17` | License + SW MA Gross Margin (booked) |
| B5 | `='Subscription MA'!AD4` | UiPath subscription Gross Margin (booked) |
| B6 | `=SUM(B4:B5)` | Total SW Gross Margin |
| B7 | `=Outsource!B21` | Outsource Revenue (booked) |
| B8 | `=Implementation!O27` | Implementation Revenue (booked) |
| B9 | `='Subscription MA'!AD3 + 'Percepture License'!U17` | MA Service Revenue (booked) |
| B10 | `=SUM(B7:B9)` | Total Service Revenue |
| B14:B20 | mirrors B4:B10 but for Pipeline | |
| B23 | `20` | Headcount (excluding 2 PMs) |
| B24 | `1,800,000` | Target per head (THB) |
| B25 | `=B24*B23` | **Total Target = 36,000,000** |
| B26 | `=B6+B10+B16+B20` | **Total Revenue (booked + pipeline) = 31,728,712.61** |
| B27 | `=B25-B26` | **Remaining = 4,271,287.39** |

### 2.2 Sheet `Project List`

A master register of 166 projects with 22 columns: project code, description, status (Open / Completed), win status, sales rep, PM, supervisor, accounting type (SI, Sales, PS, MA, Cloud Prepaid, Training, Outsource, Cloud), dates, customer, PO, progress %, warranty period, MA period, brand, and timesheet status. This is informational — no formulas — but it is the spine that everything else should attach to in the new system.

Distribution observed: 107 Open / 59 Completed; accounting type: 88 MA, 40 PS, 17 Sales, 15 SI, 2 Outsource, 2 Training, 1 Cloud, 1 Cloud Prepaid.

### 2.3 Sheet `Implementation`

Tracks one-time implementation projects. Columns: Customer, Project, ERP Code, Project Type, Status (Win / Pipeline), Pipeline Target Date, Progress 2025, Progress 2026, % Recognize, Estm % Regn 2026, SV Revenue, SV Cost (SQ), Gross MG, GM Recognize, Estimate 2026, SV Pipeline 2026.

Per-row formulas (row 3 shown, copied down to row 26):

```
I3 = H3 - G3                           % Recognize this year (Progress 2026 − Progress 2025)
J3 = I3                                Estimated % Recognize 2026
M3 = K3 - L3                           Gross MG = SV Revenue − SV Cost
N3 = K3 * I3                           GM Recognize
O3 = IF(E3="Win",   K3*J3, "0")        Estimate 2026 (only for Win)
P3 = IF(E3="Pipeline", K3*J3, "0.00")  SV Pipeline 2026 (only for Pipeline)
O27 = SUM(O3:O26)                      → feeds Total!B8
P27 = SUM(P3:P26)                      → feeds Total!B18
```

### 2.4 Sheet `Subscription MA` (UiPath)

The most formula-dense sheet. Structured side-by-side: 2025 columns (C–L) and 2026 columns (M–W). For each contract row, both years are tracked with the same shape: ERP Code, License Rev, License Cost, SV Revenue, SV Cost, Period Start, Period End, % Recognize, SW Recognize, SV Recognize.

The 2026 block adds a **Status** column (`N3`: "Existing" or "Pipeline") which gates whether the row contributes to recognized revenue (X, Y) or pipeline (Z, AA).

The pro-ration formula (column J for 2025, U for 2026) is:

```
% = IF(any-date-empty, "",
       IF( MIN(yearEnd, periodEnd) >= MAX(yearStart, periodStart),
           ( MIN(yearEnd, periodEnd) - MAX(yearStart, periodStart) + 1 )
           / ( periodEnd - periodStart + 1 ),
           0 ))
```

This is the canonical revenue-recognition formula for any period-based contract spanning the fiscal year.

Column footers (row 33) sum X/Y/Z/AA. Cell `AD3 = Y33 + L33` is the SV MA recognized in 2026 (combining the 2026 portion of contracts that started in 2025 plus those starting in 2026). `AD4 = X33` is SW recognized.

### 2.5 Sheet `Percepture License`

Covers Percepture / Nintex deals where each contract has up to three concurrent revenue components in one row: License (one-time, recognized 100% in win year), SW MA (recurring, pro-rated), and SV MA (recurring, pro-rated).

Per row: License columns I/J/K/L (Rev, Cost, Rev Recog, GM Recog), SW MA columns N/O/P/Q, SV MA columns S/T/U/V, plus rolled-up Total Revenue, Total Cost, Total GM, $ Margin in W:Z.

Recognition logic:

```
H3 = IF(D3="License", IF(TEXT(F3,"yyyy")=Total!$B$1, "100%", "0%"), "0%")
M3 = period-overlap formula (same as Subscription MA)
R3 = period-overlap formula (same as Subscription MA)
```

Footer row 17 sums K/L/P/Q/U/V — these feed `Total!B4` and `Total!B9`.

### 2.6 Sheet `Outsource`

Three time-and-materials engagements arranged side-by-side: BOT RPA Dev (cols A–D), MTL Onsite (cols F–I), TRUE Onsite (cols K–N). Each is a 12-month grid.

For BOT, January–March 2026 are entered as actuals (Manday computed as `Revenue / 7,470` — apparently the historical daily rate). April–December are projected: working days come from `NETWORKDAYS(month_start, month_end)`, revenue from `working_days * Senior_Rate` (`$C$18 = 8,000`).

For MTL and TRUE the model is simpler: an annual revenue figure (G14, L14) is pro-rated by the fraction of the year that the contract overlaps (`I17`, `N17`) using the same period-overlap formula as the MA sheets. Contract periods are 2026-04-01 → 2027-03-31 (MTL) and 2026-05-01 → 2027-04-30 (TRUE).

Outputs: `B21 = D14 + I14` (Win → `Total!B7`), `B22 = 0` (Pipeline → `Total!B17`).

### 2.7 Sheet `Resource Planing`

23 named team members with: row #, full name (English), nickname, position (Project Manager, Developer Team Lead, Senior Developer, Developer, Business Analyst), and **Response Site** — a free-text field describing which customers/projects they cover (e.g., "PM (TMG / BOT / MTL / THP)", "BOT Onsite RPA Dev", "KBANK / BOT", "BA (SAM / SET)").

Monthly columns APR–DEC are present but currently empty — the intent is clearly to record per-month allocations. This is the single biggest area where the Excel is *under-implemented* and where the web app can add real value.

Footer rows 27–30 contain pipeline notes ("TRUE - Require 11 RPA Dev", "ADVICS - Customer already…", "Bangchak - 100 MD + Migration").

---

## 3. Proposed Data Model

The Excel structure maps cleanly to a normalized relational schema. Below is the proposed PostgreSQL schema (Prisma-style notation); naming is `snake_case` for SQL, `camelCase` for TypeScript clients.

### 3.1 Core entities

```text
fiscal_year
  year                int PK              -- e.g. 2026
  head_count          int                 -- B23 in Total
  target_per_head     numeric(14,2)       -- B24 in Total
  total_target        numeric(14,2) GENERATED  -- head_count * target_per_head
  is_active           boolean
  notes               text

customer
  id                  uuid PK
  name                text                -- "KBANK", "BOT", "SAM", ...
  short_code          text
  industry            text
  active              boolean

employee
  id                  uuid PK
  full_name_en        text
  nickname            text
  position            text                -- PM | Developer Team Lead | Senior Developer | Developer | BA
  email               text
  start_date          date
  end_date            date NULL
  is_active           boolean

project                                   -- replaces both "Project List" and the project columns on revenue sheets
  id                  uuid PK
  project_code        text UNIQUE         -- BFS190003, ENT250065, etc.
  description         text
  customer_id         uuid FK -> customer
  accounting_type     enum(SI, Sales, PS, MA, OUTSOURCE, TRAINING, CLOUD, CLOUD_PREPAID)
  project_status      enum(OPEN, COMPLETED)
  win_status          enum(WIN, PIPELINE, LOST)
  order_status        text
  sale_rep            text
  pm_employee_id      uuid FK -> employee NULL
  pm_supervisor_id    uuid FK -> employee NULL
  start_date          date
  end_date            date
  win_date            date NULL
  est_win_date        date NULL
  customer_po         text
  progress_pct        numeric(5,2)
  warranty_start      date NULL
  warranty_end        date NULL
  ma_start            date NULL
  ma_end              date NULL
  brand               text                -- Lenovo, DELL, HPE, BMC, ...
  timesheet_status    text
  notes               text
```

### 3.2 Revenue items (polymorphic by type)

Every row across the four revenue sheets is a `revenue_item` keyed by `(project_id, fiscal_year, type)`. The shape is wide but every column maps directly to the Excel:

```text
revenue_item
  id                          uuid PK
  project_id                  uuid FK -> project
  fiscal_year                 int FK -> fiscal_year.year
  type                        enum(IMPLEMENTATION, LICENSE, SW_MA, SV_MA, SUBSCRIPTION, OUTSOURCE)
  status                      enum(WIN, PIPELINE, EXISTING)        -- "Existing" used by Subscription MA
  erp_code                    text NULL
  pipeline_target_date        date NULL                            -- Implementation sheet col F

  -- Period (used by all recurring types)
  period_start                date NULL
  period_end                  date NULL

  -- Money
  license_revenue             numeric(14,2) DEFAULT 0
  license_cost                numeric(14,2) DEFAULT 0
  sw_revenue                  numeric(14,2) DEFAULT 0       -- "SW MA" / "License Rev" depending on type
  sw_cost                     numeric(14,2) DEFAULT 0
  sv_revenue                  numeric(14,2) DEFAULT 0
  sv_cost                     numeric(14,2) DEFAULT 0

  -- Implementation-specific (progress itself lives in project_progress, see §3.7)
  estm_pct_recognize_override numeric(5,4) NULL              -- column J in Implementation sheet — overrides
                                                             -- (cumulative_progress[Y] − cumulative_progress[Y-1])

  note                        text
  created_at                  timestamptz
  updated_at                  timestamptz

  UNIQUE (project_id, fiscal_year, type, erp_code)
```

The numeric fields below are **never stored** — they are computed on read by the calculation engine (see §4):

```
pct_recognize, sw_recognize_amount, sv_recognize_amount,
pipeline_amount, gross_margin, gm_recognize_amount,
estimate_current_year, sv_pipeline_current_year
```

### 3.2.1 Project progress as a time series (the FY-driven recognition input)

This is the table that lets the active fiscal year drive Implementation recognition. Each row is a year-end cumulative-progress snapshot for one project.

```text
project_progress
  id                  uuid PK
  project_id          uuid FK -> project
  as_of_year          int                          -- the year-end snapshot, e.g. 2024, 2025, 2026
  cumulative_pct      numeric(5,4)                 -- 0.0000 .. 1.0000
  is_actual           boolean DEFAULT false        -- true once the year has closed and the value is locked
  note                text
  UNIQUE (project_id, as_of_year)
```

The Implementation engine for fiscal year `Y` reads:

```
prev_pct = project_progress(project_id, Y-1).cumulative_pct  ?? 0
curr_pct = project_progress(project_id, Y).cumulative_pct    ?? 0
pct_recognize = curr_pct − prev_pct
```

So the same `revenue_item` row produces different recognition figures depending on which fiscal year is active — no row duplication needed.

### 3.3 Outsource monthly entries

Outsource is unique because it tracks per-month work. We split it from `revenue_item`:

```text
outsource_engagement
  id                          uuid PK
  project_id                  uuid FK -> project
  status                      enum(WIN, PIPELINE)
  daily_rate                  numeric(10,2)            -- e.g. 8,000 (year-specific via rate_card if needed)
  fixed_annual_amount         numeric(14,2) NULL       -- for the MTL/TRUE pattern (G14, L14)
  contract_start              date NULL                -- for pro-rated annual contracts
  contract_end                date NULL

outsource_month
  id                          uuid PK
  engagement_id               uuid FK -> outsource_engagement
  fiscal_year                 int                      -- ★ year-keyed so 2025 and 2026 cells live side-by-side
  month                       int (1..12)
  manday_actual               numeric(8,2) NULL        -- if entered as actual
  revenue_actual              numeric(14,2) NULL       -- if entered as actual (BOT Jan–Mar 2026 pattern)
  is_actual                   boolean DEFAULT false    -- locks the row once the month has closed
  UNIQUE (engagement_id, fiscal_year, month)
```

Resolution logic at read time: if `is_actual=true`, return the entered values. Otherwise compute `working_days = NETWORKDAYS(month, country=TH)`, `revenue = working_days * daily_rate` (or pro-rated slice of `fixed_annual_amount`).

### 3.4 Rate tables and reference data

```text
rate_card
  id                  uuid PK
  fiscal_year         int FK
  level               enum(JUNIOR, SENIOR)
  daily_rate          numeric(10,2)

vat_rate
  id                  uuid PK
  fiscal_year         int FK
  rate                numeric(5,4)         -- e.g. 0.07

th_holidays
  id                  uuid PK
  date                date
  description         text                  -- powers NETWORKDAYS
```

### 3.5 Resource planning

```text
employee_default_assignment       -- replaces "Response Site" free-text
  id                  uuid PK
  employee_id         uuid FK -> employee
  fiscal_year         int FK
  primary_site        text                          -- free text label (e.g. "BOT Onsite RPA Dev")
  notes               text

resource_allocation
  id                  uuid PK
  employee_id         uuid FK -> employee
  fiscal_year         int FK
  month               int (1..12)
  project_id          uuid FK -> project NULL       -- optional drill-down
  site_label          text                          -- free text fallback
  allocation_pct      numeric(5,2)                  -- 0..100 of FTE
  notes               text
  UNIQUE (employee_id, fiscal_year, month, project_id)

pipeline_resource_note               -- free-text rows 27–30 of current sheet
  id                  uuid PK
  fiscal_year         int FK
  body                text
  required_count      int NULL
```

### 3.6 Audit & history

```text
audit_log
  id, table_name, row_id, action, user_id, before_json, after_json, at
revenue_snapshot                       -- monthly snapshot of computed numbers for trend charts
  id, fiscal_year, snapshot_date, total_sw_gm, total_sv, pipeline_gm, pipeline_sv, total_revenue
```

---

## 4. Calculation Engine

The web app must reproduce the Excel formulas exactly. The core rules:

**4.1 Period-overlap recognition** (used by Subscription MA, Percepture SW MA, Percepture SV MA, MTL/TRUE Outsource pro-ration):

```ts
function periodPctForYear(periodStart: Date, periodEnd: Date, year: number): number {
  if (!periodStart || !periodEnd) return 0;
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd   = new Date(Date.UTC(year, 11, 31));
  const overlapStart = max(periodStart, yearStart);
  const overlapEnd   = min(periodEnd, yearEnd);
  if (overlapEnd < overlapStart) return 0;
  const overlapDays = days(overlapEnd, overlapStart) + 1;
  const totalDays   = days(periodEnd, periodStart) + 1;
  return overlapDays / totalDays;
}
```

**4.2 License recognition** (Percepture License sheet, column H):

```ts
const pct = (type === 'LICENSE' && year(periodStart) === fiscalYear) ? 1.0 : 0.0;
```

**4.3 Implementation recognition** — driven by the active fiscal year `Y`:

```ts
const prev = await getProgress(projectId, Y - 1) ?? 0;     // cumulative_pct at end of prior year
const curr = await getProgress(projectId, Y)     ?? 0;     // cumulative_pct at end of this year (or current target)
const pctRecognize = curr - prev;
const gmRecognize  = svRevenue * pctRecognize;
const estPct       = estmPctOverride ?? pctRecognize;
const estimate     = status === 'WIN'      ? svRevenue * estPct : 0;
const pipeline     = status === 'PIPELINE' ? svRevenue * estPct : 0;
```

Because progress is a time series in `project_progress`, switching the fiscal year automatically shifts which two snapshots are differenced — no row duplication, no formula change.

**4.4 Outsource per-month** (Thai working days):

```ts
const mandays = isActual ? actualManday
                         : networkDaysTH(year, month);   // exclude TH holidays
const revenue = isActual ? actualRevenue
                         : mandays * dailyRate;
```

For MTL/TRUE-style annual contracts, distribute `fixed_annual_amount * periodPctForYear(...)` evenly across overlap months, or pro-rate by working days within the overlap window — the current Excel just multiplies the annual figure by the year-overlap %, so we mirror that.

**4.5 Annual rollups** (the `Total` sheet):

```text
Total SW GM (Win)        = Σ Percepture License (License GM Recog + SW MA GM Recog)
                           + Σ Subscription MA  (X col, "Existing" rows)
Total SV (Win)           = Σ Outsource (status=Win)
                           + Σ Implementation (status=Win, Estimate 2026)
                           + Σ Subscription MA SV Recog ("Existing")
                           + Σ Percepture SV MA Recog
Total SW GM (Pipeline)   = Σ Subscription MA Z col ("Pipeline")    [+ License pipeline if any]
Total SV (Pipeline)      = Σ Outsource (status=Pipeline)
                           + Σ Implementation (status=Pipeline)
                           + Σ Subscription MA SV ("Pipeline")
Total Target             = head_count * target_per_head
Total Revenue            = Total SW GM (Win) + Total SV (Win) + Total SW GM (Pipeline) + Total SV (Pipeline)
Remaining                = Total Target − Total Revenue
```

The engine must be a **pure function library** (no DB calls), unit-tested by replaying the exact input rows from the current Excel and asserting the computed outputs match within rounding tolerance (≤ 0.01 THB). This is the single most important verification gate before the MVP is considered "ready".

---

## 5. Application Screens

Eight primary screens, plus settings.

| # | Screen | Purpose | Key components |
|---|---|---|---|
| 1 | **Dashboard** (= `Total` sheet) | At-a-glance year status | KPI tiles (SW GM, SV Revenue, Total Revenue, Remaining), target progress bar, revenue-mix donut, pipeline-vs-booked bar, monthly trend line |
| 2 | **Projects** | Master register (= `Project List`) | Searchable / filterable grid (TanStack Table); column filters for status, customer, accounting type, brand; CSV / Excel export |
| 3 | **Project Detail** | Drill into one project | Header card + tabs: *Overview*, *Revenue Items* (cross-stream), *Resourcing*, *History* |
| 4 | **Revenue Workbench — Implementation** | Replicates `Implementation` sheet | Editable spreadsheet-like grid; columns auto-compute; status filter Win/Pipeline; footer totals |
| 5 | **Revenue Workbench — Subscription MA** | Replicates `Subscription MA` | Year-over-year side-by-side view; period editor; auto pct-recognize; Existing / Pipeline filter |
| 6 | **Revenue Workbench — Percepture License** | Replicates `Percepture License` | License + SW MA + SV MA combined per row; period editor; W/X/Y/Z auto-totals |
| 7 | **Outsource Planner** | Replicates `Outsource` sheet | Per-engagement 12-month grid; toggle actual vs forecast per cell; rate-card editor; VAT toggle |
| 8 | **Resource Planning** | Big upgrade vs current Excel | Team × month matrix; click cell to assign project + %; capacity vs allocation heat-map; pipeline-resource notes panel |
| 9 | **Forecasting / What-if** | New capability | Clone scenario, change assumptions (head count, target/head, win-rate of pipeline), preview deltas, save and compare scenarios |
| 10 | **Reports** | Exec consumption | Monthly P&L, year-over-year comparison, pipeline conversion funnel; export to PDF / XLSX |
| 11 | **Settings** | Admin | Fiscal years, rate cards, VAT, TH holidays, employees, customers, users / roles |
| 12 | **Audit Log** | Compliance | Who changed what, when |

UX north stars: every workbench grid should *feel* like Excel (keyboard navigation, paste from clipboard, formulas auto-shown, totals in a sticky footer). Use a real grid component (TanStack Table or AG Grid Community) — do not build a table from `<div>`s.

---

## 6. Recommended Technology Stack

Given an internal-team intranet deployment, the goal is to minimize moving parts while still being a real production app.

### 6.1 Stack of choice

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | **Next.js 14 (App Router) + TypeScript** | Single repo, server actions cut down on API boilerplate, excellent for internal tools |
| UI kit | **Tailwind CSS + shadcn/ui** | Copy-paste components, no runtime cost, matches modern enterprise look |
| Data grid | **TanStack Table v8** (with **AG Grid Community** as fallback for the Outsource grid) | Spreadsheet feel without licensing cost |
| Charts | **Recharts** (or **Apache ECharts** if heavier viz needed) | Declarative, plays well with React |
| Backend | **Next.js Route Handlers / Server Actions** | Keep TypeScript end-to-end |
| ORM | **Prisma** | Type-safe, great migration story |
| Database | **PostgreSQL 16** | Solid, free, well-supported in MFEC ops |
| Auth | **NextAuth.js with Microsoft Entra ID (Azure AD)** | Reuses MFEC corporate identities, no separate password to manage |
| Validation | **Zod** | Shared types between client and server |
| State | **TanStack Query** + lightweight **Zustand** for grid local state | |
| Calc engine | **Pure TypeScript module** in `/src/lib/finance/` | Unit-tested with **Vitest** |
| File I/O | **SheetJS (xlsx)** for import/export round-tripping | Must support the existing workbook as input for Phase 1 seeding |
| Deployment | **Docker Compose** on an internal Linux VM, or **Azure App Service (internal)** with PG Flexible Server | Intranet-only access; HTTPS via internal CA |
| CI/CD | **GitHub Actions** with `lint → typecheck → test → docker build` | |

### 6.2 Stack rejected and why

- **Streamlit** — fast to prototype but the resource-planning grid and editable workbenches need real component-level interactivity that Streamlit is awkward at.
- **Power Apps / SharePoint Lists** — looks attractive given the M365 ecosystem, but the calculation logic (period overlap, NETWORKDAYS with TH holidays, multi-stream rollups) becomes painful in Power Fx and changes are hard to version-control. Acceptable as a "view-only" surface in Phase 4 if requested.
- **Separate FastAPI + React SPA** — fine choice, but doubles the deployment surface. Recommended only if the team has more Python depth than TypeScript depth.

### 6.3 Repo layout

```
rpa-sv-summary/
├─ app/                          # Next.js routes (dashboard, projects, …)
├─ components/                   # shadcn UI + custom grids
├─ lib/
│  ├─ finance/                   # ★ Pure calculation engine
│  │  ├─ recognition.ts
│  │  ├─ outsource.ts
│  │  ├─ rollup.ts
│  │  └─ __tests__/              # vitest tests using fixtures from current Excel
│  ├─ db/                        # prisma client wrappers
│  ├─ excel-import.ts            # SheetJS-based importer
│  └─ excel-export.ts
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ scripts/
│  └─ seed-from-xlsx.ts          # seeds DB from RPA SV Summary - 2026.xlsx
└─ docker/
   └─ docker-compose.yml         # app + postgres + reverse proxy
```

---

## 7. Phased Roadmap

The recommended path is **four phases over ~12–14 weeks**, with a Phase 1 demo at week 5 that already replaces the Excel for daily use.

### Phase 1 — MVP "Excel parity" (Weeks 1–5)

Goal: every number visible in the current workbook is reproduced in the web app, sourced from the database, recalculated on the fly.

- Set up monorepo, CI, Docker compose for local dev
- Prisma schema + migrations for §3
- Seeder that ingests `RPA SV Summary - 2026.xlsx` and populates the DB
- Calculation engine (§4) with tests pinned against current Excel values
- Read-only screens 1, 4, 5, 6, 7 (Dashboard + four revenue workbenches)
- Read-only screen 2 (Project list)
- Azure AD login (single-tenant)

**Exit criterion:** every total cell on the current `Total` sheet matches its DB-driven counterpart to within 0.01 THB.

### Phase 2 — Editable workbenches (Weeks 5–8)

- Inline editing on screens 4–7 with optimistic updates
- Project create / edit (screen 3)
- Excel export of any grid (round-trip back to .xlsx for stakeholders)
- Audit log (screen 12)
- Roles: Admin, Editor, Viewer

### Phase 3 — Resource planning + forecasting (Weeks 8–11)

- Resource Planning grid (screen 8) — the real upgrade vs today's Excel
- Forecasting / what-if scenarios (screen 9)
- Capacity-vs-allocation heat-map
- Snapshots cron job (writes `revenue_snapshot` weekly for trend charts)

### Phase 4 — Polish & rollout (Weeks 11–14)

- Reports (screen 10) with PDF export
- Settings UI (screen 11)
- Performance pass (grid virtualization, indexes on `revenue_item.fiscal_year`)
- User documentation, training session for the team
- Production cutover; Excel becomes read-only "archive" copy

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Recognition formula drift between Excel and code | Numbers don't match → trust collapses | Phase 1 exit gate: byte-for-byte parity test against current xlsx; lock formulas behind a single `lib/finance/` module with high test coverage |
| Excel users keep editing the file in parallel | Two sources of truth | Set a clear cutover date at end of Phase 2; export from web app produces an xlsx that mirrors the workbook for any audience that still wants it |
| TH holiday calendar wrong → NETWORKDAYS miscounts | Outsource revenue off by ~6 % | Seed `th_holidays` from official Bank of Thailand calendar each year; admin UI to edit |
| Users want spreadsheet ergonomics (paste, fill-down, undo) | Adoption friction | Use AG Grid Community for the heaviest editing screens; spend a sprint on keyboard interactions |
| Azure AD app registration delay from MFEC IT | Blocks Phase 1 demo | Start the AD ticket on day one; have a local-credentials fallback for dev |
| Scope creep into CRM / pipeline management | Project balloons | Keep the line: this app *plans and recognizes revenue* — it does not replace customer / opportunity tooling |

---

## 9. Open Decisions Needed From You

Before kickoff, these need answers:

1. **Is the fiscal year always Jan 1 – Dec 31?** (Excel uses calendar year via `DATE(B1,12,31)` and `DATE(B1,1,1)`.) Confirm or supply MFEC's actual fiscal calendar.
2. **TH public-holiday source** — should the app pull from a maintained internal list, or do you want a manual upload each year?
3. **Currency** — all figures appear to be THB. Any need for multi-currency (e.g., licenses billed in USD)?
4. **Who is in scope for Azure AD access** — RPA team only, or wider Business Automation department? Drives the AD app group.
5. **Hosting target** — internal VM (which?), Azure App Service, or AWS? Affects Phase 1 environment setup time.
6. **Read access for management** — view-only role for executives, or do they only need the exported PDF reports?
7. **Treatment of "Pipeline" rows** — currently Pipeline contributes to `Total Revenue`. Should the dashboard separate "committed" from "weighted pipeline" (e.g. apply 50 % win-probability to pipeline rows)?
8. **History** — do we backfill 2025 data so the app can show year-over-year trends, or start fresh with 2026?

---

## 10. Next Concrete Step

If this plan is broadly OK, the next deliverable will be a **clickable wireframe** of the Dashboard + one revenue workbench (Implementation), built as static HTML in this same folder, so we can iterate on layout before any code or database work begins. After that, Phase 1 starts with the Prisma schema and the seeder script.

— *End of plan*
