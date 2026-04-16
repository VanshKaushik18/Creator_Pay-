// PaymentSuccessPage.jsx
import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

export function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const txnId = params.get('txn')
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="card p-10 text-center max-w-sm w-full animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-neon-green/15 border-2 border-neon-green/40 flex items-center justify-center text-3xl mx-auto mb-5">✓</div>
        <h1 className="text-xl font-semibold mb-2">Payment Successful!</h1>
        <p className="text-white/40 text-sm mb-1">Your payment has been confirmed.</p>
        {txnId && <p className="font-mono text-xs text-white/20 mb-6">Ref: #{txnId.slice(-8).toUpperCase()}</p>}
        <Link to="/" className="btn-primary justify-center w-full">Back to Home</Link>
      </div>
    </div>
  )
}

export default PaymentSuccessPage
