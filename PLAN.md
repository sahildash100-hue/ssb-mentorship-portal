# SSB Mentorship Booking Portal — Build Plan

## Architecture
GAS web app. Server = `Code.gs`; client served via `HtmlService`. Browser ↔ server
only through `google.script.run` (async, JSON-only). Integrations: Sheets (data),
Advanced Calendar Service (event + Meet), Gmail (emails), `Session` (auth).

## Files
- `Code.gs` — `doGet`, `include`, all server functions + helpers
- `index.html` — shell, view containers, modals; includes styles + javascript
- `styles.html` — Bootstrap 5 (CDN) + custom CSS
- `javascript.html` — routing, render fns, `google.script.run`, spinners/toasts

## Server functions (Code.gs)
Auth/data: `getActiveStudent`, `getDashboardData`, `getStudentSessions_`, `getMentors`.
Booking: `canBook`, `bookSession`, `createCalendarEvent_` (Meet), `appendSessionRow_`, `nextSessionNumber` (inline).
Feedback: `submitStudentFeedback`, `getMentorFeedbackContext`, `submitMentorFeedback`.
Email: `sendStudentConfirmation_`, `sendMentorNotification_`, `requestMentorFeedbackForPrevious_`.
Helpers: `readObjects_`, `headerIndex_`, date/format/escape, `LockService`.

## Client views
Access-Denied · Dashboard (info + summary + My Sessions) · Mentors (cards) ·
Booking modal · Student Feedback modal · History · Mentor Feedback page (`?view=mentor-feedback&sid=`).

## Tricky bits (handled)
1. Meet link → Advanced Calendar Service `Calendar.Events.insert(..., {conferenceDataVersion:1})`.
2. Booking validations (past/duplicate/overlap) + `LockService` around append/number.
3. Feedback gates on completed sessions; mentor-feedback request email on new booking.

## Build order (done)
Scaffold → auth+dashboard → mentors → feedback gate → booking → calendar/meet →
emails → mentor-feedback page → history → polish (spinners/toasts/responsive).

## Deploy
Web app · execute as *user accessing* · access *anyone in org* · enable Calendar API ·
share the Sheet (Editor) with the org. See `README.md`.
