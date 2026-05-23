import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const mumbai = await prisma.warehouse.create({
    data: { name: "Mumbai Hub", location: "Mumbai, India" },
  })
  const delhi = await prisma.warehouse.create({
    data: { name: "Delhi Hub", location: "Delhi, India" },
  })

  const products = [
    { name: "Wireless Headphones", description: "Noise-cancelling, 30hr battery" },
    { name: "Mechanical Keyboard", description: "TKL layout, Cherry MX switches" },
    { name: "USB-C Hub", description: "7-in-1, 4K HDMI support" },
  ]

  for (const p of products) {
    const product = await prisma.product.create({ data: p })
    await prisma.stockLevel.createMany({
      data: [
        { productId: product.id, warehouseId: mumbai.id, total: 10, reserved: 0 },
        { productId: product.id, warehouseId: delhi.id, total: 5, reserved: 0 },
      ],
    })
  }

  console.log("✅ Seeded database")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())