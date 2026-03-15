import React, { useState, useEffect } from 'react'
import { adminAPI } from '../services/api'
import StatCard from '../components/dashboard/StatCard'

export default function AdminPage() {
  const [tab, setTab] = useState('users')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [fraudAlerts, setFraudAlerts] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    adminAPI.getStats().then(r => setStats(r.data.stats)).catch(console.error)
    adminAPI.getUsers().then(r => setUsers(r.data.users || [])).catch(console.error)
    adminAPI.getFraudAlerts().then(r => setFraudAlerts(r.data.alerts || [])).catch(console.error)
    adminAPI.getAnalytics().then(r => setAnalytics(r.data)).catch(console.error)
  }, [])

  const handleSuspend = async (id, suspend) => {
    const reason = suspend ? prompt('Reason for suspension:') : undefined
    if (suspend && !reason) return
    await adminAPI.suspendUser(id, { suspend, reason })
    setUsers(p => p.map(u => u._id === id ? { ...u, isSuspended: suspend } : u))
  }

  const handleFraud = async (id, action) => {
    await adminAPI.fraudAction(id, action)
    setFraudAlerts(p => p.filter(a => a._id !== id))
  }

  const sampleUsers = [
    { _id: 'u1', name: 'Aryan K.', email: 'aryan@example.com', plan: 'pro', kyc: { status: 'verified' }, isSuspended: false, createdAt: '2024-01-05', 'balance.totalEarned': 2483000 },
    { _id: 'u2', name: 'Meera S.', email: 'meera@art.in', plan: 'pro', kyc: { status: 'verified' }, isSuspended: false, createdAt: '2024-02-12', 'balance.totalEarned': 1210000 },
    { _id: 'u3', name: 'Jake M.', email: 'jake@vid.co', plan: 'free', kyc: { status: 'pending' }, isSuspended: false, createdAt: '2024-03-01', 'balance.totalEarned': 876000 },
  ]

  const sampleAlerts = [
    { _id: 'f1', fraud: { score: 87, flags: ['velocity_ip:48_per_hour'] }, payer: { ip: '103.21.244.x' }, amount: { usdEquivalent: 9900 }, method: 'stripe', creator: { name: 'Aryan K.' }, createdAt: new Date(Date.now() - 120000) },
    { _id: 'f2', fraud: { score: 72, flags: ['new_wallet_large_amount'] }, amount: { usdEquivalent: 1344000 }, method: 'eth', creator: { name: 'Jake M.' }, createdAt: new Date(Date.now() - 2040000) },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-neon-red/15 border border-neon-red/30 flex items-center justify-center text-neon-red text-sm">◈</div>
        <div>
          <h1 className="text-xl font-semibold">Admin Panel</h1>
          <p className="text-sm text-white/40">Platform management & oversight</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats?.totalUsers || 1482} change="+94 this week" up color="blue" />
        <StatCard label="Platform GMV" value={`$${((stats?.totalVolumeCents || 120000000) / 100).toLocaleString()}`} color="green" />
        <StatCard label="KYC Pending" value={stats?.kycPending || 24} color="amber" />
        <StatCard label="Fraud Alerts" value={stats?.fraudAlerts || 3} color="red" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-700 p-1 rounded-lg w-fit">
        {['users','fraud','analytics'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm capitalize transition-all ${tab === t ? 'bg-dark-800 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}>
            {t}{t === 'fraud' && (sampleAlerts.length || fraudAlerts.length) > 0 && <span className="ml-1.5 bg-neon-red text-white text-[10px] px-1.5 py-0.5 rounded-full">{fraudAlerts.length || sampleAlerts.length}</span>}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-white/8">
            <input className="input flex-1 max-w-xs" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  {['User','Email','Revenue','Plan','KYC','Joined','Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] text-white/30 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(users.length ? users : sampleUsers).filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())).map(u => (
                  <tr key={u._id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-sm">{u.name}</td>
                    <td className="px-5 py-3.5 text-xs text-white/50">{u.email}</td>
                    <td className="px-5 py-3.5"><span className="font-mono text-sm text-neon-green">${((u['balance.totalEarned'] || u.balance?.totalEarned || 0) / 100).toLocaleString()}</span></td>
                    <td className="px-5 py-3.5"><span className={u.plan === 'pro' ? 'badge-purple' : 'badge-blue'}>{u.plan}</span></td>
                    <td className="px-5 py-3.5"><span className={u.kyc?.status === 'verified' ? 'badge-green' : u.kyc?.status === 'pending' ? 'badge-amber' : 'badge-red'}>{u.kyc?.status}</span></td>
                    <td className="px-5 py-3.5 text-xs font-mono text-white/30">{new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        <button className="btn-ghost py-1 px-2 text-xs">View</button>
                        <button onClick={() => handleSuspend(u._id, !u.isSuspended)} className={`py-1 px-2 text-xs rounded border transition-colors ${u.isSuspended ? 'border-neon-green/30 text-neon-green hover:bg-neon-green/10' : 'border-neon-red/30 text-neon-red hover:bg-neon-red/10'}`}>
                          {u.isSuspended ? 'Reinstate' : 'Suspend'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fraud tab */}
      {tab === 'fraud' && (
        <div className="space-y-3">
          {(fraudAlerts.length ? fraudAlerts : sampleAlerts).map(alert => (
            <div key={alert._id} className="card p-4 border-neon-red/20 bg-neon-red/3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-neon-red text-lg flex-shrink-0 mt-0.5">⚠</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-neon-red">Fraud Score: {alert.fraud.score}/100</span>
                      <span className="font-mono text-xs text-white/30">{alert.method}</span>
                    </div>
                    <p className="text-xs text-white/50 mb-1">Flags: {alert.fraud.flags?.join(', ') || 'suspicious_activity'}</p>
                    <p className="text-xs text-white/30 font-mono">
                      Creator: {alert.creator?.name} · ${((alert.amount?.usdEquivalent || 0)/100).toFixed(2)} · {new Date(alert.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleFraud(alert._id, 'block')} className="btn-danger py-1 px-3 text-xs">Block</button>
                  <button onClick={() => handleFraud(alert._id, 'none')} className="btn-ghost py-1 px-3 text-xs">Clear</button>
                </div>
              </div>
            </div>
          ))}
          {(fraudAlerts.length === 0 && sampleAlerts.length === 0) && (
            <div className="card p-8 text-center text-white/30 text-sm">No active fraud alerts</div>
          )}
        </div>
      )}

      {/* Analytics tab */}
      {tab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-4">Volume by Method</h3>
            <div className="space-y-3">
              {(analytics?.volumeByMethod || [
                { _id: 'stripe', total: 6500000, count: 210 },
                { _id: 'eth', total: 4800000, count: 85 },
                { _id: 'razorpay', total: 2100000, count: 41 },
                { _id: 'btc', total: 800000, count: 12 },
              ]).map(m => {
                const max = 6500000
                const pct = Math.round((m.total / max) * 100)
                const colors = { stripe: 'bg-neon-green', eth: 'bg-accent', razorpay: 'bg-neon-blue', btc: 'bg-neon-amber', polygon: 'bg-neon-green', usdt: 'bg-neon-blue' }
                return (
                  <div key={m._id} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-white/50 text-xs capitalize">{m._id}</span>
                    <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors[m._id] || 'bg-white/30'} transition-all`} style={{ width: pct + '%' }} />
                    </div>
                    <span className="font-mono text-xs text-white/50 w-16 text-right">${(m.total/100).toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-4">Top Creators</h3>
            <div className="space-y-2">
              {(analytics?.topCreators || [
                { creator: { name: 'Aryan K.' }, revenue: 2483000 },
                { creator: { name: 'Meera S.' }, revenue: 1210000 },
                { creator: { name: 'Jake M.' }, revenue: 876000 },
                { creator: { name: 'Chen L.' }, revenue: 322000 },
              ]).map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="font-mono text-xs text-white/20 w-4">{i+1}</span>
                  <span className="flex-1 text-sm">{c.creator?.name}</span>
                  <span className="font-mono text-sm text-neon-green">${(c.revenue/100).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
