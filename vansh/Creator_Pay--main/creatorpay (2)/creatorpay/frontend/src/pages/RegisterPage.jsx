import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', username: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await register(form)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-neon-green/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-light text-2xl mb-4">₿</div>
          <h1 className="text-2xl font-semibold">Start getting paid</h1>
          <p className="text-white/40 text-sm mt-1">Create your CreatorPay account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-neon-red/10 border border-neon-red/20 text-neon-red text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="label">Full name</label>
            <input type="text" className="input" placeholder="Aryan Kumar" value={form.name} onChange={set('name')} required />
          </div>

          <div>
            <label className="label">Username</label>
            <div className="flex items-center bg-dark-700 border border-white/12 rounded-lg overflow-hidden focus-within:border-accent/60 transition-all">
              <span className="px-3 text-white/30 text-sm border-r border-white/10 py-2.5">pay.io/</span>
              <input type="text" className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none text-white placeholder-white/30" placeholder="aryan" value={form.username} onChange={set('username')} />
            </div>
          </div>

          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
          </div>

          <div>
            <label className="label">Password</label>
            <input type="password" className="input" placeholder="8+ characters" value={form.password} onChange={set('password')} required minLength={8} />
          </div>

          <button type="submit" className="btn-primary w-full justify-center py-2.5 text-base" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account →'}
          </button>
        </form>

        <p className="text-center text-xs text-white/30 mt-4">
          Free plan: 3 links, unlimited transactions. No credit card needed.
        </p>

        <p className="text-center text-sm text-white/40 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:text-accent-light transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
