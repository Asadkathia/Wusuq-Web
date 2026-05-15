# Wizard-style consumer case-files upload — design

Status: approved 2026-05-16.
Scope: a new consumer page that lets users save documents organized by the same `(service, city, court)` taxonomy the intake wizard uses, with optional ticket attachment.

## Problem

Consumers today have two document surfaces:

1. **`/consumer/documents`** — read view of `TicketDocument` rows for their tickets, plus a weak "paste ticket id to upload" modal.
2. **`/consumer/files`** — flat Dropbox-style `PersonalFile` storage. Quota-managed, no court context.

Neither matches how consumers actually think about their files — by service, city, and court. PDF feedback (5-14-26 addendum-flavoured): *"make its workflow like the intake wizards, where consumer can save a file specific to a service court just like the wizard works."*

Goal: a third surface — a wizard-style upload page that captures the service/city/court cohort up front and persists files under that cohort. Existing surfaces stay untouched.

## Approach

Reuse the intake wizard's first step (flow tile → city picker → court picker) as a standalone `<CohortPicker>`. After cohort selection, drop into a familiar upload zone (existing `<FileUpload>`, which already supports per-file captions). Files store under the cohort by extending `PersonalFile` with five nullable columns. Listing groups files by cohort header. Optional ticket attachment links a file into the consumer's existing ticket detail page without forcing a ticket on every upload.

No new storage tier — files share `PersonalFile` quota with the existing `/consumer/files` view.

## User flow

`/consumer/case-files` landing page:

- Top-right **Upload new** button.
- Default body: grouped list of all cohort-tagged files (rows where `PersonalFile.serviceId IS NOT NULL`).
- Group header shows `Service · City · Court` (e.g. *Case Files · Lahore · Lahore High Court*) with a count badge.
- Single-file groups render as one row; ≥2 file groups expand with a chevron.
- Each row: filename, caption (optional), size, uploaded date, optional "Attached to TKT-…" badge linking to the ticket detail page, **Download** + **Delete** actions.
- Top of page: filter bar with service + city + court selects (each downstream of the previous). Empty filters → all groups visible.
- Empty state: "No case files yet. Click Upload new to add your first file."

**Upload new** opens a slide-over or modal flow:

1. **Flow tile** — same tiles as the intake wizard (Case Files / Case Information / Case Filing / Power of Attorney / Case Search / FIR / Registry-Deed / Criminal Record).
2. **City picker** — existing `CityBlock` with the chip-collapse UX + search aliases. Multi-select disabled.
3. **Court picker** — existing `JudicialServiceBlock` for judicial flows; police-station / office picker for non-judicial.
4. **Attach to existing ticket?** — optional. Autocomplete of consumer's tickets whose `(serviceId, cityId, courtName)` match the chosen cohort. Skippable.
5. **Upload zone** — existing `<FileUpload>`. Per-file caption defaults to "Document"; selectable as Petition / Power of Attorney / Supporting Document / FIR / ID Card / Court Order / Other (already supported).
6. **Save** — files persist under the chosen cohort. Redirect to the cohort's bucket view (filtered listing landing) on success.

## Data model

Extend `PersonalFile`:

```prisma
model PersonalFile {
  // ... existing fields
  serviceId         String?
  cityId            String?
  courtName         String?
  courtType         String?
  attachedTicketId  String?

  @@index([userId, serviceId])
}
```

All five new columns nullable.

- `serviceId` denormalised — references `Service.id` but no FK (catalogue is small + stable; avoids cascade-on-delete pain).
- `cityId` denormalised — references `GeoCity.id` but no FK (cities turn over rarely; FK would block file deletion if a city row went away).
- `courtName` + `courtType` are display strings from the wizard's payload (`select_court`, `select_court_type`). String-storage rather than FK to `CourtSeat` avoids fragility when court rows are reseeded.
- `attachedTicketId` — FK to `Ticket.id` with `onDelete: SetNull` (so deleting a ticket doesn't cascade-delete files). New `personalFiles PersonalFile[]` back-relation on `Ticket`.

A row with all five fields `null` is a legacy/general file — appears only in `/consumer/files`. A row with cohort fields set appears in both views (the generic Personal Files page continues to list everything; the new case-files view filters to `serviceId IS NOT NULL`).

Migration: `20260516000000_personal_file_cohort_fields`.

## API

Three new endpoints on the existing `personal-files` controller:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/personal-files/case-files` | Multipart upload + cohort metadata. Form fields: `file` plus `serviceId`, `cityId`, `cityName`, `courtName`, `courtType`, `attachedTicketId` (all optional except `serviceId` + `cityId`). |
| `GET` | `/personal-files/case-files` | List rows where `serviceId IS NOT NULL` for the JWT consumer. Query params: optional `serviceId`, `cityId`, `courtName` filters. |
| `GET` | `/personal-files/case-files/cohorts` | Aggregate by `(serviceId, cityId, courtName, courtType)` returning counts. Powers the grouped header without fetching all rows. |

Validation on `POST`:

- `serviceId` must exist in `services.findOne(serviceId)`.
- `cityId` must exist in `geo.cities`.
- `attachedTicketId`, if present, must belong to the JWT consumer (`ticket.consumerId === actor.sub`).
- Existing quota check unchanged.

Existing endpoints (`POST /personal-files`, `GET /personal-files`, list / delete / restore) untouched — they continue to serve the generic Personal Files view.

## Frontend extraction

The cohort picker is the intake wizard's first step rendered standalone. To do this cleanly:

- Carve out a `<CohortPicker>` component in `apps/web/components/cohort-picker/cohort-picker.tsx` (or co-located with the new case-files board if extraction proves heavy).
- It exposes: `flow tile selection → city picker (CityBlock) → court picker (JudicialServiceBlock or non-judicial equivalent)`.
- Output: `onChange({ flow, serviceId, cityId, cityName, courtName, courtType }) => void`.
- The intake wizard continues to render its existing inline Step 1 — no breaking change to that. If the extraction proves complex, accept duplication in v1 by copy-pasting the picker blocks into the new component.

After cohort picked, render `<FileUpload>` (existing — supports per-file captions) plus an optional `<TicketAutocomplete>` that fetches `/tickets?consumerId=<me>` filtered to the chosen cohort.

## New components

- `apps/web/app/(consumer)/consumer/case-files/page.tsx` — route handler.
- `apps/web/components/case-files-board.tsx` — grouped list + filter bar + Upload button.
- `apps/web/components/case-files-board/cohort-picker.tsx` — minimal flow/city/court picker reused from wizard.
- `apps/web/components/case-files-board/upload-drawer.tsx` — slide-over with the 6-step upload flow.
- `apps/web/components/case-files-board/cohort-group.tsx` — collapsible group with file rows.

## Sidebar nav

Add **"Case Files"** entry to `apps/web/components/consumer-nav.tsx`, between Drafts and My Tickets. Icon: `FolderOpen` from lucide.

Existing entries (Documents, My Files) stay.

## Quota

Cohort-tagged files share the existing `PersonalFile` quota — one mental quota per consumer. No new `UserStorageUsage` model or counter.

## Out of scope (v1)

- Drag-drop reordering between cohorts.
- Sharing case-files with staff via a dedicated permission. Staff continues to read `TicketDocument` rows in ticket-detail panels; `PersonalFile` rows remain consumer-private regardless of cohort.
- Bulk-upload to multiple cohorts in one operation.
- Versioning / history per file.
- Renaming a cohort (consumers re-upload to a different cohort if they made the wrong call).
- Mobile-specific layout tuning — desktop-first; mobile sees the same grouped list with a vertical scroll.
- Soft-delete UI inside the new view — leverage the existing `/consumer/files` "Recently deleted" section instead.
- Count badge on the sidebar nav entry (e.g. "Case Files · 14") — nice-to-have, deferred.

## Risks

- **CohortPicker refactor scope creep.** The intake wizard's Step 1 has many props and effects tangled with the rest of the wizard. Pulling a clean component out may take longer than copy-paste. Mitigation: v1 accepts the duplication; refactor when both surfaces have stabilised.
- **Cohort denormalisation drift.** `courtName` / `courtType` are display strings. If a court gets renamed in `pakistan-courts.json`, the stored strings on old files won't update. Acceptable — court renames are rare and the consumer's filter still works on the historical name.
- **Quota surprise.** Consumers may not realise case-files and personal-files share the same quota. Surface the quota usage on the case-files page header (reuse `<PersonalFilesQuota>` if cheap).
