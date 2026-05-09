# LexVision Notification System — Verification Report

Date: 2026-05-08
Scope: Citizen Portal, Police Dashboard, Admin Dashboard

This document is the manual smoke-test for the in-app notification system.
It complements (does NOT replace) the existing SMS notification flow.

---

## 1. What was changed in this pass

### Backend (no changes required — already wired)
- `Notification` model and PostgreSQL table (verified empty for new installs).
- Migration `20260508_0007_add_notifications.py` applied.
- `services/notifications.py` — best-effort, never raises.
- Routers `routers/notifications.py` — staff (`/api/notifications`) and citizen (`/api/citizen-notifications`).
- Integration points:
  - `routers/citizen_reports.py` — citizen + police on submission.
  - `routers/evidence_reports.py` — citizen on UNDER_REVIEW / VALIDATED / REJECTED, admins on VALIDATED.
  - `routers/tickets.py` — citizen + admins on issue.
  - `worker.py` — citizen + police on AI completion, admins on inference failure.

### Frontend
- All three `useNotifications` hooks: 15s visibility-aware polling, optimistic updates with rollback, `deleteNotification`, `refresh`.
- 401 in `mockDb.getStaffNotifications` now triggers `auth.logout()` + redirect to `/login` and surfaces a friendly "Your session has expired" message.
- Notification centre page redesigned for **all three portals**:
  - Light card theme (no more dark blocks).
  - Header with title + subtitle + Refresh + Mark all read.
  - Summary stat cards (Unread / High priority / Total / etc).
  - Tabs: All, Reports, AI/ML, Tickets, System.
  - Loading skeleton, empty state, error state with retry — no harsh red text.
- Notification bell dropdown redesigned for all three portals:
  - Light theme matching dashboard.
  - 380 px, anchored to bell, mobile-safe (`maxWidth: calc(100vw - 16px)`).
  - Skeleton + empty + error+retry states.
  - Click an item → navigates to the correct destination + closes dropdown.
- Police topbar dropdown z-index raised to 1100; no longer overlaps sidebar.
- Citizen portal bell now lives inside the shared `Navbar`'s `notificationSlot` (visible on desktop and mobile, no fixed-overlay).

### Auth
- `getStaffNotifications` already validates the staff token (police+admin).
- Citizen notifications use `requireCitizenSessionToken` (citizen JWT).
- "Could not validate credentials" backend text is mapped to "Could not load notifications." in the UI; a session-expired 401 leads to auto-logout.

---

## 2. Manual verification script

Pre-requisite: backend running at `http://localhost:8000`, three frontend apps running at the dev ports.

### Sample data check

```
PGPASSWORD=password123 psql -h localhost -U lexvision_user -d lexvision \
  -c "SELECT count(*), recipient_role FROM notifications GROUP BY recipient_role;"
```

If empty (new install), trigger any flow below to populate it.

### Test A — Citizen submits a report

1. Login to citizen portal with email and password.
2. Submit a report.
3. **Citizen portal**: bell badge increments within 15s, dropdown shows "Your report was submitted".
4. **Police dashboard** (logged in as police@lexvision.com): bell badge increments within 15s, dropdown shows "New report waiting for review".

### Test B — AI completes

1. Wait for AI worker to process the report from Test A.
2. **Citizen portal**: bell shows "AI analysis is ready" / similar.
3. **Police dashboard**: bell shows "AI analysis is ready" with link to queue item.

### Test C — Police validates / rejects

1. As police, open `/dashboard/queue/{id}` and Validate.
2. **Citizen portal**: bell shows "Your report was validated".
3. **Admin dashboard** (logged in as admin@lexvision.com): bell shows the validation event.

### Test D — Police rejects

1. As police, reject another report.
2. **Citizen portal**: bell shows "Your report was rejected" with the rejection reason.

### Test E — Ticket issued

1. As police, issue a ticket on a validated report.
2. **Citizen portal**: bell shows "A ticket was issued".
3. **Admin dashboard**: bell shows "Ticket issued".

### Test F — AI failure

1. Stop the worker or mis-configure the model so inference fails.
2. **Admin dashboard**: bell shows "AI inference failed" with high priority.
3. **Citizen portal**: no scary technical error shown to the citizen.

### Test G — Mark read

1. Open the bell, click any unread notification.
2. The unread badge decreases by one immediately (optimistic).
3. After navigation, the destination page loads correctly.
4. Refresh the page — the read state persists from the backend.

### Test H — Mark all read

1. Click "Mark all read" in the dropdown header.
2. Bell badge drops to 0 instantly.
3. Notification centre page shows zero unread.
4. Refresh — state persists.

### Test I — Visibility-aware polling

1. Open the dashboard, observe network tab — `/api/notifications/unread-count` fires every 15s.
2. Switch tabs (or minimize the window) — polling stops.
3. Switch back — polling resumes immediately.

### Test J — Session expiry

1. Login, then manually clear the `lexvision_user_session` localStorage entry OR rotate the backend `SECRET_KEY`.
2. Navigate to `/dashboard/notifications`.
3. The page redirects to `/login` and the dropdown does not show "Could not validate credentials."

### Test K — Empty state

1. Mark all notifications read and clear the table.
2. Notification centre + dropdown should show the small bell icon + "No notifications" + "You are all caught up."
3. **No huge dark empty card** (regression guard).

### Test L — Error state

1. Stop the backend.
2. Open the notification centre page.
3. Page shows "Could not load notifications" with a "Try again" button.
4. The dropdown shows the same friendly error with a retry button.

### Test M — Cross-role isolation

1. As police, you must NOT see admin-only notifications (e.g. `worker_failure`).
2. As admin, you should see admin notifications and may also see ones tagged for ADMIN role.
3. Citizen never sees staff notifications.

This is enforced by `_staff_notifications_query` filtering on `recipient_user_id` and `_citizen_notifications_query` filtering on `recipient_citizen_id`.

---

## 3. Known limitations / future work

- Polling, not WebSocket/SSE. The hook is structured so a future SSE channel can replace `setInterval` cleanly.
- "Mark all read" hits a single endpoint; no per-category mark-read.
- Notification centre pagination is implicit (limit 50). Add `loadMore` if backlog grows.
- Mobile sheet UX for the dropdown is dropdown-style only; a true bottom-sheet pattern would be nicer on phones.

---

## 4. Production readiness checklist

- [x] SMS pipeline untouched
- [x] Auth tokens correctly scoped (staff vs citizen)
- [x] 401 → friendly redirect, never raw backend text
- [x] Best-effort notification creation (never blocks main workflow)
- [x] Role-based queries enforced server-side
- [x] Polling pauses when tab hidden
- [x] Optimistic updates with rollback
- [x] Loading / empty / error states for every list view
- [x] Mobile-safe dropdown width
- [x] Click navigation routes to correct page
- [x] No huge dark cards / harsh empty states
- [x] TypeScript clean across police, admin, citizen apps
