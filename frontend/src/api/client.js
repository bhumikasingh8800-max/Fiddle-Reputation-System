import axios from 'axios'

const TOKEN_KEY = 'ff_auth_token'

const api = axios.create({ 
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the stored token to every request. The API doesn't require it on
// any route yet, but wiring this up now means nothing changes on the
// frontend later if/when routes start requiring auth.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use( 
  (res) => res,
  (err) => {
    console.error('[API Error]', err.response?.data || err.message)
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const AUTH_TOKEN_KEY = TOKEN_KEY

export const registerUser = (data) =>
  api.post('/api/auth/register', data).then(r => r.data)

export const loginUser = (data) =>
  api.post('/api/auth/login', data).then(r => r.data)

export const getMe = () =>
  api.get('/api/auth/me').then(r => r.data)

export const changePassword = (currentPassword, newPassword) =>
  api.patch('/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  }).then(r => r.data)

// ── Admin: signup approval ──────────────────────────────────────────────────
export const getPendingUsers = () =>
  api.get('/api/auth/pending-users').then(r => r.data)

export const approveUser = (userId) =>
  api.post(`/api/auth/approve/${userId}`).then(r => r.data)

export const rejectUser = (userId) =>
  api.delete(`/api/auth/reject/${userId}`).then(r => r.data)

// ── Restaurants ───────────────────────────────────────────────────────────────
export const getRestaurants = (params = {}) =>
  api.get('/api/restaurants', { params }).then(r => r.data)

export const getRestaurant = (id) =>
  api.get(`/api/restaurants/${id}`).then(r => r.data)

export const createRestaurant = (data) =>
  api.post('/api/restaurants', data).then(r => r.data)

export const updateRestaurant = (id, data) =>
  api.patch(`/api/restaurants/${id}`, data).then(r => r.data)

export const deleteRestaurant = (id) =>
  api.delete(`/api/restaurants/${id}`).then(r => r.data)

// ── Reviews ───────────────────────────────────────────────────────────────────
export const getReviews = (restaurantId, params = {}) =>
  api.get(`/api/reviews/${restaurantId}`, { params }).then(r => r.data)

export const triggerScrape = (restaurantId, payload = {}) =>
  api.post(`/api/scrape/${restaurantId}`, payload).then(r => r.data)

export const getScrapeStatus = (jobId) =>
  api.get(`/api/scrape/status/${jobId}`).then(r => r.data)

export const processNLP = (restaurantId) =>
  api.post('/api/reviews/process-nlp', null, {
    params: { restaurant_id: restaurantId }
  }).then(r => r.data)

export const getNlpStatus = (jobId) =>
  api.get(`/api/reviews/process-nlp/status/${jobId}`).then(r => r.data)

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getOverview = () =>
  api.get('/api/analytics/overview').then(r => r.data)

export const getOutletAnalytics = (restaurantId, period = '30d') =>
  api.get(`/api/analytics/${restaurantId}`, { params: { period } }).then(r => r.data)

export const getRatingTrend = (restaurantId, period = '90d') =>
  api.get('/api/analytics/trend/rating', {
    params: { restaurant_id: restaurantId, period }
  }).then(r => r.data)

export const getOutletComparison = () =>
  api.get('/api/analytics/comparison/outlets').then(r => r.data)

// ── AI Insights ───────────────────────────────────────────────────────────────
export const generateInsights = (restaurantId, forceRefresh = false) =>
  api.post(`/api/insights/${restaurantId}`, null, {
    params: { force_refresh: forceRefresh }
  }).then(r => r.data)

export const getInsights = (restaurantId) =>
  api.get(`/api/insights/${restaurantId}`).then(r => r.data)

export const sendChatMessage = (message, restaurantId, history = []) =>
  api.post('/api/chat', {
    message,
    restaurant_id: restaurantId || undefined,
    history,
  }).then(r => r.data)

// ── Reports ───────────────────────────────────────────────────────────────────
export const downloadReportPDF = async (restaurantId, period) => {
  const response = await api.get(`/api/reports/${restaurantId}/pdf`, {
    params: { period },
    responseType: 'blob',
    timeout: 120_000, // PDF generation can take up to 30s with Gemini + Playwright
  })
  const blob = new Blob([response.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `first-fiddle-report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

// ── Seed ──────────────────────────────────────────────────────────────────────
export const seedDemo = () =>
  api.post('/api/seed').then(r => r.data)

export default api

