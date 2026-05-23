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
  const router = useRouter()
  const { seconds, display } = useCountdown(reservation?.expiresAt ?? null)

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

  const confirm = useCallback(async () => {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        return
      }
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
      if (!res.ok) {
        setError(data.error)
        return
      }
      setReservation((r) => r ? { ...r, status: "RELEASED" } : r)
    } finally {
      setActionLoading(false)
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading reservation...</p>
      </div>
    )
  }

  if (!reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Reservation not found</p>
      </div>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <button
        onClick={() => router.push("/")}
        className="text-sm text-gray-500 hover:text-gray-800 mb-6 flex items-center gap-1"
      >
        ← Back to products
      </button>

      <div className="border rounded-xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-1">Reservation</h1>
        <p className="text-gray-500 text-sm mb-6">ID: {reservation.id}</p>

        <div className="mb-6">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              reservation.status === "CONFIRMED"
                ? "bg-green-100 text-green-700"
                : reservation.status === "RELEASED"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {reservation.status}
          </span>
        </div>

        <div className="space-y-3 mb-6 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Quantity</span>
            <span className="font-medium">{reservation.quantity}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Reserved at</span>
            <span className="font-medium">
              {new Date(reservation.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Expires at</span>
            <span className="font-medium">
              {new Date(reservation.expiresAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        {reservation.status === "PENDING" && (
          <div
            className={`text-center py-4 rounded-lg mb-6 ${
              seconds !== null && seconds < 60 ? "bg-red-50" : "bg-gray-50"
            }`}
          >
            <p className="text-sm text-gray-500 mb-1">Time remaining</p>
            <p
              className={`text-4xl font-mono font-bold ${
                seconds !== null && seconds < 60
                  ? "text-red-600"
                  : "text-gray-800"
              }`}
            >
              {display}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {reservation.status === "PENDING" &&
          (seconds === null || seconds > 0) && (
            <div className="flex gap-3">
              <button
                onClick={confirm}
                disabled={actionLoading}
                className="flex-1 py-3 bg-black text-white rounded-lg font-medium
                  disabled:opacity-40 hover:bg-gray-800 transition-colors"
              >
                {actionLoading ? "Processing..." : "Confirm purchase"}
              </button>
              <button
                onClick={cancel}
                disabled={actionLoading}
                className="flex-1 py-3 border rounded-lg font-medium
                  disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

        {reservation.status === "CONFIRMED" && (
          <div className="text-center py-4 bg-green-50 rounded-lg">
            <p className="text-green-700 font-medium">✅ Purchase confirmed!</p>
          </div>
        )}

        {(reservation.status === "RELEASED" ||
          (reservation.status === "PENDING" &&
            seconds !== null &&
            seconds === 0)) && (
          <div className="text-center py-4 bg-red-50 rounded-lg">
            <p className="text-red-700 font-medium mb-3">
              {reservation.status === "RELEASED"
                ? "❌ Reservation cancelled"
                : "⏰ Reservation expired"}
            </p>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-gray-600 underline"
            >
              Back to products
            </button>
          </div>
        )}
      </div>
    </main>
  )
}