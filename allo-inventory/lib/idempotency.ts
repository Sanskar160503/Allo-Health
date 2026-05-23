import { redis } from "./redis"

const TTL_SECONDS = 60 * 60 * 24 // 24 hours

export async function withIdempotency<T extends { body: unknown; status: number }>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const redisKey = `idempotency:${key}`

  // Check if we already have a stored response
  const cached = await redis.get(redisKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // Run the actual function
  const result = await fn()

  // Store the result for future retries
  await redis.set(redisKey, JSON.stringify(result), "EX", TTL_SECONDS)

  return result
}