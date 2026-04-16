import React, { useState, useEffect } from 'react'
import { linksAPI } from '../services/api'

const EMPTY_FORM = {
  name: '', description: '',
  pricing: { type: 'fixed', amount: '', currency: 'USD' },
  acceptedMethods: { stripe: true, razorpay: true, eth: true, btc: false, polygon: false, usdt: false },
}

const METHOD_TOGGLES = [
  { key: 'stripe',   label: '💳 Stripe',    sub: 'Card payments globally' },
  { key: 'razorpay', label: '🇮🇳 Razorpay', sub: 'UPI / INR payments' },
  { key: 'eth',      label: '⬡ Ethereum',  sub: 'ETH + ERC-20 tokens' },
  { key: 'btc',      label: '₿ Bitcoin',   sub: 'On-chain BTC' },
  { key: 'polygon',  label: '◆ Polygon',   sub: 'Low-fee MATIC' },
  { key: 'usdt',     label: '🔵 USDT',      sub: 'Stablecoin' },
]

export default function LinksPage() {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    linksAPI.getAll()
      .then(r => setLinks(r.data.links || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        pricing: { ...form.pricing, amount: form.pricing.type === 'custom' ? 0 : Math.round(parseFloat(form.pricing.amount) * 100) }
      }
      const r = await linksAPI.create(payload)
      setLinks(p => [r.data.link, ...p])
      setShowModal(false)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create link')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Archive this link?')) return
    await linksAPI.delete(id)
    setLinks(p => p.filter(l => l._id !== id))
  }

  const toggleMethod = (key) => setForm(p => ({
    ...p, acceptedMethods: { ...p.acceptedMethods, [key]: !p.acceptedMethods[key] }
  }))

  const copyLink = (slug) => {
    navigator.clipboard.writeText(`${window.location.origin}/pay/${slug}`)
  }

  const sampleLinks = [
    { _id: 's1', slug: 'design', name: 'Design Consultation', description: '1-hour session', pricing: { type: 'fixed', amount: 15000, currency: 'USD' }, stats: { payments: 42, views: 312 } },
    { _id: 's2', slug: 'logo', name: 'Logo Package', description: 'Full brand kit · 3 revisions', pricing: { type: 'fixed', amount: 35000, currency: 'USD' }, stats: { payments: 18, views: 94 } },
    { _id: 's3', slug: 'tip', name: 'Tip / Support', description: 'Pay what you want', pricing: { type: 'custom', currency: 'USD' }, stats: { payments: 134, views: 980 } },
  ]

  const displayLinks = links.length ? links : sampleLinks

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payment Links</h1>
          <p className="text-sm text-white/40 mt-0.5">Create links to accept fiat & crypto payments</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Link</button>
      </div>

      {/* Links grid */}
      {loading ? (
        <div className="text-white/40 text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayLinks.map(link => {
            const isCustom = link.pricing.type === 'custom'
            const amount = isCustom ? 'Custom' : link.pricing.currency === 'INR'
              ? `₹${(link.pricing.amount / 100).toLocaleString('en-IN')}`
              : `$${(link.pricing.amount / 100).toFixed(2)}`
            return (
              <div key={link._id} className="card p-5 hover:border-accent/30 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-lg">⬡</div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => copyLink(link.slug)} className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white text-xs transition-colors" title="Copy link">⎘</button>
                    <button onClick={() => handleDelete(link._id)} className="p-1.5 hover:bg-neon-red/10 rounded text-white/40 hover:text-neon-red text-xs transition-colors" title="Archive">✕</button>
                  </div>
                </div>
                <h3 className="font-semibold text-sm mb-0.5">{link.name}</h3>
                <p className="text-xs text-white/40 mb-3 line-clamp-1">{link.description}</p>
                <div className="text-2xl font-mono font-bold text-neon-green mb-3">{amount}</div>
                <div className="flex items-center justify-between text-xs text-white/30 mb-3">
                  <span>{link.stats?.payments || 0} payments</span>
                  <span>{link.stats?.views || 0} views</span>
                </div>
                <div className="bg-accent/5 border border-accent/15 rounded px-2.5 py-1.5 flex items-center justify-between group/url cursor-pointer hover:border-accent/30 transition-colors" onClick={() => copyLink(link.slug)}>
                  <span className="text-[11px] text-accent font-mono truncate">{window.location.host}/pay/{link.slug}</span>
                  <span className="text-accent/50 text-xs ml-2 flex-shrink-0">⎘</span>
                </div>
              </div>
            )
          })}

          {/* New link card */}
          <div onClick={() => setShowModal(true)} className="card p-5 border-dashed border-white/10 hover:border-accent/30 cursor-pointer flex flex-col items-center justify-center min-h-[220px] gap-2 transition-colors group">
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/20 group-hover:border-accent/50 flex items-center justify-center text-white/30 group-hover:text-accent text-xl transition-colors">+</div>
            <span className="text-sm text-white/40 group-hover:text-white/60 transition-colors">Create New Link</span>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-md bg-dark-800 border border-white/12 rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Create Payment Link</h2>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white text-xl w-7 h-7 flex items-center justify-center">×</button>
            </div>

            {error && <div className="bg-neon-red/10 border border-neon-red/20 text-neon-red text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Link Name</label>
                <input className="input" placeholder="e.g. Design Consultation" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>

              <div>
                <label className="label">Description (optional)</label>
                <input className="input" placeholder="Short description shown to payer" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Pricing type</label>
                  <select className="select" value={form.pricing.type} onChange={e => setForm(p => ({ ...p, pricing: { ...p.pricing, type: e.target.value } }))}>
                    <option value="fixed">Fixed amount</option>
                    <option value="custom">Customer decides</option>
                    <option value="suggested">Suggested amount</option>
                  </select>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="select" value={form.pricing.currency} onChange={e => setForm(p => ({ ...p, pricing: { ...p.pricing, currency: e.target.value } }))}>
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              {form.pricing.type !== 'custom' && (
                <div>
                  <label className="label">Amount</label>
                  <input className="input" type="number" step="0.01" min="0.50" placeholder="150.00" value={form.pricing.amount} onChange={e => setForm(p => ({ ...p, pricing: { ...p.pricing, amount: e.target.value } }))} required />
                </div>
              )}

              <div>
                <label className="label mb-2">Accept via</label>
                <div className="space-y-2">
                  {METHOD_TOGGLES.map(m => (
                    <div key={m.key} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="text-sm">{m.label}</p>
                        <p className="text-xs text-white/30">{m.sub}</p>
                      </div>
                      <button type="button" onClick={() => toggleMethod(m.key)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${form.acceptedMethods[m.key] ? 'bg-accent' : 'bg-white/10'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.acceptedMethods[m.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={saving}>
                {saving ? 'Creating...' : 'Generate Link →'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
