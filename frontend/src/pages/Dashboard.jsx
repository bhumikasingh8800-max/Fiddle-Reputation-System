import { useState, useEffect, useCallback } from 'react'
import { Star, MessageCircle, Building2, AlertTriangle, Activity, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import SentimentDonut from '../components/SentimentDonut'
import RatingTrend from '../components/RatingTrend'
import ComplaintCategories from '../components/ComplaintCategories'
import ReviewFeed from '../components/ReviewFeed'
import AIInsightsPanel from '../components/AIInsightsPanel'
import {
  getOverview, getRatingTrend, getRestaurants, getReviews, getOutletComparison, getOutletAnalytics
} from '../api/client'
import { usePreferences } from '../context/PreferencesContext'

function StatCard({ icon: Icon, label, value, sub, color = 'brand', trend }) {
  const colorMap = {
    brand:   'from-brand-500/10 to-transparent border-brand-500/15 text-brand-400 hover:border-brand-500/35',
    green:   'from-emerald-500/10 to-transparent border-emerald-500/15 text-emerald-400 hover:border-emerald-500/35',
    red:     'from-red-500/10 to-transparent border-red-500/15 text-red-400 hover:border-red-500/35',
    purple:  'from-violet-500/10 to-transparent border-violet-500/15 text-violet-400 hover:border-violet-500/35',
  }

  const glowColor = {
    brand: 'rgba(249, 178, 30, 0.08)',
    green: 'rgba(16, 185, 129, 0.06)',
    red: 'rgba(239, 68, 68, 0.06)',
    purple: 'rgba(139, 92, 246, 0.06)'
  }

  return (
    <div 
      className={`stat-card bg-gradient-to-br ${colorMap[color]} border transition-all duration-300 relative overflow-hidden`}
      style={{
        boxShadow: `0 8px 30px -5px rgba(0,0,0,0.5), 0 0 15px ${glowColor[color]}`
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-current to-transparent opacity-30" />
      <div className="flex items-center justify-between relative z-10">
        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-dark-800 border border-dark-600">
          <Icon size={14} className={colorMap[color].split(' ').pop()} />
        </div>
      </div>
      <p className="font-display font-black text-3xl text-slate-100 mt-3 relative z-10 tracking-tight">{value ?? '—'}</p>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-600/30 relative z-10">
        {sub && <p className="text-[10px] text-slate-500 font-medium">{sub}</p>}
        {trend !== undefined && (
          <span className={`text-[10px] font-extrabold ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  )
}

function OutletHealthRow({ outlet }) {
  const ratingColor = outlet.avg_rating >= 4 ? 'text-emerald-400' : outlet.avg_rating >= 3 ? 'text-amber-400' : 'text-red-400'
  const totalSent = (outlet.sentiment?.positive || 0) + (outlet.sentiment?.neutral || 0) + (outlet.sentiment?.negative || 0)
  const posPct = totalSent > 0 ? Math.round((outlet.sentiment?.positive / totalSent) * 100) : 0
  const negPct = totalSent > 0 ? Math.round((outlet.sentiment?.negative / totalSent) * 100) : 0
  const healthy = outlet.avg_rating >= 3.5 && negPct < 30

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-dark-600/30 last:border-0 hover:bg-dark-600/30 -mx-2 px-2 rounded-lg transition-colors">
      {healthy
        ? <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
        : <XCircle size={14} className="text-red-400 flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-200 truncate">{outlet.branch_code || outlet.name}</p>
        <p className="text-[10px] text-slate-500 truncate">{outlet.city}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Star size={10} className={`${ratingColor} fill-current`} />
        <span className={`text-xs font-black ${ratingColor}`}>{outlet.avg_rating?.toFixed(1) || '—'}</span>
      </div>
      <div className="w-16 flex-shrink-0">
        <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-dark-750 border border-dark-600/50">
          <div className="bg-emerald-500 rounded-full" style={{ width: `${posPct}%` }} />
          <div className="bg-red-500 rounded-full" style={{ width: `${negPct}%` }} />
        </div>
        <p className="text-[9px] font-bold text-slate-500 text-right mt-0.5">{posPct}% POS</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { autoRefresh } = usePreferences()
  const [overview, setOverview]         = useState(null)
  const [outletAnalytics, setOutletAnalytics] = useState(null)
  const [trend, setTrend]               = useState([])
  const [reviews, setReviews]           = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [outlets, setOutlets]           = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState(null)
  const [loading, setLoading]           = useState(true)
  const [refreshKey, setRefreshKey]     = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, rests, comp] = await Promise.all([
        getOverview(),
        getRestaurants(),
        getOutletComparison(),
      ])
      setOverview(ov)
      setRestaurants(rests.items || [])
      setOutlets(comp.outlets || [])

      if (rests.items?.length) {
        const firstId = rests.items[0].id
        setSelectedOutlet(firstId)
        const [analytics, t, r] = await Promise.all([
          getOutletAnalytics(firstId, '100d'), // Changed from 30d
          getRatingTrend(firstId, '100d'),     // Changed from 90d to match
          getReviews(firstId, { page_size: 10 }),
        ])
        setOutletAnalytics(analytics)
        setTrend(t.trend || [])
        setReviews(r.items || [])
      }
    } catch (e) {
      console.error('Dashboard load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData, refreshKey])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleOutletChange = async (outletId) => {
    setSelectedOutlet(outletId)
    if (!outletId) {
      setOutletAnalytics(null)
      return
    }
    const [analytics, t, r] = await Promise.all([
      getOutletAnalytics(outletId, '100d'), // Changed from 30d
      getRatingTrend(outletId, '100d'),     // Changed from 90d to match
      getReviews(outletId, { page_size: 10 }),
    ])
    setOutletAnalytics(analytics)
    setTrend(t.trend || [])
    setReviews(r.items || [])
  }

  const sentTotal = Object.values(outletAnalytics?.sentiment_counts || {}).reduce((a, b) => a + b, 0)
  const negPct = outletAnalytics
    ? Math.round(((outletAnalytics.sentiment_counts?.negative || 0) / Math.max(sentTotal, 1)) * 100)
    : 0
  const posPct = outletAnalytics
    ? Math.round(((outletAnalytics.sentiment_counts?.positive || 0) / Math.max(sentTotal, 1)) * 100)
    : 0

  const sortedOutlets = [...outlets].sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      
      {/* ── Luxury Hero Header Section ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 bg-gradient-to-br from-dark-800/80 to-dark-900/40 border border-dark-500/40 rounded-2xl relative overflow-hidden shadow-2xl animate-fade-in">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-brand-400/3 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-gradient-brand rounded-full shadow-glow-brand" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-400">First Fiddle F&B Group</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black uppercase text-slate-100 tracking-tight">
            Reputation Diagnostics Center
          </h2>
          <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
            Monitor real-time customer feedback indices, sentiment analytics, and predictive AI operational recommendations across all location outlets.
          </p>
        </div>

        {/* Outlet selector & actions inside Hero */}
        <div className="relative z-10 flex flex-wrap items-center gap-3 self-start lg:self-auto">
          {restaurants.length > 0 && (
            <div className="flex items-center gap-2.5 bg-dark-700/60 p-2 rounded-xl border border-dark-600/40 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-slate-400 pl-1.5">
                <Activity size={12} className="text-brand-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Outlet</span>
              </div>
              <select
                className="bg-dark-900 border border-dark-500 rounded-lg px-2.5 py-1 text-xs font-bold uppercase text-slate-200 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                value={selectedOutlet || ''}
                onChange={e => handleOutletChange(e.target.value)}
              >
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="btn-primary text-xs px-4 py-2.5 gap-1.5"
            title="Refresh dashboard data"
          >
            <RefreshCw size={13} />
            <span className="font-bold uppercase tracking-wider">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Stat Cards Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2} label="Active Outlets"
          value={loading ? '…' : overview?.total_outlets}
          sub="First Fiddle branches" color="brand"
        />
        <StatCard
          icon={MessageCircle} label="Total Reviews"
          value={loading ? '…' : outletAnalytics?.total_reviews?.toLocaleString()}
          sub="Selected outlet, last 100 days" /* Changed from 30 days */
          color="purple"
        />
        <StatCard
          icon={Star} label="Avg Rating"
          value={loading ? '…' : outletAnalytics?.avg_rating ? `${outletAnalytics.avg_rating}★` : '—'}
          sub={`${posPct}% positive sentiment`} color="green"
        />
        <StatCard
          icon={AlertTriangle} label="Negative Rate"
          value={loading ? '…' : `${negPct}%`}
          sub={`${outletAnalytics?.sentiment_counts?.negative || 0} negative reviews`}
          color={negPct > 30 ? 'red' : 'brand'}
        />
      </div>

      {/* ── Main Grid ── */}
      <div className="space-y-6">
        
        {/* Row 1: Analytics & Trends (Visual Graphs) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sentiment Distribution */}
          <div className="card p-5 h-[410px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-dark-600/30 flex-shrink-0">
              <div className="w-1.5 h-4 bg-brand-500 rounded-full" />
              <p className="section-title mb-0">Sentiment Distribution</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <SentimentDonut data={outletAnalytics?.sentiment_counts || {}} />
            </div>
          </div>

          {/* Rating & Review Trend */}
          <div className="card p-5 h-[410px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-dark-600/30 flex-shrink-0">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
              <p className="section-title mb-0">Rating & Review Trend</p>
              {/* Changed text below from 90 days to 100 days */}
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-dark-800 border border-dark-600 px-2 py-0.5 rounded-full">100 days</span> 
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <RatingTrend data={trend} />
            </div>
          </div>

          {/* Top Complaint Categories */}
          <div className="card p-5 h-[410px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-dark-600/30 flex-shrink-0">
              <div className="w-1.5 h-4 bg-violet-500 rounded-full" />
              <p className="section-title mb-0">Top Complaint Categories</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ComplaintCategories data={outletAnalytics?.category_counts || {}} />
            </div>
          </div>
        </div>

        {/* Row 2: Operational Feeds */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Outlet Health Status */}
          <div className="card p-5 h-[480px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dark-600/30 flex-shrink-0">
              <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
              <p className="section-title mb-0">Outlet Health Status</p>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                {sortedOutlets.filter(o => (o.avg_rating || 0) >= 3.5).length}/{sortedOutlets.length} healthy
              </span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton h-10 rounded-lg" />
                  ))}
                </div>
              ) : sortedOutlets.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No outlet data available</p>
              ) : (
                <div className="space-y-0">
                  {sortedOutlets.map(o => (
                    <OutletHealthRow key={o.restaurant_id} outlet={o} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Feedback Feed */}
          <div className="card p-5 h-[480px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-dark-600/30 flex-shrink-0">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
              <p className="section-title mb-0">Recent Feedback Feed</p>
            </div>
            <div className="flex-1 overflow-y-auto pr-0.5">
              <ReviewFeed reviews={reviews} loading={loading} />
            </div>
          </div>

          {/* AI Recommendations */}
          <div className="card p-5 h-[480px] flex flex-col justify-between">
            <AIInsightsPanel restaurantId={selectedOutlet} />
          </div>
        </div>

      </div>
    </div>
  )
}