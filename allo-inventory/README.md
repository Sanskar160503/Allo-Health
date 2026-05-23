# Allo Inventory — Take-Home Exercise

A Next.js inventory reservation system with concurrency-safe stock holding.

## Live URL
<!-- Add your Vercel URL after deploying -->

## Local Setup

### Prerequisites
- Node.js 18+
- A Supabase account (free tier)
- An Upstash Redis account (free tier)

### Environment Variables
Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://..."        # Supabase pooled connection
DIRECT_URL="postgresql://..."          # Supabase direct connection
REDIS_URL="rediss://..."               # Upstash Redis URL
CRON_SECRET="your-secret-here"         # Any random string
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

## How the Concurrency Problem is Solved

When two users try to reserve the last unit simultaneously, a race condition
can cause both to succeed — leaving stock at -1.

**Solution: Redis distributed lock**

Before touching the database, each reservation request acquires a Redis lock
on the key `lock:productId:warehouseId` using the `SET NX PX` command:

- `NX` — only set if the key does **not** exist
- `PX` — auto-expire after 5 seconds (safety net if the server crashes)

Redis processes commands atomically, so exactly one request gets `OK` and
holds the lock. The other gets `null` and immediately returns a 409.

The lock holder then reads available stock, checks it's sufficient, and
updates both `StockLevel.reserved` and creates the `Reservation` row in a
single Prisma transaction. The lock is released in a `finally` block.

## How Expiry Works in Production

Reservations have a 10-minute window. Expiry is handled two ways:

**1. Vercel Cron (primary):** `vercel.json` schedules `GET /api/cron/cleanup`
every minute. It finds all `PENDING` reservations where `expiresAt < now`,
sets them to `RELEASED`, and decrements `StockLevel.reserved` in a
transaction. The endpoint is protected by a `CRON_SECRET` bearer token.

**2. Lazy cleanup (secondary):** The confirm endpoint checks `expiresAt`
before confirming and releases the reservation if it has expired, returning
a 410. This catches any reservations the cron may have missed.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List products with available stock |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Reserve units (409 if insufficient stock) |
| GET | `/api/reservations/:id` | Get reservation details |
| POST | `/api/reservations/:id/confirm` | Confirm reservation (410 if expired) |
| POST | `/api/reservations/:id/release` | Release reservation early |
| GET | `/api/cron/cleanup` | Release expired reservations (cron only) |

## Trade-offs & What I'd Do Differently

**Trade-offs made:**
- Used a single Redis lock per product/warehouse instead of per-reservation —
  simpler and sufficient for this scale
- Cron runs every minute so there's up to a 60-second window where expired
  stock isn't returned; lazy cleanup on confirm covers this gap
- No pagination on the products endpoint — fine for demo, needed at scale

**With more time:**
- Add idempotency keys on reserve and confirm endpoints
- Add optimistic UI updates so stock counts refresh after reserving
- Add proper error boundaries in the frontend
- Add integration tests for the concurrency logic
- Use Postgres row-level locking (`SELECT FOR UPDATE`) as an alternative
  to Redis for simpler infrastructure