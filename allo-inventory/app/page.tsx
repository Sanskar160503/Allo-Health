"use client"

import { useEffect, useState, useCallback } from "react"
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

const PRODUCT_ICONS: Record<string, string> = {
  "Wireless Headphones": "🎧",
  "Mechanical Keyboard": "⌨️",
  "USB-C Hub": "🔌",
}

function getIcon(name: string) {
  return PRODUCT_ICONS[name] ?? "📦"
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reserving, setReserving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const saved = localStorage.getItem("theme")
    if (saved === "dark") setDark(true)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])

  const fetchProducts = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    else setRefreshing(true)
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then(setProducts)
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [])

  // Initial load
  useEffect(() => {
    fetchProducts(true)
  }, [fetchProducts])

  // Poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchProducts(false), 10000)
    return () => clearInterval(interval)
  }, [fetchProducts])

  // Refresh on tab focus or visibility change
  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden) fetchProducts(false)
    }
    function handleFocus() {
      fetchProducts(false)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleFocus)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleFocus)
    }
  }, [fetchProducts])

  const totalAvailable = products.reduce(
    (acc, p) => acc + p.stock.reduce((a, s) => a + s.available, 0),
    0
  )
  const totalReserved = products.reduce(
    (acc, p) => acc + p.stock.reduce((a, s) => a + s.reserved, 0),
    0
  )

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

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">

        {/* Navbar */}
        <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">A</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
              allo<span className="text-emerald-500">.</span>inventory
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full font-medium border border-emerald-200 dark:border-emerald-800">
              ● Live
            </span>
            <button
              onClick={() => fetchProducts(false)}
              disabled={refreshing}
              title="Refresh stock"
              className={`w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all ${
                refreshing ? "animate-spin" : ""
              }`}
            >
              🔄
            </button>
            <button
              onClick={() => setDark(!dark)}
              className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </nav>

        <main className="max-w-3xl mx-auto px-4 py-10">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Warehouse Stock
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Reserve products across Mumbai and Delhi hubs
            </p>
          </div>

          {/* Stats */}
          {!loading && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: "Products", value: products.length, color: "" },
                {
                  label: "Available units",
                  value: totalAvailable,
                  color: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  label: "Reserved now",
                  value: totalReserved,
                  color: "text-amber-600 dark:text-amber-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {s.label}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      s.color || "text-gray-900 dark:text-white"
                    }`}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 animate-pulse"
                >
                  <div className="flex gap-4 mb-4">
                    <div className="w-11 h-11 bg-gray-100 dark:bg-gray-800 rounded-xl" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3 mb-2" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                </div>
              ))}
            </div>
          )}

          {/* Products */}
          <div className="grid gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
              >
                {/* Product header */}
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-11 h-11 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-xl border border-gray-100 dark:border-gray-700">
                    {getIcon(product.name)}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                      {product.name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {product.description}
                    </p>
                  </div>
                </div>

                {/* Warehouse rows */}
                <div className="grid gap-3">
                  {product.stock.map((s) => {
                    const pct = Math.round((s.available / s.total) * 100)
                    const isLow = pct <= 30
                    const isOut = s.available === 0
                    const key = `${product.id}:${s.warehouseId}`
                    return (
                      <div
                        key={s.warehouseId}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex-1 mr-4">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {s.warehouseName}
                            </p>
                            <span
                              className={`text-xs font-medium ${
                                isOut
                                  ? "text-red-500"
                                  : isLow
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {isOut ? "Out of stock" : `${s.available} left`}
                            </span>
                          </div>
                          {/* Stock bar */}
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isOut
                                  ? "bg-red-400"
                                  : isLow
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {s.reserved} reserved · {s.total} total
                          </p>
                        </div>
                        <button
                          onClick={() => reserve(product.id, s.warehouseId)}
                          disabled={isOut || reserving === key}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            isOut
                              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                              : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 active:scale-95"
                          }`}
                        >
                          {reserving === key
                            ? "..."
                            : isOut
                            ? "Sold out"
                            : "Reserve"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-10">
            Stock refreshes automatically every 10 seconds
          </p>
        </main>
      </div>
    </div>
  )
}