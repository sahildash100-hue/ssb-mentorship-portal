# SSB Mentorship Booking Portal

A mentorship booking platform where students discover mentors, book 1:1 sessions on the
mentor's available slots, join the meeting, and both sides exchange feedback — with the
session history and feedback records kept automatically.

Built as a **Google Apps Script web app** backed by a **Google Sheet** (the database),
integrated with **Google Calendar**, **Zoom**, and **Gmail**.

> **One-line:** *Discover → book a slot → meet → review → it's all recorded.*

### 🔗 Open the live app
**https://script.google.com/macros/s/AKfycbxXt9VANAf6ae6YUsp3uOUfONYFZET4BmuMMUWaXoPFOJ5JILb0Mg6GZgm-xVK3UDEG8w/exec**

Sign in with a registered student account — e.g. the reviewer's `shanmuga@ssb.scaler.com`.

---

## Submission links

| Item | Link |
|---|---|
| **Live application (dashboard)** | https://script.google.com/macros/s/AKfycbxXt9VANAf6ae6YUsp3uOUfONYFZET4BmuMMUWaXoPFOJ5JILb0Mg6GZgm-xVK3UDEG8w/exec |
| **Source code repository** | https://github.com/sahildash100-hue/ssb-mentorship-portal |
| **Architecture overview** | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| **Setup instructions** | This file (below) |
| **Key product & technical decisions** | [`DECISIONS.md`](DECISIONS.md) |

**Roles for review**
- **Mentor:** Sahil Dash — `sahil.25035@ssb.scaler.com`
- **Reviewer / student:** `shanmuga@ssb.scaler.com`

---

## What it does

**Students can**
- Discover mentors (searchable directory by name / skills / org / role)
- Pick a date on a **calendar** and choose an **available slot** from the mentor's schedule
- Book a 60-min session → auto **Zoom link** + **Google Calendar** invite + confirmation email
- **Join** the meeting, view **upcoming vs past** sessions, see **booking status**
- **Mark a session complete**, submit **feedback** (text + 1–5 rating), and **view** both feedbacks
- **Remind** the mentor when their feedback is pending
- **Sign out / switch account**

**Mentors can**
- Be discovered with a full profile (photo, role, org, experience, skills, LinkedIn)
- Receive booking notifications and a feedback request
- Give feedback (text + 1–5) — directly in the sheet or via the emailed sheet link
- Set a **recurring weekly availability** (e.g. Mon/Wed/Fri × 2 slots) in a **locked** tab only they can edit

**The platform automatically**
- Generates the meeting + Calendar invite, sends emails, and records everything in the sheet
- Generates concrete bookable slots for the next 4 weeks from the mentor's weekly rules
- Prevents duplicate / overlapping / double-booked sessions
- Keeps full **session history**, **feedback records**, and **booking status**

---

## Repository structure

| File | Role |
|---|---|
| `Code.gs` | Server: auth, data access, booking, availability, feedback, emails, setup utilities |
| `index.html` | App shell + modals (booking, feedback, viewer) |
| `styles.html` | Dark-theme design system (Bootstrap 5 + custom CSS) |
| `javascript.html` | Client SPA: routing, rendering, `google.script.run` calls |
| `appsscript.json` | Manifest: timezone, scopes, Advanced Calendar Service, web-app config |
| `ARCHITECTURE.md` | System architecture, data model, workflows, integrations |
| `DECISIONS.md` | Key product & technical decisions and trade-offs |

---

## Setup & deployment

### Prerequisites
- A Google Workspace account to **own** the project (here: `sahil.25035@ssb.scaler.com`) — owning it inside the org domain lets org students sign in silently with no app-block.
- The bound Google Sheet with tabs: **Mentor Details**, **Master Session Details**, **Student Data**.

### 1. Create the Apps Script project
1. From the Sheet: **Extensions → Apps Script** (binds it to the sheet's data).
2. Paste `Code.gs` into the editor.
3. **File → New → HTML** three times, named exactly `index`, `styles`, `javascript`; paste each file.
4. **Project Settings → Show `appsscript.json`** → paste the manifest.

### 2. Enable the Advanced Calendar Service
**Services ( + ) → Calendar API → Add** (identifier `Calendar`, v3). Required for calendar invites.

### 3. One-shot setup
Run **`setupEverything`** once (function dropdown → Run → authorize). It:
- adds the reviewer as a student, shares the sheet (Editor) with reviewer + mentor,
- sets the mentor's `Year of Exp`, photo, and **Zoom** meeting link,
- provisions + locks each mentor's **availability tab** (recurring weekly slots).

Then run **`verifySetup`** → prints a PASS/FAIL readiness checklist (reviewer present, sheet shared, mentor profile complete, slots available).

### 4. Deploy
**Deploy → New deployment → Web app**
- **Execute as:** *User accessing the web app*
- **Who has access:** *Anyone*
- Authorize (Sheets / Calendar / Gmail scopes) → copy the **Web App URL** = the application link.

> After any code change: **Deploy → Manage deployments → edit → Version: New version → Deploy.** (The `/exec` URL serves the last *deployed* version, not just saved code.)

---

## How the reviewer tests it end-to-end

1. Open the Web App URL signed in as **`shanmuga@ssb.scaler.com`** → lands on the **student dashboard** (he's an allowed student in the same org domain as the owner).
2. **Mentors** → Sahil Dash appears **first** with photo + experience → **Book a Session**.
3. Pick a **Mon/Wed/Fri** date → choose **5:00 PM / 6:00 PM** → **Confirm** → receives a **Zoom link + Calendar invite + email**.
4. **Join** via Zoom (personal room — not blocked by the org's Meet policy).
5. **Mark complete** → submit **student feedback** (text + rating).
6. **Mentor** (`sahil.25035@ssb.scaler.com`) gets an email → writes feedback in the sheet → it appears in the student's portal.
7. Student opens the **feedback viewer** to read both sides; the **Master Session Details** sheet holds the full record.

---

## Security & access

- **Login allowlist** — only approved emails (`ALLOWED_STUDENTS`) can enter, even if present in the sheet.
- **Silent auth** — identity from the signed-in Google account (`Session.getActiveUser`); same-domain org users are recognized with no password screen beyond Google.
- **Per-mentor locked tabs** — each mentor's availability tab is a protected range only they (and the owner) can edit.
- **Server-side secrets / scopes** — the app runs with least-needed scopes (Sheets, Calendar, Gmail); the Zoom link is the mentor's own room.

---

## Notes
- Timezone: **Asia/Kolkata** (manifest). Sessions are **60 minutes**.
- Runs on **$0** infrastructure (Apps Script + Google Sheet).
- See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the data model + workflow diagrams and [`DECISIONS.md`](DECISIONS.md) for the rationale behind the key choices.
