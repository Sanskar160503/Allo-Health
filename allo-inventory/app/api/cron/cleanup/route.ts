import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  // Security: verify this is called by Vercel Cron, not a random person
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Find all expired pending reservations
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
  })

  if (expired.length === 0) {
    return NextResponse.json({ released: 0 })
  }

  // Release each one and restore stock
  await prisma.$transaction(
    expired.flatMap((r) => [
      prisma.reservation.update({
        where: { id: r.id },
        data: { status: "RELEASED" },
      }),
      prisma.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: r.productId,
            warehouseId: r.warehouseId,
          },
        },
        data: { reserved: { decrement: r.quantity } },
      }),
    ])
  )

  console.log(`Released ${expired.length} expired reservations`)
  return NextResponse.json({ released: expired.length })
}