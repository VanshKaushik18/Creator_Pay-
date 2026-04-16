import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js'
import { dashboardAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import StatCard from '../components/dashboard/StatCard'
import TransactionRow from '../components/dashboard/TransactionRow'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const CRYPTO_TICKERS = [
  { sym: 'BTC', price: '$67,420', chg: '+2.4%', up: true },
  { sym: 'ETH', price: '$3,211', chg: '+1.8%', up: true },
  { sym: 'SOL', price: '$142', chg: '-0.6%', up: false },
  { sym: 'USDT', price: '$1.00', chg: '+0.0%', up: true },
  { sym: 'MATIC', price: '$0.98', chg: '+3.1%', up: true },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardAPI.get()
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Get financial data from API or user object
  const available = (data?.stats?.available || user?.balance?.available || 0) / 100
  const totalEarned = (data?.stats?.totalEarned || user?.balance?.totalEarned || 0) / 100
  const pending = (data?.stats?.pending || user?.balance?.pending || 0) / 100
  const activeLinks = data?.stats?.activeLinks || user?.stats?.totalLinks || 0
  const totalLinks = data?.stats?.totalLinks || 0
  const totalTransactions = user?.stats?.totalTransactions || 0

  // Build chart data from analytics
  const analyticsData = data?.analytics || []
  const weeks = ['W8','W9','W10','W11','W12','W13','W14','W15']
  const fiatTotals  = weeks.map((_, i) => (analyticsData.filter(a => a._id.method !== 'eth' && a._id.method !== 'btc' && a._id.method !== 'polygon').reduce((s,a) => s + a.total, 0) / 100) || [1800,2100,1600,2800,2400,3100,2900,3200][i])
  const cryptoTotals = weeks.map((_, i) => (analyticsData.filter(a => ['eth','btc','polygon','usdt'].includes(a._id.method)).reduce((s,a) => s + a.total, 0) / 100) || [400,600,500,900,800,1100,1000,1300][i])

  const barData = {
    labels: weeks,
    datasets: [
      { label: 'Fiat', data: fiatTotals, backgroundColor: '#22d3a044', borderColor: '#22d3a0', borderWidth: 1.5, borderRadius: 4 },
      { label: 'Crypto', data: cryptoTotals, backgroundColor: '#7c6af744', borderColor: '#7c6af7', borderWidth: 1.5, borderRadius: 4 },
    ]
  }

  const methodSplit = data?.paymentMethodSplit || []
  const getMethodTotal = (methods) => methodSplit.filter(m => methods.includes(m._id)).reduce((s, m) => s + m.total, 0)
  const donutData = {
    labels: ['Fiat (Stripe)', 'ETH', 'Bitcoin', 'Razorpay'],
    datasets: [{ data: [getMethodTotal(['stripe']) || 42, getMethodTotal(['eth','usdt']) || 28, getMethodTotal(['btc']) || 18, getMethodTotal(['razorpay']) || 12], backgroundColor: ['#22d3a0','#7c6af7','#38bdf8','#f59e0b'], borderWidth: 0, hoverOffset: 4 }]
  }

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a24', titleColor: '#fff', bodyColor: '#ffffff80', borderColor: '#ffffff15', borderWidth: 1 } },
    scales: { x: { grid: { color: '#ffffff08' }, ticks: { color: '#ffffff40', font: { family: 'Space Mono', size: 10 } } }, y: { grid: { color: '#ffffff08' }, ticks: { color: '#ffffff40', font: { family: 'Space Mono', size: 10 }, callback: v => '$' + v.toLocaleString() } } }
  }

  if (loading) return <div className="p-6 text-white/40">Loading dashboard...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Crypto ticker */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CRYPTO_TICKERS.map(t => (
          <div key={t.sym} className="card px-3 py-2 flex items-center gap-2.5 flex-shrink-0">
            <span className="font-mono font-bold text-sm">{t.sym}</span>
            <span className="font-mono text-xs text-white/70">{t.price}</span>
            <span className={`text-xs font-mono ${t.up ? 'text-neon-green' : 'text-neon-red'}`}>{t.chg}</span>
          </div>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Earned" value={`$${totalEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} change="+18.4%" up color="green" icon="💰" />
        <StatCard label="Available" value={`$${available.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} change="Ready to withdraw" color="purple" icon="💳" />
        <StatCard label="Pending" value={`$${pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} change="1–2 days" color="amber" icon="⏳" />
        <StatCard label="Active Links" value={activeLinks || 0} change={`${totalTransactions || 0} transactions`} color="blue" icon="🔗" />
      </div>
      {/* Money Summary Section */}
      <div className="card p-6 border border-white/10">
        <h3 className="font-semibold text-sm mb-6 flex items-center gap-2">
          <span>💵</span> Money Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-wider">Available Balance</p>
            <p className="text-3xl font-mono font-bold text-neon-green">${available.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-white/40 mt-2">Ready for withdrawal</p>
            <button className="mt-3 px-3 py-1.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-neon-green text-xs font-medium hover:bg-neon-green/20 transition-colors">
              Withdraw Now →
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-wider">Pending Amount</p>
            <p className="text-3xl font-mono font-bold text-neon-amber">${pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-white/40 mt-2">Processing - 1 to 2 days</p>
            <button className="mt-3 px-3 py-1.5 rounded-lg bg-neon-amber/10 border border-neon-amber/30 text-neon-amber text-xs font-medium hover:bg-neon-amber/20 transition-colors">
              View Details →
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-wider">Total Earned</p>
            <p className="text-3xl font-mono font-bold text-accent">${totalEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-white/40 mt-2">All-time earnings</p>
            <div className="mt-3 w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-accent to-neon-purple h-full w-3/5" />
            </div>
          </div>
        </div>
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm">Revenue Overview</h3>
              <p className="text-xs text-white/40 mt-0.5">Last 8 weeks</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-neon-green inline-block" />Fiat</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-accent inline-block" />Crypto</span>
            </div>
          </div>
          <div className="h-44">
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>

        {/* Links Summary Card */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-4">Payment Links Status</h3>
          <div className="space-y-4">
            <div className="p-3 bg-neon-blue/10 border border-neon-blue/20 rounded-lg">
              <p className="text-xs text-white/50 mb-1">Active Links</p>
              <p className="text-2xl font-mono font-bold text-neon-blue">{activeLinks}</p>
            </div>
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
              <p className="text-xs text-white/50 mb-1">Total Links</p>
              <p className="text-2xl font-mono font-bold text-white/70">{totalLinks}</p>
            </div>
            <Link to="/links" className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
              View All Links →
            </Link>
          </div>
        </div>
      </div>

      {/* Payment Split Chart */}
      <div className="card p-5">
        <h3 className="font-semibold text-sm mb-4">Payment Split</h3>
        <div className="h-32 mb-4">
          <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }} />
        </div>
        <div className="space-y-2">
          {donutData.labels.map((label, i) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: donutData.datasets[0].backgroundColor[i] }} />
                <span className="text-white/60">{label}</span>
              </div>
              <span className="font-mono text-white/50">{donutData.datasets[0].data[i]}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-semibold text-sm">Recent Transactions</h3>
          <Link to="/transactions" className="text-xs text-accent hover:text-accent-light transition-colors">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['ID', 'From', 'Amount', 'Method', 'Status', 'Time'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.recentTxns || []).length > 0 ? data.recentTxns.map(txn => (
                <TransactionRow key={txn._id} txn={txn} />
              )) : (
                // Fallback sample rows
                [
                  { _id: '1', payer: { name: 'Sam Wilson' }, amount: { value: 24000, currency: 'USD' }, method: 'stripe', status: 'confirmed', createdAt: new Date(Date.now() - 120000) },
                  { _id: '2', payer: { walletAddress: '0x3f...a91c' }, amount: { value: 8000000000000000, currency: 'ETH' }, method: 'eth', status: 'confirmed', createdAt: new Date(Date.now() - 1080000) },
                  { _id: '3', payer: { name: 'Priya M.' }, amount: { value: 500000, currency: 'INR' }, method: 'razorpay', status: 'pending', createdAt: new Date(Date.now() - 3600000) },
                ].map(txn => <TransactionRow key={txn._id} txn={txn} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
