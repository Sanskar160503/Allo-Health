"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type StockLevel = {
  warehouseId: string
  warehouseName: string
  total: number
  reserved: number
  available: number
}

type Product = {
  id: string
  name: string
  description: string
  stock: StockLevel[]
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [reserving, setReserving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [])

  async function reserve(productId: string, warehouseId: string) {
    setReserving(`${productId}:${warehouseId}`)
    setError(null)
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to reserve")
        return
      }
      router.push(`/reservation/${data.id}`)
    } finally {
      setReserving(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading products...</p>
      </div>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Allo Inventory</h1>
      <p className="text-gray-500 mb-8">Select a product and warehouse to reserve</p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {products.map((product) => (
          <div key={product.id} className="border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{product.name}</h2>
            <p className="text-gray-500 text-sm mb-4">{product.description}</p>

            <div className="grid gap-3">
              {product.stock.map((s) => (
                <div
                  key={s.warehouseId}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{s.warehouseName}</p>
                    <p className="text-sm text-gray-500">
                      {s.available} available
                      <span className="ml-2 text-gray-400">
                        ({s.reserved} reserved of {s.total})
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => reserve(product.id, s.warehouseId)}
                    disabled={
                      s.available === 0 ||
                      reserving === `${product.id}:${s.warehouseId}`
                    }
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium
                      disabled:opacity-40 disabled:cursor-not-allowed
                      hover:bg-gray-800 transition-colors"
                  >
                    {reserving === `${product.id}:${s.warehouseId}`
                      ? "Reserving..."
                      : s.available === 0
                      ? "Out of stock"
                      : "Reserve"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}