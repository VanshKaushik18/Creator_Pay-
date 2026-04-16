import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard', icon: '▣', label: 'Dashboard' },
  { to: '/links', icon: '⬡', label: 'Payment Links' },
  { to: '/transactions', icon: '↕', label: 'Transactions' },
  { to: '/withdraw', icon: '↑', label: 'Withdraw' },
  { to: '/settings', icon: '◎', label: 'Settings' },
]

const ADMIN_ITEMS = [
  { to: '/admin', icon: '◈', label: 'Admin Panel' },
]

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CP'

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 bg-dark-800 border-r border-white/8 flex flex-col
        transform transition-transform duration-200 lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="p-5 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-base font-bold">₿</div>
            <div>
              <div className="text-sm font-semibold leading-tight">CreatorPay</div>
              <div className="text-[10px] text-white/40 uppercase tracking-widest">Payment Platform</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] text-white/30 uppercase tracking-widest px-3 pt-2 pb-1">Creator</p>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <p className="text-[10px] text-white/30 uppercase tracking-widest px-3 pt-4 pb-1">Admin</p>
              {ADMIN_ITEMS.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      isActive ? 'bg-neon-red/15 text-neon-red font-medium' : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/8">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer group" onClick={handleLogout}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-neon-green flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-[11px] text-white/40 truncate">{user?.plan} plan</div>
            </div>
            <span className="text-white/20 group-hover:text-neon-red text-xs transition-colors">⏻</span>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-5 h-14 bg-dark-800/80 backdrop-blur border-b border-white/8 flex-shrink-0">
          <button
            className="lg:hidden text-white/50 hover:text-white p-1"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <span className="live-dot" />
            <span className="text-xs text-white/30">Live</span>
            <div className="w-px h-4 bg-white/10" />
            <span className="text-xs text-white/50 font-mono">
              ${((user?.balance?.available || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
