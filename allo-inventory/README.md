# Allo Inventory — Take-Home Exercise

A concurrency-safe inventory reservation system built with Next.js, Prisma, Redis, and Supabase.

## Live URL
https://allo-inventory-liart.vercel.app

## GitHub
https://github.com/Sanskar160503/Allo-Health

---

## Problem Understanding

The core challenge is a race condition at checkout: two users can simultaneously
read the same available stock, both believe they can reserve, and both succeed —
leaving stock at -1. 

The solution is a **reservation system** with three states:
- `PENDING` — units are held for 10 minutes while payment processes
- `CONFIRMED` — payment succeeded, stock is permanently decremented
- `RELEASED` — payment failed, timer expired, or user cancelled — units return to available

The hard part is making the reservation step race-condition-free under concurrency.

---

## How the Concurrency Problem is Solved

Before touching the database, each reservation request acquires a **Redis distributed lock**
on the key `lock:productId:warehouseId` using Redis `SET NX PX`:

- `NX` — only set if the key does **not** exist (atomic check-and-set)
- `PX 5000` — auto-expire after 5 seconds (safety net if the server crashes mid-request)

Redis processes commands atomically. If two requests race:
1. Request A calls `SET lock:xyz NX` → gets `OK`, acquires the lock
2. Request B calls `SET lock:xyz NX` → gets `null`, immediately returns 409
3. Request A reads stock, checks availability, updates `reserved` and creates
   the reservation row in a single Prisma transaction, then releases the lock

The lock value is a `crypto.randomUUID()` so only the owner can release it —
preventing a slow request from accidentally releasing another request's lock.

**Alternative considered:** Postgres `SELECT FOR UPDATE` row-level locking.
This would work equally well and reduce infrastructure complexity (no Redis needed).
I chose Redis because it's explicit, easy to reason about, and scales across
multiple server instances without database coupling.

---

## How Expiry Works in Production

Reservations have a 10-minute window (`expiresAt = now + 10 minutes`).

**Primary — lazy cleanup on confirm:**
When a client calls `POST /api/reservations/:id/confirm`, the endpoint checks
`expiresAt < now` before confirming. If expired, it releases the reservation
and returns 410. This guarantees correctness even if the background job is delayed.

**Secondary — Vercel Cron:**
`vercel.json` schedules `GET /api/cron/cleanup` to run hourly (free tier limit).
It finds all `PENDING` reservations where `expiresAt < now`, sets them to `RELEASED`,
and decrements `StockLevel.reserved` in a Prisma transaction.
The endpoint is protected by a `CRON_SECRET` bearer token to prevent abuse.

**Trade-off:** With a Pro Vercel plan, the cron would run every minute,
reducing the window where expired stock isn't returned to ~60 seconds.
On the free tier, lazy cleanup on confirm is the safety net.

---

## Local Setup

### Prerequisites
- Node.js 18+
- A Supabase account (free tier) — for hosted Postgres
- An Upstash account (free tier) — for hosted Redis

### Environment Variables
Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://..."         # Supabase pooled connection URL
DIRECT_URL="postgresql://..."           # Supabase direct connection URL
REDIS_URL="rediss://..."                # Upstash Redis URL
CRON_SECRET="your-random-secret"        # Any random string
NEXT_PUBLIC_APP_URL="http://localhost:3000"
RESERVATION_EXPIRY_MINUTES="10"
```

### Run Locally

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database Setup
- Supabase: get both `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) from
  the Connect page → ORMs tab
- The `directUrl` is required for Prisma migrations to work with Supabase's
  connection pooler

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List products with available stock per warehouse |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Reserve units — 409 if insufficient stock |
| GET | `/api/reservations/:id` | Get reservation details |
| POST | `/api/reservations/:id/confirm` | Confirm reservation — 410 if expired |
| POST | `/api/reservations/:id/release` | Release reservation early |
| GET | `/api/cron/cleanup` | Release expired reservations (cron only) |

---

## Data Model
Product
id, name, description, imageUrl
Warehouse
id, name, location
StockLevel (one row per product+warehouse)
total      — physical units in warehouse
reserved   — currently held by PENDING reservations
available  — computed as total - reserved
Reservation
status     — PENDING | CONFIRMED | RELEASED
expiresAt  — 10 minutes from creation
quantity   — units held

Key design decision: `available = total - reserved` is never stored — it's
always computed. This prevents the stock count from going stale.

