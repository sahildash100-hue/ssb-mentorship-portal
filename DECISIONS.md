# Key Product & Technical Decisions

A short walk through the decisions that shaped the SSB Mentorship Booking Portal — what was
chosen, why, and the trade-offs.

---

## Product decisions

### 1. Mutual completion before mentor feedback
**Decision:** A mentor's feedback is requested only after the **student marks the session complete**;
both sides effectively confirm the meeting happened before feedback is captured.
**Why:** Prevents feedback on sessions that never occurred and keeps records trustworthy. It mirrors
how real mentorship programs reconcile attendance before review.

### 2. A feedback gate on the student
**Decision:** A student **cannot book a new session** until they've reviewed their past completed ones.
**Why:** Drives the feedback loop to actually close — feedback is the product's core value, not an
optional afterthought. It nudges behavior without nagging.

### 3. Recurring weekly availability (not one-off dates)
**Decision:** Mentors set a **fixed weekly schedule** (e.g. Mon/Wed/Fri × 2 slots); the system
generates concrete bookable slots for the next 4 weeks.
**Why:** Matches how mentors actually think about availability ("I'm free these days every week"),
needs ~6 rows instead of dozens of dated entries, and stays current automatically. Editing the
schedule is a one-line change, so emergencies/changes are easy.

### 4. Calendar-first slot selection
**Decision:** The student picks a **date on a calendar**, then chooses from that day's slots, with the
mentor's available days surfaced as chips.
**Why:** It's the mental model people expect from scheduling tools — pick a day, then a time — and it
scales cleanly as more slots are added.

### 5. Controlled access via an allowlist
**Decision:** Only explicitly approved emails (`ALLOWED_STUDENTS`) can log in, even if present in the
sheet.
**Why:** For a graded demo with a specific reviewer, predictable access beats "anyone in the cohort."
It's one editable line to widen later.

---

## Technical decisions

### 6. Google Sheet as the database
**Decision:** Use the bound Google Sheet as the system of record (no separate DB).
**Why:** Zero infra/cost, instantly transparent to non-engineers (the program team can read/edit
records directly), and it doubles as the admin UI.
**Trade-off:** Not a high-throughput transactional store. Mitigated with `LockService` for the one
hot path (booking) and a **header-mapped data layer** that localizes any future migration to
Firestore/Postgres.

### 7. "Execute as the user" + org-domain ownership
**Decision:** Deploy the web app as **the user accessing it**, and **own the project from an
`ssb.scaler.com` account**.
**Why:** Gives passwordless, silent login via the Google account, and — because the owner shares the
reviewer's Workspace domain — org students' identities are revealed to the app with **no
"third-party app blocked" wall**. (Verified: the org account's email is detected correctly.)
**Trade-off:** Each student needs sheet access; handled by sharing the sheet as Editor during setup.

### 8. Zoom instead of auto-generated Google Meet
**Decision:** Attach the **mentor's own Zoom room** as the meeting link rather than auto-creating a Meet.
**Why:** The `ssb.scaler.com` Workspace **blocks API/third-party-created Google Meet** ("organization's
safety settings"). A mentor-owned Zoom room sidesteps that entirely and always joins. The brief
explicitly allows "Google Meet, Zoom, ... or any other scheduling solution."
**Design:** The link lives in the mentor's `MeetingLink` cell; booking falls back to auto-Meet only if
a mentor has no link — so the system is provider-agnostic.

### 9. Header-mapped sheet access
**Decision:** Read/write by **column header name**, never by fixed index.
**Why:** The sheet is human-edited; columns get reordered. Header mapping makes the code resilient to
that and to added columns (`ensureColumn_` creates missing ones on demand).

### 10. Per-mentor locked availability tabs
**Decision:** Each mentor's schedule lives in its own `Avail_<ID>` tab, **protected** so only that
mentor (and the owner) can edit it.
**Why:** Mentors manage their own schedule directly, with isolation and edit-safety, without exposing
or risking other mentors' data. An `onEdit` guard normalizes loose input (`mon`→`Monday`, `5pm`→`17:00`).

### 11. Concurrency, validation, and graceful side-effects
**Decision:** Wrap booking in `LockService`; validate past/duplicate/overlap/mentor-conflict and that
the chosen time is a **published** slot; wrap emails/sheet side-effects in `safe_`.
**Why:** Reliability — no double-booked mentors, no race on session numbers, and a failed email never
fails the booking itself.

### 12. Multi-channel mentor feedback (sheet + email link)
**Decision:** With a single mentor in scope, mentor feedback is captured **in the sheet** — directly,
or via an **"Open the feedback sheet" link** in the notification email.
**Why:** Removes the in-app auth friction for the mentor while still writing to the same cells the
student portal reads live. A full mentor login was scoped and intentionally deferred (see below).

---

## Deliberately deferred (scope control)

- **Mentor login portal** — designed and prototyped, then deferred: with one mentor, sheet-based
  feedback is simpler and equally reliable. The architecture leaves room to add it (role routing).
- **Cancellation / rescheduling** — the data model (status + completion columns) supports it; left out
  to keep the core loop tight for this milestone.
- **Multi-mentor scale features** (per-mentor dashboards, notifications digest) — straightforward
  extensions of the existing per-mentor tabs and header-mapped data.

---

## Summary

The guiding principle was **a tight, reliable core loop** — discover, book a real slot, meet, and
close the two-way feedback — built on **transparent, zero-cost infrastructure** that the program team
can operate directly, with the integration choices (org-domain ownership, Zoom) made to work *within
the real constraints* of the `ssb.scaler.com` Workspace rather than around them.
