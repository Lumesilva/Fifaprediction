import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Fixture, Prediction } from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { formatMatchDate, isPredictionLocked, getPredictionAccuracy } from '../lib/utils';
import { useCountdown } from '../hooks/useCountdown';
import { motion } from 'framer-motion';
import { Trophy, Target, TrendingUp, Clock, Calendar, Zap, ChevronRight, AlertCircle } from 'lucide-react';

type RecentPrediction = Prediction & { home_team: string; away_team: string };

/** Single fixture row — isolated so each has its own live countdown. */
function UpcomingFixtureRow({ fixture }: { fixture: Fixture }) {
  // FIX: live countdown via hook (updates every second)
  const countdown = useCountdown(fixture.kickoff_time);
  const locked = isPredictionLocked(fixture.kickoff_time);

  return (
    <Link to={`/fixtures/${fixture.id}`}>
      <Card className="hover:border-emerald-500/30 transition-colors cursor-pointer">
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-bold text-white truncate">
                {fixture.home_team_flag && <span className="mr-1">{fixture.home_team_flag}</span>}
                {fixture.home_team}
              </span>
              <span className="text-xs text-gray-500 flex-shrink-0">vs</span>
              <span className="text-sm font-bold text-white truncate">
                {fixture.away_team_flag && <span className="mr-1">{fixture.away_team_flag}</span>}
                {fixture.away_team}
              </span>
            </div>
            <Badge variant={locked ? 'danger' : 'info'} className="flex-shrink-0">
              {locked ? 'Locked' : countdown}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
            <Clock className="w-3 h-3 flex-shrink-0" />
            {formatMatchDate(fixture.kickoff_time)}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [upcoming, setUpcoming] = useState<Fixture[]>([]);
  const [recentPredictions, setRecentPredictions] = useState<RecentPrediction[]>([]);
  const [rank, setRank] = useState<string>('—');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setFetchError(null);

    const [fixRes, predsRes, rankRes] = await Promise.all([
      supabase
        .from('fixtures')
        .select('*')
        .eq('status', 'upcoming')
        .order('kickoff_time', { ascending: true })
        .limit(6),
      // FIX: explicit user_id filter for correctness and performance
      supabase
        .from('predictions')
        .select('*, fixtures:fixture_id(home_team, away_team)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      // FIX: real rank — count profiles with strictly more points than current user
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('total_points', profile?.total_points ?? 0),
    ]);

    if (fixRes.error || predsRes.error || rankRes.error) {
      setFetchError('Failed to load dashboard data. Please refresh.');
      return;
    }

    if (fixRes.data) setUpcoming(fixRes.data);

    if (predsRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRecentPredictions(predsRes.data.map((p: any) => ({
        ...p,
        home_team: p.fixtures?.home_team || '',
        away_team: p.fixtures?.away_team || '',
      })));
    }

    // Rank = number of users with more points + 1
    const ahead = rankRes.count ?? 0;
    setRank(`#${ahead + 1}`);
  }, [user, profile?.total_points]);

  useEffect(() => {
    fetchData();
    refreshProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) return null;

  const accuracy = getPredictionAccuracy(profile.correct_winners, profile.total_predictions);

  const statCards = [
    { label: 'Total Points', value: profile.total_points, icon: Trophy, color: 'from-emerald-500 to-teal-500' },
    { label: 'Current Rank', value: rank, icon: TrendingUp, color: 'from-sky-500 to-blue-500' },
    { label: 'Accuracy', value: `${accuracy}%`, icon: Target, color: 'from-amber-500 to-orange-500' },
    { label: 'Correct Winners', value: profile.correct_winners, icon: Zap, color: 'from-purple-500 to-pink-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar fallback={profile.username} size="lg" src={profile.avatar_url || undefined} />
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome back, {profile.username}</h1>
          <p className="text-gray-400">World Cup 2026 Prediction Dashboard</p>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {fetchError}
          <button onClick={fetchData} className="ml-auto underline hover:no-underline text-red-300">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</span>
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center`}>
                    <s.icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />Upcoming Fixtures
            </h2>
            <Link to="/fixtures">
              <Button variant="ghost" size="sm">View All <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-gray-500">No upcoming fixtures</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {upcoming.map((f, i) => (
                <motion.div key={f.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <UpcomingFixtureRow fixture={f} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />Recent Predictions
          </h2>
          {recentPredictions.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-gray-500">No predictions yet. Start predicting!</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {recentPredictions.map((p) => (
                <Card key={p.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm min-w-0">
                        <span className="text-white font-medium truncate block">
                          {p.home_team} <span className="text-gray-500 font-normal">vs</span> {p.away_team}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold text-emerald-400">
                          {p.predicted_home_score} – {p.predicted_away_score}
                        </p>
                        {p.calculated && (
                          <Badge variant={p.points_earned > 0 ? 'success' : p.points_earned < 0 ? 'danger' : 'default'}>
                            {p.points_earned > 0 ? '+' : ''}{p.points_earned} pts
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 capitalize">Predicted: {p.predicted_winner}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
