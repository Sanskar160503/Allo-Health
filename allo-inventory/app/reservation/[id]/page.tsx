"use client"

import { use, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

type Reservation = {
  id: string
  productId: string
  warehouseId: string
  quantity: number
  status: "PENDING" | "CONFIRMED" | "RELEASED"
  expiresAt: string
  createdAt: string
}

function useCountdown(expiresAt: string | null) {
  const [seconds, setSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) return
    const update = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      )
      setSeconds(diff)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  if (seconds === null) return { seconds: null, display: "..." }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return { seconds, display: `${mins}:${secs.toString().padStart(2, "0")}` }
}

export default function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dark, setDark] = useState(false)
  const [redirectIn, setRedirectIn] = useState<number | null>(null)
  const router = useRouter()
  const { seconds, display } = useCountdown(reservation?.expiresAt ?? null)

  useEffect(() => {
    const saved = localStorage.getItem("theme")
    if (saved === "dark") setDark(true)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])

  useEffect(() => {
    fetch(`/api/reservations/${id}`)
      .then((r) => r.json())
      .then(setReservation)
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (seconds === 0 && seconds !== null && reservation?.status === "PENDING") {
      setReservation((r) => r ? { ...r, status: "RELEASED" } : r)
    }
  }, [seconds, reservation?.status])

  // Auto redirect countdown after CONFIRMED or RELEASED
  useEffect(() => {
    if (
      reservation?.status === "CONFIRMED" ||
      reservation?.status === "RELEASED"
    ) {
      setRedirectIn(5)
    }
  }, [reservation?.status])

  useEffect(() => {
    if (redirectIn === null) return
    if (redirectIn === 0) {
      router.push("/")
      return
    }
    const t = setTimeout(() => setRedirectIn((r) => (r ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [redirectIn, router])

  const confirm = useCallback(async () => {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setReservation((r) => r ? { ...r, status: "CONFIRMED" } : r)
    } finally {
      setActionLoading(false)
    }
  }, [id])

  const cancel = useCallback(async () => {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setReservation((r) => r ? { ...r, status: "RELEASED" } : r)
    } finally {
      setActionLoading(false)
    }
  }, [id])

  const isExpired = seconds !== null && seconds === 0

  if (loading) {
    return (
      <div className={dark ? "dark" : ""}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">

        {/* Navbar */}
        <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">A</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
              allo<span className="text-emerald-500">.</span>inventory
            </span>
          </div>
          <button
            onClick={() => setDark(!dark)}
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {dark ? "☀️" : "🌙"}
          </button>
        </nav>

        <main className="max-w-lg mx-auto px-4 py-10">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8 transition-colors"
          >
            ← Back to products
          </button>

          {!reservation ? (
            <div className="text-center py-20 text-red-500">
              Reservation not found
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8">

              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Reservation
                  </h1>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                    {reservation.id}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  reservation.status === "CONFIRMED"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    : reservation.status === "RELEASED"
                    ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
                    : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                }`}>
                  {reservation.status}
                </span>
              </div>

              {/* Details */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6 space-y-3">
                {[
                  { label: "Quantity", value: `${reservation.quantity} unit` },
                  {
                    label: "Reserved at",
                    value: new Date(reservation.createdAt).toLocaleTimeString(),
                  },
                  {
                    label: "Expires at",
                    value: new Date(reservation.expiresAt).toLocaleTimeString(),
                  },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {row.label}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Reservation countdown */}
              {reservation.status === "PENDING" && !isExpired && (
                <div className={`rounded-xl p-5 mb-6 text-center ${
                  seconds !== null && seconds < 60
                    ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                    : "bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                }`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Time remaining
                  </p>
                  <p className={`text-5xl font-mono font-bold tracking-tight ${
                    seconds !== null && seconds < 60
                      ? "text-red-600 dark:text-red-400"
                      : "text-gray-900 dark:text-white"
                  }`}>
                    {display}
                  </p>
                  {seconds !== null && seconds < 60 && (
                    <p className="text-xs text-red-500 mt-2">
                      Hurry! Expiring soon
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Action buttons */}
              {reservation.status === "PENDING" &&
                (seconds === null || seconds > 0) && (
                  <div className="flex gap-3">
                    <button
                      onClick={confirm}
                      disabled={actionLoading}
                      className="flex-1 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium text-sm hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 active:scale-95 transition-all"
                    >
                      {actionLoading ? "Processing..." : "✓ Confirm purchase"}
                    </button>
                    <button
                      onClick={cancel}
                      disabled={actionLoading}
                      className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 active:scale-95 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}

              {/* Confirmed state */}
              {reservation.status === "CONFIRMED" && (
                <div className="text-center py-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-emerald-700 dark:text-emerald-400 font-semibold text-lg">
                    Purchase confirmed!
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1 mb-4">
                    Your order has been placed successfully
                  </p>
                  <div className="w-full bg-emerald-200 dark:bg-emerald-800 rounded-full h-1 mb-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1 rounded-full transition-all duration-1000"
                      style={{ width: `${((5 - (redirectIn ?? 5)) / 5) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">
                    Returning to products in {redirectIn}s
                  </p>
                  <button
                    onClick={() => router.push("/")}
                    className="mt-3 text-sm text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-900 dark:hover:text-emerald-200"
                  >
                    Go now →
                  </button>
                </div>
              )}

              {/* Released/expired state */}
              {(reservation.status === "RELEASED" || isExpired) && (
                <div className="text-center py-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <p className="text-3xl mb-2">
                    {isExpired && reservation.status !== "RELEASED" ? "⏰" : "❌"}
                  </p>
                  <p className="text-red-600 dark:text-red-400 font-semibold text-lg">
                    {reservation.status === "RELEASED"
                      ? "Reservation cancelled"
                      : "Reservation expired"}
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 mb-4">
                    The held units have been released back to stock
                  </p>
                  <div className="w-full bg-red-200 dark:bg-red-800 rounded-full h-1 mb-3 overflow-hidden">
                    <div
                      className="bg-red-500 h-1 rounded-full transition-all duration-1000"
                      style={{ width: `${((5 - (redirectIn ?? 5)) / 5) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-red-500 dark:text-red-400">
                    Returning to products in {redirectIn}s
                  </p>
                  <button
                    onClick={() => router.push("/")}
                    className="mt-3 text-sm text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-200"
                  >
                    Go now →
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}