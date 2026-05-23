import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withLock } from "@/lib/lock"
import { z } from "zod"

const schema = z.object({
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    )
  }

  const { productId, warehouseId, quantity } = parsed.data
  const lockKey = `${productId}:${warehouseId}`

  try {
    const reservation = await withLock(lockKey, async () => {
      const stock = await prisma.stockLevel.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
      })

      if (!stock || stock.total - stock.reserved < quantity) {
        throw new Error("INSUFFICIENT_STOCK")
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

      const [, reservation] = await prisma.$transaction([
        prisma.stockLevel.update({
          where: { productId_warehouseId: { productId, warehouseId } },
          data: { reserved: { increment: quantity } },
        }),
        prisma.reservation.create({
          data: { productId, warehouseId, quantity, expiresAt },
        }),
      ])

      return reservation
    })

    return NextResponse.json(reservation, { status: 201 })
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { error: "Not enough stock available" },
        { status: 409 }
      )
    }
    if (err.message === "LOCK_UNAVAILABLE") {
      return NextResponse.json(
        { error: "Too many requests, please try again" },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}