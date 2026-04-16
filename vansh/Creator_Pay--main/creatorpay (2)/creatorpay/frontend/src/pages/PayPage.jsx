import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { linksAPI, paymentsAPI } from '../services/api'

export default function PayPage() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const cancelled = searchParams.get('cancelled')

  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [payMethod, setPayMethod] = useState('stripe')
  const [form, setForm] = useState({ name: '', email: '', customAmount: '' })
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [cryptoInfo, setCryptoInfo] = useState(null)

  useEffect(() => {
    linksAPI.getPublic(slug)
      .then(r => {
        setLink(r.data.link)
        const methods = r.data.link.acceptedMethods
        if (methods.stripe) setPayMethod('stripe')
        else if (methods.razorpay) setPayMethod('razorpay')
        else if (methods.eth) setPayMethod('eth')
      })
      .catch(() => setError('Payment link not found or has expired.'))
      .finally(() => setLoading(false))
  }, [slug])

  const getAmount = () => {
    if (link?.pricing?.type === 'custom') return parseFloat(form.customAmount) || 0
    return (link?.pricing?.amount || 0) / 100
  }

  const handlePay = async () => {
    setProcessing(true)
    setError('')
    try {
      if (payMethod === 'stripe') {
        const r = await paymentsAPI.stripeCheckout({ slug, email: form.email, name: form.name, customAmount: getAmount() })
        window.location.href = r.data.checkoutUrl
      } else if (payMethod === 'razorpay') {
        const r = await paymentsAPI.razorpayOrder({ slug, email: form.email, name: form.name, phone: form.phone, customAmount: getAmount() })
        const options = {
          key: r.data.keyId, amount: r.data.amount, currency: 'INR', order_id: r.data.orderId,
          prefill: { name: form.name, email: form.email },
          handler: async (res) => {
            await paymentsAPI.razorpayVerify({ ...res, transactionId: r.data.transactionId })
            window.location.href = `/payment/success?txn=${r.data.transactionId}`
          }
        }
        new window.Razorpay(options).open()
      } else if (payMethod === 'eth') {
        const r = await paymentsAPI.cryptoInitiate({ slug, currency: 'ETH', customAmountUsd: getAmount() })
        setCryptoInfo(r.data)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed. Try again.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-white/40 text-sm">Loading payment...</div>
    </div>
  )

  if (error && !link) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="card p-8 text-center max-w-sm w-full">
        <div className="text-4xl mb-4">🔗</div>
        <h2 className="font-semibold mb-2">Link not found</h2>
        <p className="text-white/40 text-sm">{error}</p>
      </div>
    </div>
  )

  const creator = link?.creator || {}
  const isCustom = link?.pricing?.type === 'custom'
  const fixedAmount = link?.pricing?.amount || 0
  const currency = link?.pricing?.currency || 'USD'
  const methods = link?.acceptedMethods || {}

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {cancelled && (
          <div className="bg-neon-amber/10 border border-neon-amber/20 text-neon-amber text-sm px-4 py-3 rounded-lg mb-5">
            Payment cancelled. You can try again below.
          </div>
        )}

        {/* Creator info */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent to-neon-green flex items-center justify-center text-xl font-bold mx-auto mb-3">
            {creator.name?.charAt(0) || '?'}
          </div>
          <p className="text-white/50 text-sm">{creator.name || 'Creator'}</p>
          {creator.bio && <p className="text-white/30 text-xs mt-0.5">{creator.bio}</p>}
        </div>

        {/* Link info */}
        <div className="card p-5 mb-4 text-center">
          <h1 className="text-lg font-semibold mb-1">{link?.name}</h1>
          {link?.description && <p className="text-sm text-white/40 mb-3">{link.description}</p>}
          {!isCustom && (
            <div className="text-3xl font-mono font-bold text-neon-green">
              {currency === 'INR' ? `₹${(fixedAmount/100).toLocaleString('en-IN')}` : `$${(fixedAmount/100).toFixed(2)}`}
            </div>
          )}
        </div>

        {/* Crypto deposit info */}
        {cryptoInfo ? (
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-center">Send ETH to complete payment</h3>
            <div className="bg-dark-700 rounded-lg p-3 text-center">
              <p className="text-xs text-white/40 mb-1">Send exactly</p>
              <p className="font-mono text-xl text-accent font-bold">{cryptoInfo.expectedAmount} ETH</p>
              <p className="text-xs text-white/30">(≈ ${cryptoInfo.usdEquivalent})</p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1.5">To address:</p>
              <div className="bg-dark-700 rounded-lg p-3 font-mono text-xs text-white/70 break-all">{cryptoInfo.depositAddress}</div>
            </div>
            <p className="text-[11px] text-white/30 text-center">Expires in 30 minutes · Requires 12 confirmations</p>
            <button onClick={() => setCryptoInfo(null)} className="btn-ghost w-full justify-center text-xs">← Choose different method</button>
          </div>
        ) : (
          <div className="card p-5 space-y-4">
            {/* Custom amount */}
            {isCustom && (
              <div>
                <label className="label">Amount ({currency})</label>
                <input type="number" className="input text-lg font-mono" placeholder="0.00" min="1" step="0.01"
                  value={form.customAmount} onChange={e => setForm(p => ({ ...p, customAmount: e.target.value }))} />
              </div>
            )}

            {/* Payer info */}
            <div>
              <label className="label">Your Name</label>
              <input type="text" className="input" placeholder="Name (optional)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="For receipt" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>

            {/* Method selector */}
            <div>
              <label className="label">Pay with</label>
              <div className="grid grid-cols-3 gap-2">
                {methods.stripe && (
                  <label className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border cursor-pointer transition-all ${payMethod === 'stripe' ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/20'}`}>
                    <input type="radio" name="pm" className="sr-only" value="stripe" checked={payMethod === 'stripe'} onChange={() => setPayMethod('stripe')} />
                    <span className="text-lg">💳</span>
                    <span className="text-[11px] text-white/60">Card</span>
                  </label>
                )}
                {methods.razorpay && (
                  <label className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border cursor-pointer transition-all ${payMethod === 'razorpay' ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/20'}`}>
                    <input type="radio" name="pm" className="sr-only" value="razorpay" checked={payMethod === 'razorpay'} onChange={() => setPayMethod('razorpay')} />
                    <span className="text-lg">🇮🇳</span>
                    <span className="text-[11px] text-white/60">UPI</span>
                  </label>
                )}
                {methods.eth && (
                  <label className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border cursor-pointer transition-all ${payMethod === 'eth' ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/20'}`}>
                    <input type="radio" name="pm" className="sr-only" value="eth" checked={payMethod === 'eth'} onChange={() => setPayMethod('eth')} />
                    <span className="text-lg">⬡</span>
                    <span className="text-[11px] text-white/60">ETH</span>
                  </label>
                )}
              </div>
            </div>

            {error && <p className="text-neon-red text-sm">{error}</p>}

            <button onClick={handlePay} className="btn-primary w-full justify-center py-3 text-base" disabled={processing || (isCustom && !form.customAmount)}>
              {processing ? 'Processing...' : `Pay ${!isCustom ? (currency === 'INR' ? `₹${(fixedAmount/100).toLocaleString('en-IN')}` : `$${(fixedAmount/100).toFixed(2)}`) : ''} →`}
            </button>

            <p className="text-[11px] text-white/20 text-center">Secured by CreatorPay · SSL encrypted</p>
          </div>
        )}
      </div>
    </div>
  )
}
