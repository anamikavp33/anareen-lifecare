# API reference

Base URL: `/api`. All bodies are JSON. Errors return `{ "error": "message" }` with a suitable HTTP status (400 validation, 401 not signed in, 403 forbidden, 404 not found, 409 conflict, 429 rate-limited).

Authentication uses an httpOnly cookie set by `POST /api/auth/login`.

## Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check: `{ ok, name, database: "ok"\|"unavailable", uptimeSec, time }`; HTTP 503 if the database doesn't answer |
| GET | `/config` | `{ hospitalName, timezone, retentionDays, backupKeepDays }` |
| GET | `/departments` | All departments with `doctorCount` |
| GET | `/departments/:slug` | One department with its `doctors[]` |
| GET | `/doctors?department=<slug>` | Active doctors (optionally filtered) |
| GET | `/doctors/:id` | One doctor's live status |
| GET | `/track?doctorId=&token=` | Patient position for a token |
| POST | `/book` | Book today's token online: `{ doctorId, name, phone, consent: true }` → `{ token, code, bookingId, doctor, state, ahead, etaMin }` (201). `consent` must be exactly `true` |
| GET | `/my-tokens?phone=` | Today's tokens for a mobile number, with live positions |
| POST | `/bookings/:id/cancel` | Patient cancels: `{ phone, code }` |
| GET | `/summary` | Hospital-wide live counts |

**Doctor object**
```json
{
  "id": 1, "name": "Dr. Arun Menon", "designation": "MBBS, MD", "room": "101",
  "department": { "id": 1, "name": "General Medicine", "slug": "general-medicine", "icon": "🩺" },
  "status": "consulting", "resumeTime": null,
  "currentToken": 4, "issuedTokens": 9, "waiting": 5,
  "avgConsultMin": 8, "avgIsLearned": false, "defaultConsultMin": 8, "active": true
}
```

**Track response**
```json
{ "doctor": { … }, "token": 7, "state": "waiting", "ahead": 2, "etaMin": 24 }
```
`state` is one of `waiting`, `now`, `passed`, `cancelled`, `no_show`.

**My-tokens item**
```json
{ "bookingId": 12, "token": 6, "patient": "Ra*** K.", "source": "online", "bookingStatus": "booked",
  "doctor": { … }, "state": "waiting", "ahead": 3, "etaMin": 32 }
```
The doctor object also carries `online: { enabled, limit, used, left, open, note, reason, hours }`. `reason` is `null` when booking is open, otherwise `inactive`, `off`, `closed` or `full`; `note` is the same thing as an English sentence.

Booking errors: 400 (invalid name or number, consent not given, booking closed or switched off), 409 (number already has a token with this doctor today, or online quota full), 429 (too many bookings from this network).

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | Sets session cookie. Rate-limited. |
| POST | `/auth/logout` | | Clears cookie |
| GET | `/auth/me` | | Current user |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | New password min 8 chars |

## Queue control (doctor for own queue; admin/reception for any)

| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/queue/:id/next` | | `currentToken + 1`, status → consulting, announced |
| POST | `/queue/:id/previous` | | `currentToken − 1` (not below 0) |
| POST | `/queue/:id/set` | `{ token }` | Jump to a token (0–9999), announced |
| POST | `/queue/:id/status` | `{ status, resumeTime? }` | `consulting` / `break` / `unavailable`; `resumeTime` is `HH:MM` |
| POST | `/queue/:id/issue` | `{ name?, phone?, consent? }` | **Admin/reception only.** `consent: true` records that the patient agreed to the privacy notice. Returns `{ doctor, token, code, bookingId }` |
| POST | `/queue/:id/reset` | | Sets both counters to 0 |
| GET | `/queue/:id/history` | | Today's events, newest first |
| GET | `/queue/:id/upcoming` | | Next patients (name, source, status) |
| GET | `/queue/:id/bookings` | | All of today's bookings for this doctor |

## Staff: bookings

| Method | Path | Body | Who |
|---|---|---|---|
| GET | `/staff/bookings?doctorId=` | | Admin/reception (all); a doctor sees only their own. Each row includes `consentAt` (time or `null`) |
| POST | `/staff/bookings/:id/status` | `{ status }`: `arrived`, `no_show`, `cancelled` or `booked` (restore) | Admin/reception, or the booking's doctor |

All POSTs return `{ doctor }` and broadcast it over Socket.IO.

## Admin

| Method | Path | Role |
|---|---|---|
| GET | `/admin/departments` | admin, reception |
| POST / PUT / DELETE | `/admin/departments[/:id]` | admin |
| GET | `/admin/doctors` | admin, reception |
| POST | `/admin/doctors` (`{ name, departmentId, room?, designation?, avgConsultMin?, onlineEnabled?, onlineLimit?, username?, password? }`) | admin |
| PUT / DELETE | `/admin/doctors/:id` | admin |
| GET / POST | `/admin/users` | admin |
| POST | `/admin/users/:id/password` | admin |
| DELETE | `/admin/users/:id` | admin (not yourself, not the last admin) |
| GET | `/admin/stats` | admin, reception |
| GET | `/admin/audit?limit=` | admin |

## Socket.IO events

Client → server
- `watch` with a room name: `"all"`, `"department:<id>"`, or `"doctor:<id>"`
- `unwatch` with a room name

Server → client
- `doctor:update` with `{ doctor, announce }`: a queue changed. `announce` is true for calls the display board should speak.
- `structure:changed`: departments or doctors were added, edited or removed. Reload lists.
