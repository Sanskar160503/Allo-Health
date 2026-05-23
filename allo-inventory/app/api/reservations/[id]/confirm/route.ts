import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const reservation = await prisma.reservation.findUnique({
    where: { id },
  })

  if (!reservation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (reservation.status !== "PENDING") {
    return NextResponse.json(
      { error: "Reservation is no longer pending" },
      { status: 409 }
    )
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
    return NextResponse.json(
      { error: "Reservation has expired" },
      { status: 410 }
    )
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

  return NextResponse.json(updated)
}