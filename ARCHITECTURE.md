# Architecture Overview

SSB Mentorship Booking Portal — how the pieces fit, the data model, and the core workflows.
Diagrams are [Mermaid](https://mermaid.live) (render in any Mermaid-aware viewer).

---

## 1. System architecture

A single **Google Apps Script web app** is the whole backend + frontend. A **Google Sheet**
is the database. Google **Calendar**, **Zoom**, and **Gmail** are the integrations.

```mermaid
flowchart TD
    subgraph browser["🧑‍🎓 Student browser (SPA)"]
        UI["index.html · javascript.html · styles.html<br/>dark-theme single-page app"]
    end
    subgraph gas["⚙️ Apps Script (Code.gs) — executes AS the signed-in user"]
        SRV["Server functions<br/>auth · booking · availability · feedback · emails"]
    end
    subgraph sheet["📊 Google Sheet — the database"]
        ST["Student Data"]
        MD["Mentor Details"]
        MS["Master Session Details"]
        AV["Avail_&lt;MentorID&gt; (locked, per mentor)"]
    end
    CAL["📅 Google Calendar<br/>(Advanced Calendar Service)"]
    ZOOM["🎥 Zoom<br/>(mentor's personal room link)"]
    GM["✉️ Gmail<br/>(confirmations / notifications)"]

    UI <-->|google.script.run| SRV
    SRV <-->|read / write| ST
    SRV <-->|read| MD
    SRV <-->|read / write| MS
    SRV <-->|read schedule| AV
    SRV -->|create invite| CAL
    SRV -->|attach join link| ZOOM
    SRV -->|send mail| GM
```

**Key property:** the web app is deployed **"execute as the user accessing it."** So each request
runs as that student's Google identity — which is how silent login works and why the project is
**owned by an `ssb.scaler.com` account** (same domain as the reviewer → no third-party app block).

---

## 2. Data model (Google Sheet)

The code maps columns **by header name** (order can change, spelling can't).

| Tab | Columns | Purpose |
|---|---|---|
| **Student Data** | `Student Email`, `Full Name`, `Roll No`, `Batch` | Registered students (login lookup) |
| **Mentor Details** | `ID`, `Name`, `Email`, `LinkedIn`, `University`, `Education Stream`, `Current Role`, `Current Organization`, `Skills`, `PhotoLink`, `MeetingLink`, `Year of Exp` … | Mentor profiles |
| **Master Session Details** | `Student Email`, `Full Name`, `Roll No`, `Batch`, `Meetlink`, `MSN Session`, `MSN-Mentor`, `MSN-DATETime`, `MSN-StudentFeedback`, `MSN-StudentRating`, `MSN-MentorFeedback`, `MSN-MentorRating`, `MSN-StudentCompleted`, `MSN-MentorCompleted` | Every booked session + its feedback + completion state |
| **Avail_&lt;MentorID&gt;** | `Day`, `Start Time` | Each mentor's **recurring weekly** availability (locked to that mentor) |

```mermaid
erDiagram
    STUDENT_DATA ||--o{ MASTER : "books"
    MENTOR_DETAILS ||--o{ MASTER : "mentors"
    MENTOR_DETAILS ||--|| AVAIL : "owns (locked tab)"
    MASTER {
        text Student_Email
        text MSN_Session
        text MSN_Mentor
        datetime MSN_DATETime
        text MSN_StudentFeedback
        int  MSN_StudentRating
        text MSN_MentorFeedback
        int  MSN_MentorRating
        date MSN_StudentCompleted
        date MSN_MentorCompleted
    }
    AVAIL {
        text Day
        text Start_Time
    }
```

---

## 3. Availability → bookable slots

The mentor stores a **fixed weekly schedule** (e.g. Mon/Wed/Fri × 17:00, 18:00). The server
expands those rules into concrete, dated slots for the next **4 weeks**, dropping past times and
already-booked ones. The student sees a **calendar date picker** + the slots for the chosen day.

```mermaid
flowchart LR
    R["Avail_&lt;ID&gt; tab<br/>Day + Start Time (weekly rules)"] --> G["getMentorSlots()<br/>generate next 4 weeks<br/>− past − booked"]
    G --> P["Booking modal<br/>calendar date → slot pills"]
    P --> B["bookSession()"]
```

---

## 4. Booking workflow

```mermaid
sequenceDiagram
    actor S as Student
    participant A as App (Code.gs)
    participant CAL as Calendar
    participant SH as Sheet
    participant GM as Gmail
    S->>A: pick mentor + slot → Confirm
    A->>A: validate (future, not duplicate/overlap, mentor free, slot is published)
    A->>CAL: create event (attendees = student + mentor)
    Note over A,CAL: meeting link = mentor's Zoom room (no auto-Meet)
    A->>SH: append row to Master (MSN-#, datetime, Zoom link)
    A->>GM: confirmation → student · notification → mentor
    A-->>S: booked ✓ (Zoom link + invite)
    Note over A: LockService guards the session-number + write
```

---

## 5. Completion & feedback workflow (the state machine)

Mentor feedback unlocks only when **both** sides confirm the meeting happened.

```mermaid
stateDiagram-v2
    [*] --> Booked
    Booked --> Student_Completed: student "Mark complete"\n(emails mentor a feedback link)
    Student_Completed --> Done: mentor writes feedback in sheet\n(or via emailed sheet link)
    Booked --> Student_Feedback: student submits feedback (text + 1–5)
    Note right of Student_Feedback: feedback **gate** —\ncan't re-book until past sessions are reviewed
    Done --> [*]
```

- **Student feedback:** stored in `MSN-StudentFeedback` / `MSN-StudentRating`. A **gate** blocks
  booking again until past completed sessions are reviewed.
- **Mentor feedback:** stored in `MSN-MentorFeedback` / `MSN-MentorRating`, entered in the sheet
  (directly, or via the **Open the feedback sheet** link in the email).
- Both feedbacks are visible to the student in the **feedback viewer**.

---

## 6. Integrations & automation

| Integration | Use | How |
|---|---|---|
| **Google Calendar** | Session invite to both parties | Advanced Calendar Service `Events.insert` |
| **Zoom** | The actual meeting room (join link) | Mentor's personal room URL stored in `MeetingLink` |
| **Gmail** | Confirmation, mentor notification, feedback request | `GmailApp.sendEmail` (HTML) |
| **Google Sheet** | Database (read/write live) | `SpreadsheetApp`, header-mapped |

**Automation built in**
- Auto meeting + invite + 3 emails on booking / completion.
- **Recurring slot generation** (4 weeks) from weekly rules — no manual dated entries.
- **`onEdit` format guard** — normalizes the mentor's typed `Day`/`Start Time` (e.g. `mon`→`Monday`, `5pm`→`17:00`).
- **Idempotent setup** — `setupEverything` / `provisionAllMentorSheets` / `verifySetup` re-run safely.

---

## 7. Reliability & scalability

**Reliability**
- `LockService` serializes booking writes → no duplicate session numbers / race double-books.
- Validations: past-date, duplicate, student-overlap, **mentor double-booking**, slot-must-be-published.
- Email/sheet side-effects wrapped in `safe_` so a failure never breaks the booking.

**Scalability & trade-offs**
- **Sheet-as-DB** is transparent, zero-cost, and ideal at cohort scale (hundreds of students,
  thousands of sessions). It is *not* a high-write transactional DB — for tens of thousands of
  concurrent bookings you'd migrate to Firestore/Postgres. The header-mapped access layer keeps
  that migration localized to the data functions.
- **Per-mentor availability tabs** scale linearly with mentors and keep each schedule isolated + lockable.

---

## 8. Security model

- **Allowlist** (`ALLOWED_STUDENTS`) — explicit control over who can log in.
- **Silent identity** — `Session.getActiveUser().getEmail()`; org-domain ownership makes same-domain
  users' identity reliable (and blocks impersonation — you are who you're signed in as).
- **Locked availability tabs** — protected ranges; only the assigned mentor edits their schedule.
- **Per-row ownership checks** — students act only on their own sessions; mentor feedback is matched to the mentor email.
