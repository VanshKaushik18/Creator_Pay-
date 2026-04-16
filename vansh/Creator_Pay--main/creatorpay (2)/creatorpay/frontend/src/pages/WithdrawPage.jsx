import React, { useState, useEffect } from 'react'
import { withdrawAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const METHODS = [
  { key: 'bank',     icon: '🏦', label: 'Bank Transfer',  sub: 'NEFT/IMPS/SWIFT' },
  { key: 'razorpay', icon: '💳', label: 'Razorpay',       sub: 'Instant to Indian bank' },
  { key: 'eth',      icon: '⬡',  label: 'ETH Wallet',     sub: 'ERC-20 address' },
  { key: 'btc',      icon: '₿',  label: 'Bitcoin',        sub: 'On-chain BTC' },
  { key: 'usdt',     icon: '🔵', label: 'USDT',           sub: 'Stable, low fee' },
]

export default function WithdrawPage() {
  const { user, updateUser } = useAuth()
  const [method, setMethod] = useState('bank')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState({})
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const available = (user?.balance?.available || 0) / 100

  useEffect(() => {
    withdrawAPI.getAll()
      .then(r => setHistory(r.data.withdrawals || []))
      .catch(console.error)
  }, [])

  const handleWithdraw = async (e) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) < 10) { setError('Minimum withdrawal is $10'); return }
    if (parseFloat(amount) > available) { setError('Insufficient balance'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      const r = await withdrawAPI.create({ amount: parseFloat(amount), method, destination })
      setHistory(p => [r.data.withdrawal, ...p])
      updateUser({ balance: { ...user.balance, available: user.balance.available - Math.round(parseFloat(amount) * 100) } })
      setSuccess(r.data.message)
      setAmount('')
    } catch (err) {
      setError(err.response?.data?.message || 'Withdrawal failed')
    } finally {
      setLoading(false)
    }
  }

  const sampleHistory = [
    { _id: 'w1', method: 'bank', amount: { value: 180000 }, destination: { bankName: 'HDFC', accountNumber: '****4521' }, status: 'completed', createdAt: new Date(Date.now() - 5*86400000) },
    { _id: 'w2', method: 'eth', amount: { value: 50000 }, destination: { walletAddress: '0x4a...d2f1' }, status: 'completed', createdAt: new Date(Date.now() - 12*86400000) },
    { _id: 'w3', method: 'razorpay', amount: { value: 450000 }, destination: { accountNumber: '****8840' }, status: 'processing', createdAt: new Date(Date.now() - 86400000) },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Withdraw Funds</h1>
        <p className="text-sm text-white/40 mt-0.5">Move your earnings to bank, crypto wallet, or Razorpay</p>
      </div>

      {/* Balance hero */}
      <div className="card p-6">
        <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Available Balance</p>
        <div className="text-4xl font-mono font-bold bg-gradient-to-r from-neon-green to-neon-blue bg-clip-text text-transparent">
          ${available.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <p className="text-sm text-white/30 mt-1.5 font-mono">
          ≈ {(available / 3200).toFixed(4)} ETH · ₹{(available * 83.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Withdraw form */}
        <form onSubmit={handleWithdraw} className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm">Withdraw To</h3>

          {/* Method selector */}
          <div className="grid grid-cols-1 gap-2">
            {METHODS.map(m => (
              <label key={m.key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${method === m.key ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/15'}`}>
                <input type="radio" name="method" className="sr-only" value={m.key} checked={method === m.key} onChange={() => setMethod(m.key)} />
                <span className="text-lg">{m.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-white/40">{m.sub}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${method === m.key ? 'border-accent' : 'border-white/20'}`}>
                  {method === m.key && <div className="w-2 h-2 rounded-full bg-accent" />}
                </div>
              </label>
            ))}
          </div>

          {/* Destination input */}
          {(method === 'bank' || method === 'razorpay') && (
            <div className="space-y-3">
              <div>
                <label className="label">Account Number</label>
                <input className="input" placeholder="Enter account number" onChange={e => setDestination(p => ({ ...p, accountNumber: e.target.value }))} />
              </div>
              {method === 'bank' && (
                <div>
                  <label className="label">IFSC Code</label>
                  <input className="input" placeholder="HDFC0001234" onChange={e => setDestination(p => ({ ...p, ifsc: e.target.value }))} />
                </div>
              )}
            </div>
          )}
          {(method === 'eth' || method === 'usdt' || method === 'btc') && (
            <div>
              <label className="label">Wallet Address</label>
              <input className="input font-mono text-xs" placeholder={method === 'btc' ? 'bc1q...' : '0x...'} onChange={e => setDestination({ walletAddress: e.target.value })} />
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="label">Amount (USD)</label>
            <div className="flex gap-2">
              <input type="number" className="input flex-1" placeholder="0.00" min="10" max={available} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
              <button type="button" onClick={() => setAmount(available.toFixed(2))} className="btn-ghost text-xs px-3">Max</button>
            </div>
            <p className="text-xs text-white/30 mt-1">Min $10 · 0.5% withdrawal fee</p>
          </div>

          {error && <p className="text-neon-red text-sm">{error}</p>}
          {success && <p className="text-neon-green text-sm">{success}</p>}

          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
            {loading ? 'Processing...' : 'Withdraw →'}
          </button>
        </form>

        {/* History */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/8">
            <h3 className="font-semibold text-sm">Payout History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Method','Amount','Destination','Status','Date'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] text-white/30 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(history.length ? history : sampleHistory).map(w => (
                  <tr key={w._id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-xs">{w.method}</td>
                    <td className="px-4 py-3"><span className="font-mono text-sm text-neon-green">${(w.amount.value / 100).toFixed(2)}</span></td>
                    <td className="px-4 py-3 text-xs text-white/40 font-mono">{w.destination?.walletAddress?.slice(0,10) || w.destination?.accountNumber || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={w.status === 'completed' ? 'badge-green' : w.status === 'processing' ? 'badge-amber' : 'badge-red'}>{w.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-white/30">
                      {new Date(w.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
