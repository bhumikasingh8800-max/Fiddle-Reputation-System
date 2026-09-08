import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Bell, Settings, LogOut, User2, ChevronDown, X, Shield,
  Moon, Globe2, Zap, Lock, Eye, EyeOff, CheckCircle2,
  AlertCircle, Utensils, Menu
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'
import { useNotifications, formatRelativeTime } from '../context/NotificationsContext'
import { changePassword } from '../api/client'
import logo from '../assets/firstfiddle-logo.png'

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', end: true },
  { label: 'Outlets', to: '/outlets' },
  { label: 'Reviews', to: '/reviews' },
  { label: 'Comparison', to: '/comparison' }
]

// Admin-only item, appended conditionally inside the component based on
// the logged-in user's role — see navItems below.
const ADMIN_NAV_ITEM = { label: 'Approvals', to: '/admin/approvals' }

// ── Profile Settings Modal ─────────────────────────────────────────────────────
function ProfileModal({ user, onClose, initialTab = 'profile' }) {
  const [tab, setTab] = useState(initialTab)
  const [form, setForm] = useState({ name: user.name, email: user.email, role: user.role })
  const [saved, setSaved] = useState(false)
  const { theme, toggleTheme, autoRefresh, toggleAutoRefresh } = usePreferences()
  const { addNotification } = useNotifications()

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const initials = user.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)

    if (pwForm.next.length < 8) {
      setPwError('New password must be at least 8 characters')
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New passwords do not match')
      return
    }
    if (pwForm.next === pwForm.current) {
      setPwError('New password must be different from your current password')
      return
    }

    setPwSaving(true)
    try {
      await changePassword(pwForm.current, pwForm.next)
      setPwSuccess(true)
      setPwForm({ current: '', next: '', confirm: '' })
      addNotification({
        type: 'success',
        title: 'Password changed',
        sub: 'Your account password was updated successfully.',
      })
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-dark-800 border border-dark-500 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-500 bg-gradient-to-r from-dark-700 to-dark-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div>
              <p className="font-display font-bold text-slate-100 text-sm">Account Settings</p>
              <p className="text-xs text-slate-500">Manage your profile and preferences</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-dark-500 transition-all">
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dark-500">
          {[
            { id: 'profile', label: 'Profile', icon: User2 },
            { id: 'security', label: 'Security', icon: Shield },
            { id: 'preferences', label: 'Preferences', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                tab === id
                  ? 'text-brand-400 border-b-2 border-brand-500 bg-brand-500/5'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {tab === 'profile' && (
            <>
              {/* Avatar */}
              <div className="flex items-center gap-4 p-4 bg-dark-700/50 rounded-xl border border-dark-500">
                <div className="w-14 h-14 bg-gradient-brand rounded-2xl flex items-center justify-center shadow-glow-brand flex-shrink-0">
                  <span className="text-white text-lg font-bold">{initials}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-100">{form.name}</p>
                  <p className="text-xs text-slate-500">{form.role}</p>
                  <p className="text-xs text-brand-400 mt-1">{form.email}</p>
                </div>
              </div>

              {[
                { key: 'name', label: 'Full Name', placeholder: 'Your full name' },
                { key: 'email', label: 'Email Address', placeholder: 'you@example.com' }
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">{label}</label>
                  <input
                    className="w-full bg-dark-600 border border-dark-400 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-brand-500 transition-colors placeholder-slate-600"
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </>
          )}

          {tab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-200 mb-1">Change Password</p>
                <p className="text-xs text-slate-500">
                  Requires your current password to confirm it's really you.
                </p>
              </div>

              {[
                { key: 'current', label: 'Current Password' },
                { key: 'next', label: 'New Password' },
                { key: 'confirm', label: 'Confirm New Password' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">{label}</label>
                  <div className="relative">
                    <input
                      type={showPw[key] ? 'text' : 'password'}
                      className="w-full bg-dark-600 border border-dark-400 rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-200 outline-none focus:border-brand-500 transition-colors"
                      value={pwForm[key]}
                      onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                      autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPw[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ))}

              {pwError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{pwError}</p>
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-300">Password changed successfully.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={pwSaving}
                className="btn-primary w-full justify-center py-2.5 disabled:opacity-60"
              >
                <Lock size={14} />
                {pwSaving ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}

          {tab === 'preferences' && (
            <div className="space-y-3">
              {/* Dark Mode */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between p-3.5 bg-dark-700/50 border border-dark-500 rounded-xl hover:border-brand-500/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center">
                    <Moon size={15} className="text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">Dark Mode</p>
                    <p className="text-xs text-slate-500">{theme === 'dark' ? 'Currently on' : 'Currently off — light theme active'}</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors ${theme === 'dark' ? 'bg-brand-500' : 'bg-dark-400'} flex items-center`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {/* Auto-refresh Dashboard */}
              <button
                onClick={toggleAutoRefresh}
                className="w-full flex items-center justify-between p-3.5 bg-dark-700/50 border border-dark-500 rounded-xl hover:border-brand-500/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center">
                    <Zap size={15} className="text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">Auto-refresh Dashboard</p>
                    <p className="text-xs text-slate-500">Refresh data every 5 minutes</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors ${autoRefresh ? 'bg-brand-500' : 'bg-dark-400'} flex items-center`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {[
                { icon: Globe2, label: 'Language', sub: 'English (India)' },
                { icon: Shield, label: 'Email Alerts', sub: 'Get notified on negative spikes' },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center justify-between p-3.5 bg-dark-700/30 border border-dark-500/60 rounded-xl opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center">
                      <Icon size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-300">{label}</p>
                      <p className="text-xs text-slate-500">{sub} · Coming soon</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab !== 'security' && (
          <div className="px-6 py-4 border-t border-dark-500 flex gap-3">
            <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm py-2">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1 justify-center text-sm py-2">
              {saved ? '✓ Saved!' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Horizontal Top Navigation Bar ─────────────────────────────────────────────
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { notifications, markAllRead, dismissNotification } = useNotifications()

  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileModalTab, setProfileModalTab] = useState('profile')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const notifRef = useRef(null)
  const profileRef = useRef(null)

  const displayName = user?.name || 'Loading…'
  const displayRole = user?.role || ''
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const unreadCount = notifications.filter(n => n.unread).length

  // Only admins see the Approvals link — recomputed whenever the user
  // object changes (e.g. right after login resolves).
  const navItems = user?.role === 'admin' ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS

  const handleSignOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <>
      <header className="w-full border-b border-dark-500/60 bg-dark-900/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3 flex items-center justify-between">
        
        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-brand rounded-full flex items-center justify-center shadow-glow-brand flex-shrink-0 object-cover">
            <img src={logo} alt="logo" />
          </div>
          <div>
            <p className="font-display font-extrabold text-sm text-slate-100 leading-tight tracking-wider uppercase">
              First Fiddle
            </p>
            <p className="text-[10px] text-brand-400 font-bold tracking-widest uppercase">
              Reputation System
            </p>
          </div>
        </div>

        {/* Center: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 mx-8">
          {navItems.map(({ label, to, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 rounded-xl border border-transparent ${
                  isActive
                    ? 'text-brand-400 bg-brand-500/10 border-brand-500/20 shadow-glow-brand'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right: Actions (Notifications & User Settings) */}
        <div className="flex items-center gap-3">
          
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setShowNotifications(v => !v); setShowProfile(false) }}
              className="relative w-9 h-9 bg-dark-800 rounded-xl flex items-center justify-center border border-dark-500 hover:bg-dark-700 hover:border-brand-500/40 transition-all shadow-md"
              title="Notifications"
            >
              <Bell size={15} className="text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] min-h-[18px] bg-brand-500 rounded-full text-[9px] text-white flex items-center justify-center font-extrabold shadow-glow-brand px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2.5 w-80 bg-dark-800 border border-dark-500 rounded-2xl shadow-2xl overflow-hidden animate-slide-up z-40">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500 bg-dark-700/50">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-brand-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-200">Notifications</p>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 text-[10px] font-bold">{unreadCount} new</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[11px] font-bold uppercase tracking-wider text-brand-400 hover:text-brand-300 transition-colors">
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-dark-600">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                      <Bell size={20} className="opacity-15" />
                      <p className="text-xs">No notifications yet</p>
                    </div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-dark-700/40 transition-colors ${n.unread ? 'bg-brand-500/5' : ''}`}
                    >
                      {n.unread && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0 shadow-glow-brand" />}
                      {!n.unread && <div className="w-1.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-200 leading-snug">{n.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.sub}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{formatRelativeTime(n.time)}</p>
                      </div>
                      <button
                        onClick={() => dismissNotification(n.id)}
                        className="text-slate-500 hover:text-slate-300 flex-shrink-0 mt-0.5 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setShowProfile(v => !v); setShowNotifications(false) }}
              className="flex items-center gap-2 pl-1 pr-2 py-1 bg-dark-800 rounded-xl border border-dark-500 hover:bg-dark-700 hover:border-brand-500/40 transition-all shadow-md"
              title="Profile"
            >
              <div className="w-7 h-7 bg-gradient-brand rounded-lg flex items-center justify-center shadow-glow-brand flex-shrink-0">
                <span className="text-white text-[11px] font-bold">{initials}</span>
              </div>
              <div className="hidden sm:block text-left max-w-[100px]">
                <p className="text-xs font-bold text-slate-200 leading-none truncate">{displayName}</p>
                {displayRole && <p className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase mt-0.5 truncate">{displayRole}</p>}
              </div>
              <ChevronDown size={12} className={`text-slate-400 transition-transform hidden sm:block ${showProfile ? 'rotate-180' : ''}`} />
            </button>

            {showProfile && (
              <div className="absolute right-0 mt-2.5 w-52 bg-dark-800 border border-dark-500 rounded-2xl shadow-2xl overflow-hidden animate-slide-up z-40">
                {/* Profile header */}
                <div className="px-4 py-3.5 border-b border-dark-500 bg-gradient-to-br from-dark-700 to-dark-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-gradient-brand rounded-xl flex items-center justify-center shadow-glow-brand flex-shrink-0">
                      <span className="text-white text-xs font-bold">{initials}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-100 leading-none">{displayName}</p>
                      {displayRole && <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">{displayRole}</p>}
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => { setShowProfile(false); setProfileModalTab('profile'); setShowProfileModal(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-white/5 hover:text-slate-100 transition-colors text-left"
                  >
                    <User2 size={13} className="text-slate-400" />
                    Profile & Settings
                  </button>
                  <button
                    onClick={() => { setShowProfile(false); setProfileModalTab('security'); setShowProfileModal(true) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-white/5 hover:text-slate-100 transition-colors text-left"
                  >
                    <Shield size={13} className="text-slate-400" />
                    Account Security
                  </button>
                </div>

                <div className="py-1 border-t border-dark-500">
                  <button
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition-colors text-left"
                    onClick={handleSignOut}
                  >
                    <LogOut size={13} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(o => !o)}
            className="p-1.5 rounded-xl border border-dark-500 bg-dark-800 text-slate-300 hover:text-white md:hidden hover:border-brand-500/40"
          >
            <Menu size={16} />
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden w-full bg-dark-900 border-b border-dark-500/60 p-4 space-y-2 animate-fade-in relative z-20">
          {navItems.map(({ label, to, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-transparent ${
                  isActive
                    ? 'text-brand-400 bg-brand-500/10 border-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Profile settings modal */}
      {showProfileModal && user && (
        <ProfileModal user={user} onClose={() => setShowProfileModal(false)} initialTab={profileModalTab} />
      )}
    </>
  )
}