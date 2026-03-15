import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On app load, restore user from localStorage
  useEffect(() => {
    const token = localStorage.getItem('cp_token')
    const saved = localStorage.getItem('cp_user')
    if (token && saved) {
      try {
        setUser(JSON.parse(saved))
        // Refresh from server in background
        authAPI.me().then(res => {
          setUser(res.data.user)
          localStorage.setItem('cp_user', JSON.stringify(res.data.user))
        }).catch(() => logout())
      } catch { logout() }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password })
    const { token, user } = res.data
    localStorage.setItem('cp_token', token)
    localStorage.setItem('cp_user', JSON.stringify(user))
    setUser(user)
    return user
  }, [])

  const register = useCallback(async (data) => {
    const res = await authAPI.register(data)
    const { token, user } = res.data
    localStorage.setItem('cp_token', token)
    localStorage.setItem('cp_user', JSON.stringify(user))
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('cp_token')
    localStorage.removeItem('cp_user')
    setUser(null)
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => {
      const updated = { ...prev, ...updates }
      localStorage.setItem('cp_user', JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
