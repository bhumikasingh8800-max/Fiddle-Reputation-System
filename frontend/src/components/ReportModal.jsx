import { useState, useEffect } from 'react'
import { X, FileText, Loader2, CheckCircle2, AlertCircle, Calendar, Building2 } from 'lucide-react'
import { getRestaurants, downloadReportPDF } from '../api/client'
import { useNotifications } from '../context/NotificationsContext'

const PERIODS = [
  {
    id: 'daily',
    label: 'Daily',
    sub: 'Last 24 hours',
    icon: '1D',
  },
  {
    id: 'weekly',
    label: 'Weekly',
    sub: 'Last 7 days',
    icon: '7D',
  },
  {
    id: 'monthly',
    label: 'Monthly',
    sub: 'Last 30 days',
    icon: '30D',
  },
]

export default function ReportModal({ onClose }) {
  const { addNotification } = useNotifications()

  const [restaurants, setRestaurants] = useState([])
  const [selectedOutlet, setSelectedOutlet] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('weekly')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getRestaurants()
      .then(data => {
        const items = data.items || []
        setRestaurants(items)
        if (items.length > 0) setSelectedOutlet(items[0].id)
      })
      .catch(() => setError('Failed to load outlets.'))
      .finally(() => setLoading(false))
  }, [])

  const selectedRestaurant = restaurants.find(r => r.id === selectedOutlet)

  const handleGenerate = async () => {
    if (!selectedOutlet) return
    setGenerating(true)
    setError(null)
    setDone(false)
    try {
      await downloadReportPDF(selectedOutlet, selectedPeriod)
      setDone(true)
      addNotification({
        type: 'success',
        title: '📄 Report downloaded',
        sub: `${selectedRestaurant?.name} · ${PERIODS.find(p => p.id === selectedPeriod)?.label} report saved.`,
      })
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        (err.code === 'ECONNABORTED' ? 'Request timed out. The report may still be generating — try again.' : null) ||
        'Failed to generate report. Please try again.'
      setError(detail)
      addNotification({ type: 'alert', title: '❌ Report generation failed', sub: detail })
    } finally {
      setGenerating(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className="w-full max-w-md bg-dark-800 border border-dark-500 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-500 bg-gradient-to-r from-dark-700 to-dark-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
              <FileText size={16} className="text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-slate-100 text-sm">Download PDF Report</p>
              <p className="text-xs text-slate-500">8-section professional BI report</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-dark-500 transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Content ── */}
        <div className="p-6 space-y-5">

          {/* Outlet selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Building2 size={11} />
              Select Outlet
            </label>
            {loading ? (
              <div className="skeleton h-10 rounded-xl" />
            ) : (
              <select
                id="report-outlet-select"
                className="w-full bg-dark-700 border border-dark-500 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                value={selectedOutlet}
                onChange={e => { setSelectedOutlet(e.target.value); setDone(false); setError(null) }}
                disabled={generating}
              >
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name} — {r.city}</option>
                ))}
              </select>
            )}
          </div>

          {/* Period selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Calendar size={11} />
              Reporting Period
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  id={`report-period-${p.id}`}
                  onClick={() => { setSelectedPeriod(p.id); setDone(false); setError(null) }}
                  disabled={generating}
                  className={`flex flex-col items-center py-3 px-2 rounded-xl border transition-all duration-200 ${
                    selectedPeriod === p.id
                      ? 'bg-brand-500/15 border-brand-500/50 text-brand-400'
                      : 'bg-dark-700/50 border-dark-500 text-slate-400 hover:border-dark-400 hover:text-slate-300'
                  }`}
                >
                  <span className="text-lg font-black leading-none mb-1">{p.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-wider">{p.label}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{p.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Summary of what will be generated */}
          {selectedRestaurant && (
            <div className="bg-dark-700/40 border border-dark-500/60 rounded-xl p-3.5 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Report Preview</p>
              <p className="text-sm text-slate-200 font-semibold">{selectedRestaurant.name}</p>
              <p className="text-xs text-slate-500">
                {PERIODS.find(p => p.id === selectedPeriod)?.label} ·{' '}
                {PERIODS.find(p => p.id === selectedPeriod)?.sub}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {['KPI Summary', 'Sentiment', 'Complaints', 'Root Cause', 'Action Plan', 'Outlook'].map(s => (
                  <span key={s} className="text-[10px] font-semibold bg-dark-600 border border-dark-500 text-slate-400 px-2 py-0.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Success message */}
          {done && !error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-300">
                Report downloaded successfully. Check your browser's download folder.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="px-6 py-4 border-t border-dark-500 flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm py-2.5">
            Close
          </button>
          <button
            id="report-generate-btn"
            onClick={handleGenerate}
            disabled={generating || loading || !selectedOutlet}
            className="btn-primary flex-1 justify-center py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Generating…</span>
              </>
            ) : (
              <>
                <FileText size={14} />
                <span>Generate PDF</span>
              </>
            )}
          </button>
        </div>

        {/* Generating progress note */}
        {generating && (
          <div className="px-6 pb-4">
            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Building your report with AI analysis…<br />
              This may take 15–30 seconds. Please do not close this window.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
