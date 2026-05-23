import { redis } from "./redis"

const LOCK_TTL_MS = 5000

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `lock:${key}`
  const lockValue = crypto.randomUUID()

  const acquired = await redis.set(
    lockKey,
    lockValue,
    "PX",
    LOCK_TTL_MS,
    "NX"
  )

  if (!acquired) {
    throw new Error("LOCK_UNAVAILABLE")
  }

  try {
    return await fn()
  } finally {
    const current = await redis.get(lockKey)
    if (current === lockValue) {
      await redis.del(lockKey)
    }
  }
}