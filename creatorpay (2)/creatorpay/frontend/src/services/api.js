import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cp_token')
      localStorage.removeItem('cp_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
}

// ── Dashboard ─────────────────────────────────────────────
export const dashboardAPI = {
  get: () => api.get('/dashboard'),
}

// ── Payment Links ─────────────────────────────────────────
export const linksAPI = {
  getAll: () => api.get('/links'),
  getPublic: (slug) => api.get(`/links/${slug}/public`),
  create: (data) => api.post('/links', data),
  update: (id, data) => api.put(`/links/${id}`, data),
  delete: (id) => api.delete(`/links/${id}`),
}

// ── Payments ──────────────────────────────────────────────
export const paymentsAPI = {
  stripeCheckout: (data) => api.post('/payments/stripe/checkout', data),
  razorpayOrder: (data) => api.post('/payments/razorpay/order', data),
  razorpayVerify: (data) => api.post('/payments/razorpay/verify', data),
  cryptoInitiate: (data) => api.post('/payments/crypto/initiate', data),
  cryptoStatus: (txnId) => api.get(`/payments/crypto/status/${txnId}`),
}

// ── Transactions ──────────────────────────────────────────
export const transactionsAPI = {
  getAll: (params) => api.get('/transactions', { params }),
  getAnalytics: (days = 30) => api.get('/transactions/analytics', { params: { days } }),
}

// ── Withdraw ──────────────────────────────────────────────
export const withdrawAPI = {
  getAll: () => api.get('/withdraw'),
  create: (data) => api.post('/withdraw', data),
}

// ── Admin ─────────────────────────────────────────────────
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getUsers: (params) => api.get('/admin/users', { params }),
  suspendUser: (id, data) => api.put(`/admin/users/${id}/suspend`, data),
  getTransactions: (params) => api.get('/admin/transactions', { params }),
  getFraudAlerts: () => api.get('/admin/fraud-alerts'),
  fraudAction: (id, action) => api.put(`/admin/fraud/${id}`, { action }),
  getAnalytics: () => api.get('/admin/analytics'),
}

export default api
