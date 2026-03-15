import React from 'react'

const METHOD_LABELS = {
  stripe:   { icon: '💳', label: 'Stripe' },
  razorpay: { icon: '🇮🇳', label: 'Razorpay' },
  eth:      { icon: '⬡', label: 'Ethereum' },
  btc:      { icon: '₿', label: 'Bitcoin' },
  polygon:  { icon: '◆', label: 'Polygon' },
  usdt:     { icon: '🔵', label: 'USDT' },
}

const STATUS_BADGES = {
  confirmed: 'badge-green',
  settled:   'badge-green',
  pending:   'badge-amber',
  initiated: 'badge-amber',
  failed:    'badge-red',
  refunded:  'badge-blue',
  disputed:  'badge-red',
}

const formatAmount = (txn) => {
  const { value, currency } = txn.amount
  if (currency === 'ETH') return `${(value / 1e18).toFixed(4)} ETH`
  if (currency === 'BTC') return `${(value / 1e8).toFixed(6)} BTC`
  if (currency === 'INR') return `₹${(value / 100).toLocaleString('en-IN')}`
  return `$${(value / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

const formatTime = (date) => {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TransactionRow({ txn }) {
  const method = METHOD_LABELS[txn.method] || { icon: '?', label: txn.method }
  const statusClass = STATUS_BADGES[txn.status] || 'badge-blue'
  const payerName = txn.payer?.name || txn.payer?.walletAddress?.slice(0, 10) + '...' || 'Anonymous'
  const amtColor = ['eth','btc','polygon','usdt'].includes(txn.method) ? 'text-accent' : 'text-neon-green'

  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="px-5 py-3.5">
        <span className="font-mono text-xs text-white/40">#{String(txn._id).slice(-6).toUpperCase()}</span>
      </td>
      <td className="px-5 py-3.5 text-sm">{payerName}</td>
      <td className="px-5 py-3.5">
        <span className={`font-mono text-sm font-semibold ${amtColor}`}>{formatAmount(txn)}</span>
      </td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-white/50 bg-white/5 border border-white/10 px-2 py-1 rounded">
          <span>{method.icon}</span>{method.label}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className={statusClass}>
          {txn.status === 'confirmed' || txn.status === 'settled' ? '●' : txn.status === 'failed' ? '✕' : '◉'} {txn.status}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className="font-mono text-xs text-white/30">{formatTime(txn.createdAt)}</span>
      </td>
    </tr>
  )
}
