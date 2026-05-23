import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const products = await prisma.product.findMany({
    include: {
      stockLevels: {
        include: { warehouse: true },
      },
    },
  })

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    stock: p.stockLevels.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      total: s.total,
      reserved: s.reserved,
      available: s.total - s.reserved,
    })),
  }))

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  })
}