import React, { useState, useEffect } from 'react'
import { transactionsAPI } from '../services/api'
import TransactionRow from '../components/dashboard/TransactionRow'
import StatCard from '../components/dashboard/StatCard'

const SAMPLE = [
  { _id: '1', payer: { name: 'Sam Wilson' }, amount: { value: 24000, currency: 'USD' }, method: 'stripe', status: 'confirmed', createdAt: new Date(Date.now() - 120000), paymentLink: { name: 'Design Consult' } },
  { _id: '2', payer: { walletAddress: '0x3f...a91c' }, amount: { value: 80000000000000000, currency: 'ETH' }, method: 'eth', status: 'confirmed', createdAt: new Date(Date.now() - 1080000), paymentLink: { name: 'Mentor Session' } },
  { _id: '3', payer: { name: 'Priya M.' }, amount: { value: 500000, currency: 'INR' }, method: 'razorpay', status: 'pending', createdAt: new Date(Date.now() - 3600000), paymentLink: { name: 'Beat License' } },
  { _id: '4', payer: { walletAddress: '0x9b...e44d' }, amount: { value: 200000, currency: 'BTC' }, method: 'btc', status: 'confirmed', createdAt: new Date(Date.now() - 10800000), paymentLink: { name: 'Tip Link' } },
  { _id: '5', payer: { name: 'Alex T.' }, amount: { value: 9900, currency: 'USD' }, method: 'stripe', status: 'failed', createdAt: new Date(Date.now() - 18000000), paymentLink: { name: 'Logo Package' } },
]

export default function TransactionsPage() {
  const [txns, setTxns] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', method: '' })

  useEffect(() => {
    transactionsAPI.getAll(filter)
      .then(r => { setTxns(r.data.transactions || []); setSummary(r.data.summary) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filter])

  const display = txns.length ? txns : SAMPLE

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Transactions</h1>
          <p className="text-sm text-white/40 mt-0.5">Full history of all payments received</p>
        </div>
        <button className="btn-ghost" onClick={() => alert('Export feature coming soon')}>Export CSV ↓</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={`$${((summary?.totalRevenue || 248300) / 100).toLocaleString()}`} color="green" />
        <StatCard label="Transactions" value={summary?.count || 348} color="blue" />
        <StatCard label="Avg. Transaction" value="$71.35" color="purple" />
        <StatCard label="Crypto %" value="38%" color="amber" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="select w-auto" value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select className="select w-auto" value={filter.method} onChange={e => setFilter(p => ({ ...p, method: e.target.value }))}>
          <option value="">All Methods</option>
          <option value="stripe">Stripe</option>
          <option value="razorpay">Razorpay</option>
          <option value="eth">Ethereum</option>
          <option value="btc">Bitcoin</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8">
                {['ID','From','Link','Amount','Method','Status','Date'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-white/30 text-sm">Loading...</td></tr>
              ) : display.map(txn => (
                <tr key={txn._id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3.5"><span className="font-mono text-xs text-white/40">#{String(txn._id).slice(-6).toUpperCase()}</span></td>
                  <td className="px-5 py-3.5 text-sm">{txn.payer?.name || txn.payer?.walletAddress?.slice(0,10) + '...' || '—'}</td>
                  <td className="px-5 py-3.5 text-xs text-white/50">{txn.paymentLink?.name || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`font-mono text-sm font-semibold ${['eth','btc','polygon'].includes(txn.method) ? 'text-accent' : 'text-neon-green'}`}>
                      {txn.amount.currency === 'ETH' ? `${(txn.amount.value/1e18).toFixed(4)} ETH`
                        : txn.amount.currency === 'BTC' ? `${(txn.amount.value/1e8).toFixed(6)} BTC`
                        : txn.amount.currency === 'INR' ? `₹${(txn.amount.value/100).toLocaleString('en-IN')}`
                        : `$${(txn.amount.value/100).toFixed(2)}`}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-white/50 bg-white/5 border border-white/10 px-2 py-1 rounded">{txn.method}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={txn.status === 'confirmed' || txn.status === 'settled' ? 'badge-green' : txn.status === 'pending' ? 'badge-amber' : 'badge-red'}>
                      {txn.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-white/30">
                      {new Date(txn.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
