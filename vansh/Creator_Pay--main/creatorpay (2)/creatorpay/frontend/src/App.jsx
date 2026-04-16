import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import LinksPage from './pages/LinksPage'
import TransactionsPage from './pages/TransactionsPage'
import WithdrawPage from './pages/WithdrawPage'
import AdminPage from './pages/AdminPage'
import PayPage from './pages/PayPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import SettingsPage from './pages/SettingsPage'

// Layout
import AppLayout from './components/layout/AppLayout'

const ProtectedRoute = ({ children, adminRequired = false }) => {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (adminRequired && user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

const LoadingScreen = () => (
  <div className="min-h-screen bg-dark-900 flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-xl animate-pulse">₿</div>
      <p className="text-white/40 text-sm">Loading CreatorPay...</p>
    </div>
  </div>
)

const AppRoutes = () => (
  <Routes>
    {/* Public */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
    <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
    <Route path="/pay/:slug" element={<PayPage />} />
    <Route path="/payment/success" element={<PaymentSuccessPage />} />

    {/* Protected — creator */}
    <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="links" element={<LinksPage />} />
      <Route path="transactions" element={<TransactionsPage />} />
      <Route path="withdraw" element={<WithdrawPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>

    {/* Protected — admin */}
    <Route path="/admin" element={<ProtectedRoute adminRequired><AppLayout /></ProtectedRoute>}>
      <Route index element={<AdminPage />} />
    </Route>

    {/* 404 */}
    <Route path="*" element={
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-6xl font-mono text-accent mb-4">404</p>
          <p className="text-white/50 mb-6">Page not found</p>
          <a href="/dashboard" className="btn-primary inline-flex">Go Home</a>
        </div>
      </div>
    } />
  </Routes>
)

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
