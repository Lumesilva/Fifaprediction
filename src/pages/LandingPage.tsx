import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { motion } from 'framer-motion';
import { Trophy, Target, BarChart3, Zap, ArrowRight, Globe, Shield, Users } from 'lucide-react';

export default function LandingPage() {
  const { user } = useAuth();

  const features = [
    { icon: Target, title: 'Predict Matches', desc: 'Pick winners and exact scores for every World Cup 2026 fixture' },
    { icon: Trophy, title: 'Earn Points', desc: '2 pts for correct winner, +3 bonus for exact score — up to 5 per match' },
    { icon: BarChart3, title: 'Climb the Leaderboard', desc: 'Compete globally and track your ranking in real-time' },
    { icon: Users, title: 'Community Insights', desc: 'See how others predict with community stats and prediction feeds' },
    { icon: Globe, title: 'Live Scores', desc: 'Real-time match updates integrated from TheSportsDB' },
    { icon: Shield, title: 'Admin Panel', desc: 'Manage fixtures, enter results, and control the platform' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-gray-950/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-lg">WC 2026</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard"><Button size="sm">Dashboard <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Sign In</Button></Link>
                <Link to="/register"><Button size="sm">Get Started</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-sm font-medium mb-6">
            <Zap className="w-3.5 h-3.5" /> FIFA World Cup 2026
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black leading-tight">
            Predict the<span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent"> World Cup</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Predict match winners and exact scores for every fixture. Earn points, climb the global leaderboard, and compete with fans worldwide.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
            {!user && (
              <Link to="/register">
                <Button size="lg">Start Predicting <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </Link>
            )}
            {/* FIX: leaderboard requires auth — only show if logged in, otherwise send to login */}
            {user
              ? <Link to="/leaderboard"><Button variant="secondary" size="lg">View Leaderboard</Button></Link>
              : <Link to="/login"><Button variant="secondary" size="lg">Sign in to see Leaderboard</Button></Link>}
          </div>
        </motion.div>

        <motion.div
          className="mt-16 max-w-md mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Card>
            <CardContent className="py-6 text-left">
              <h3 className="text-lg font-bold text-center mb-4">Scoring System</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-gray-300">Correct Winner</span>
                  <span className="font-bold text-emerald-400">+2 pts</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-teal-500/10 border border-teal-500/20">
                  <span className="text-gray-300">Exact Score Bonus</span>
                  <span className="font-bold text-teal-400">+3 pts</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <span className="text-gray-300">Max Per Match</span>
                  <span className="font-bold text-amber-400">5 pts</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <h2 className="text-3xl font-bold text-center mb-12">Everything You Need</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="h-full">
                <CardContent className="py-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-3">
                    <f.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-400">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-gray-500">
          FIFA World Cup 2026 Prediction Platform · Not affiliated with FIFA
        </div>
      </footer>
    </div>
  );
}
