import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { authAPI } from '../services/api'

export default function SettingsPage() {
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState({ name: user?.name || '', bio: user?.bio || '', username: user?.username || '', website: user?.website || '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [profileMsg, setProfileMsg] = useState({ text: '', ok: true })
  const [pwdMsg, setPwdMsg] = useState({ text: '', ok: true })

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg({ text: '', ok: true })
    try {
      const r = await authAPI.updateProfile(profile)
      updateUser(r.data.user)
      setProfileMsg({ text: 'Profile updated successfully!', ok: true })
    } catch (err) {
      setProfileMsg({ text: err.response?.data?.message || 'Update failed', ok: false })
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwdMsg({ text: 'Passwords do not match', ok: false }); return
    }
    if (passwords.newPassword.length < 8) {
      setPwdMsg({ text: 'Password must be at least 8 characters', ok: false }); return
    }
    setSavingPwd(true)
    setPwdMsg({ text: '', ok: true })
    try {
      await authAPI.updateProfile({ password: passwords.newPassword, currentPassword: passwords.currentPassword })
      setPwdMsg({ text: 'Password changed successfully!', ok: true })
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwdMsg({ text: err.response?.data?.message || 'Password change failed', ok: false })
    } finally {
      setSavingPwd(false)
    }
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CP'

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-white/40 mt-0.5">Manage your profile and account</p>
      </div>

      {/* Profile */}
      <div className="card p-6">
        <h2 className="font-semibold text-sm mb-4">Profile</h2>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-neon-green flex items-center justify-center text-xl font-bold flex-shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-medium">{user?.name}</p>
            <p className="text-sm text-white/40">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-purple">{user?.plan} plan</span>
              <span className={user?.kyc?.status === 'verified' ? 'badge-green' : 'badge-amber'}>
                KYC {user?.kyc?.status || 'unverified'}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Username</label>
              <div className="flex items-center bg-dark-700 border border-white/12 rounded-lg overflow-hidden focus-within:border-accent/60 transition-all">
                <span className="px-3 text-white/30 text-sm border-r border-white/10 py-2.5">@</span>
                <input className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none text-white" value={profile.username} onChange={e => setProfile(p => ({ ...p, username: e.target.value }))} placeholder="username" />
              </div>
            </div>
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea className="input resize-none h-20" placeholder="Tell people what you do..." value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} maxLength={300} />
            <p className="text-xs text-white/20 mt-1">{profile.bio.length}/300</p>
          </div>
          <div>
            <label className="label">Website</label>
            <input className="input" placeholder="https://yoursite.com" value={profile.website} onChange={e => setProfile(p => ({ ...p, website: e.target.value }))} />
          </div>

          {profileMsg.text && (
            <p className={`text-sm ${profileMsg.ok ? 'text-neon-green' : 'text-neon-red'}`}>{profileMsg.text}</p>
          )}
          <button type="submit" className="btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card p-6">
        <h2 className="font-semibold text-sm mb-4">Change Password</h2>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={passwords.currentPassword} onChange={e => setPasswords(p => ({ ...p, currentPassword: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">New Password</label>
              <input type="password" className="input" placeholder="8+ characters" value={passwords.newPassword} onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Confirm New</label>
              <input type="password" className="input" value={passwords.confirmPassword} onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))} required />
            </div>
          </div>
          {pwdMsg.text && (
            <p className={`text-sm ${pwdMsg.ok ? 'text-neon-green' : 'text-neon-red'}`}>{pwdMsg.text}</p>
          )}
          <button type="submit" className="btn-primary" disabled={savingPwd}>
            {savingPwd ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Plan */}
      <div className="card p-6">
        <h2 className="font-semibold text-sm mb-4">Plan & Billing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Free', price: '$0/mo', features: ['3 payment links', 'Stripe + Razorpay', '2% platform fee'], current: user?.plan === 'free' },
            { name: 'Pro', price: '$9/mo', features: ['Unlimited links', 'Crypto payments', '1% platform fee', 'Priority support'], current: user?.plan === 'pro' },
            { name: 'Enterprise', price: 'Custom', features: ['White-label', 'Custom fee', 'Dedicated support', 'SLA guaranteed'], current: user?.plan === 'enterprise' },
          ].map(plan => (
            <div key={plan.name} className={`rounded-xl p-4 border transition-colors ${plan.current ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/20'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm">{plan.name}</p>
                  <p className="font-mono text-lg text-neon-green font-bold">{plan.price}</p>
                </div>
                {plan.current && <span className="badge-purple text-[10px]">Current</span>}
              </div>
              <ul className="space-y-1 mb-3">
                {plan.features.map(f => (
                  <li key={f} className="text-xs text-white/40 flex items-center gap-1.5">
                    <span className="text-neon-green text-[10px]">✓</span>{f}
                  </li>
                ))}
              </ul>
              {!plan.current && (
                <button className="w-full btn-ghost py-1.5 text-xs justify-center">
                  {plan.name === 'Enterprise' ? 'Contact Sales' : 'Upgrade →'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card p-6 border-neon-red/15">
        <h2 className="font-semibold text-sm mb-1 text-neon-red">Danger Zone</h2>
        <p className="text-xs text-white/40 mb-4">These actions are irreversible. Proceed with caution.</p>
        <div className="flex gap-3">
          <button className="btn-danger text-xs py-1.5 px-3" onClick={() => alert('Contact support@creatorpay.io to delete your account')}>
            Delete Account
          </button>
          <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => alert('All sessions will be invalidated')}>
            Sign Out All Devices
          </button>
        </div>
      </div>
    </div>
  )
}
