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
I chose Redis because it is explicit, easy to reason about, and scales across
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
reducing the window where expired stock is not returned to ~60 seconds.
On the free tier, lazy cleanup on confirm is the safety net.

---

## Idempotency

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints
support idempotency via an `Idempotency-Key` header.

**How it works:**
1. Client generates a unique key (e.g. `crypto.randomUUID()`) and sends it as
   `Idempotency-Key: <uuid>` with the request
2. Server checks Redis for `idempotency:<key>`
3. If found — return the cached response immediately, no side effects
4. If not found — run the operation, store the response in Redis with 24hr TTL,
   then return the response

This means a client can safely retry a timed-out request without creating
duplicate reservations or double-confirming a payment.

**Testing idempotency:**

Run the same curl command twice with the same key — both responses will have
the identical reservation ID:

```bash
curl -X POST https://allo-inventory-liart.vercel.app/api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-123" \
  -d '{"productId":"YOUR_PRODUCT_ID","warehouseId":"YOUR_WAREHOUSE_ID","quantity":1}'
```

Get product and warehouse IDs from `/api/products`.

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
Key design decision: `available = total - reserved` is never stored — it is
always computed. This prevents the stock count from going stale.

---

## Trade-offs & What I'd Do Differently

**Trade-offs made:**

1. **Redis lock scope** — one lock per product+warehouse rather than per-SKU.
   Simpler and correct for this model. At higher scale you would want finer granularity.

2. **Cron frequency** — hourly on free tier instead of every minute.
   Lazy cleanup on confirm covers the gap in correctness.

3. **No pagination** — the products endpoint returns all products. Fine for demo
   scale, would need cursor-based pagination in production.

4. **Stock display** — the "Reserved now" stat only shows a non-zero value while
   a reservation is PENDING (between Reserve and Confirm/Cancel). Once confirmed,
   reserved goes back to 0 and total is decremented — which is the correct behavior.

**With more time:**
- Add integration tests specifically for the concurrency scenario
  (two simultaneous requests for the last unit — exactly one should succeed)
- Use Postgres `SELECT FOR UPDATE` as an alternative to Redis to reduce
  infrastructure complexity
- Add optimistic UI updates so available stock decrements immediately on reserve
- Add proper error boundaries and loading skeletons throughout
- Add cursor-based pagination for the products endpoint
- Add WebSocket or Server-Sent Events for real-time stock updates across
  multiple browser sessions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Postgres via Supabase |
| ORM | Prisma 6 |
| Cache / Lock | Redis via Upstash |
| Validation | Zod |
| Styling | Tailwind CSS |
| Hosting | Vercel |