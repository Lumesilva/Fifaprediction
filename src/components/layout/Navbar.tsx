import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Avatar } from '../../components/ui/avatar';
import { Trophy, LayoutDashboard, Calendar, BarChart3, Shield, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

const navLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/fixtures', label: 'Fixtures', icon: Calendar },
  { to: '/leaderboard', label: 'Leaderboard', icon: BarChart3 },
];

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => { await signOut(); navigate('/login'); };
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-lg text-white hidden sm:block">WC 2026</span>
          </Link>

          {user && (
            <>
              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((l) => (
                  <Link key={l.to} to={l.to} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200', isActive(l.to) ? 'bg-emerald-500/15 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5')}>
                    <l.icon className="w-4 h-4" />{l.label}
                  </Link>
                ))}
                {profile?.is_admin && (
                  <Link to="/admin" className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200', isActive('/admin') ? 'bg-amber-500/15 text-amber-400' : 'text-gray-400 hover:text-white hover:bg-white/5')}>
                    <Shield className="w-4 h-4" />Admin
                  </Link>
                )}
              </div>
              <div className="hidden md:flex items-center gap-3">
                <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <Avatar fallback={profile?.username || 'U'} size="sm" />
                  <span className="text-sm font-medium text-gray-300">{profile?.username}</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4" /></Button>
              </div>
              <button className="md:hidden text-gray-400" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && user && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden border-t border-white/10 bg-gray-950/95 backdrop-blur-xl">
            <div className="px-4 py-3 space-y-1">
              {navLinks.map((l) => (
                <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all', isActive(l.to) ? 'bg-emerald-500/15 text-emerald-400' : 'text-gray-400')}>
                  <l.icon className="w-5 h-5" />{l.label}
                </Link>
              ))}
              {profile?.is_admin && (
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-400">
                  <Shield className="w-5 h-5" />Admin
                </Link>
              )}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                  <Avatar fallback={profile?.username || 'U'} size="sm" />
                  <span className="text-sm font-medium text-gray-300">{profile?.username}</span>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-1" />Sign Out</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
