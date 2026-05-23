import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withIdempotency } from "@/lib/idempotency"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const idempotencyKey = req.headers.get("idempotency-key")

  async function confirmReservation() {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
    })

    if (!reservation) {
      return { body: { error: "Not found" }, status: 404 }
    }

    if (reservation.status !== "PENDING") {
      return {
        body: { error: "Reservation is no longer pending" },
        status: 409,
      }
    }

    if (new Date() > reservation.expiresAt) {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        }),
        prisma.stockLevel.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reserved: { decrement: reservation.quantity } },
        }),
      ])
      return { body: { error: "Reservation has expired" }, status: 410 }
    }

    const [updated] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
      }),
      prisma.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          total: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      }),
    ])

    return { body: updated, status: 200 }
  }

  const result = idempotencyKey
    ? await withIdempotency(idempotencyKey, confirmReservation)
    : await confirmReservation()

  return NextResponse.json(result.body, { status: result.status })
}