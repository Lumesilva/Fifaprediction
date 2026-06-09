import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Fixture, Prediction, CommunityStats } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Avatar } from '../components/ui/avatar';
import { formatMatchDate, isPredictionLocked } from '../lib/utils';
import { useCountdown } from '../hooks/useCountdown';
import { useAppToast } from '../components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Clock, MapPin, Users, ChevronLeft, Save, Lock, BarChart3, AlertCircle } from 'lucide-react';

interface PublicPrediction {
  predicted_winner: 'home' | 'draw' | 'away';
  username: string;
}

export default function FixtureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useAppToast();

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [myPrediction, setMyPrediction] = useState<Prediction | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStats>({
    home_pct: 0, draw_pct: 0, away_pct: 0, total_predictions: 0,
  });
  const [publicPredictions, setPublicPredictions] = useState<PublicPrediction[]>([]);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // FIX: live countdown via hook
  const countdown = useCountdown(fixture?.kickoff_time ?? '');

  const fetchData = useCallback(async () => {
    if (!id) return;
    setFetchError(null);

    const [fixRes, predRes] = await Promise.all([
      supabase.from('fixtures').select('*').eq('id', id).maybeSingle(),
      user
        ? supabase.from('predictions').select('*').eq('fixture_id', id).eq('user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (fixRes.error) { setFetchError('Failed to load fixture details.'); return; }
    if (fixRes.data) setFixture(fixRes.data);

    if (predRes.data) {
      setMyPrediction(predRes.data);
      setHomeScore(predRes.data.predicted_home_score);
      setAwayScore(predRes.data.predicted_away_score);
    }

    // Community stats — aggregate client-side from all predictions for this fixture
    const { data: allPreds } = await supabase
      .from('predictions')
      .select('predicted_winner, profiles!inner(username)')
      .eq('fixture_id', id);

    if (allPreds && allPreds.length > 0) {
      const total = allPreds.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = allPreds.filter((p: any) => p.predicted_winner === 'home').length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const draw = allPreds.filter((p: any) => p.predicted_winner === 'draw').length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = allPreds.filter((p: any) => p.predicted_winner === 'away').length;
      setCommunityStats({
        home_pct: Math.round((home / total) * 100),
        draw_pct: Math.round((draw / total) * 100),
        away_pct: Math.round((away / total) * 100),
        total_predictions: total,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPublicPredictions(allPreds.map((p: any) => ({
        predicted_winner: p.predicted_winner as 'home' | 'draw' | 'away',
        username: p.profiles?.username || 'Anonymous',
      })));
    }
  }, [id, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (fetchError) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertCircle className="w-5 h-5" />{fetchError}
        </div>
        <button onClick={fetchData} className="text-sm text-emerald-400 underline">Try again</button>
      </div>
    );
  }

  if (!fixture) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const locked = isPredictionLocked(fixture.kickoff_time);
  const getWinner = (h: number, a: number): 'home' | 'draw' | 'away' =>
    h > a ? 'home' : h < a ? 'away' : 'draw';

  /** FIX: clamp score to valid range 0–20 so keyboard input can't exceed max */
  const clampScore = (val: string) => Math.min(20, Math.max(0, parseInt(val) || 0));

  const handleSave = async () => {
    if (!user || !id || locked) return;
    setSaving(true);
    const winner = getWinner(homeScore, awayScore);
    let saveError: string | null = null;

    if (myPrediction) {
      const { error } = await supabase
        .from('predictions')
        .update({
          predicted_home_score: homeScore,
          predicted_away_score: awayScore,
          predicted_winner: winner,
        })
        .eq('id', myPrediction.id);
      saveError = error?.message ?? null;
    } else {
      const { error } = await supabase
        .from('predictions')
        .insert({
          user_id: user.id,
          fixture_id: id,
          predicted_home_score: homeScore,
          predicted_away_score: awayScore,
          predicted_winner: winner,
        });
      saveError = error?.message ?? null;
    }

    if (saveError) {
      // FIX: show error feedback via toast
      showToast(saveError, 'error');
    } else {
      // FIX: show success feedback via toast
      showToast(myPrediction ? 'Prediction updated!' : 'Prediction submitted!', 'success');
      await fetchData();
    }
    setSaving(false);
  };

  const maxPct = Math.max(communityStats.home_pct, communityStats.draw_pct, communityStats.away_pct);

  return (
    <div className="space-y-6">
      <Link to="/fixtures" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft className="w-4 h-4" />Back to Fixtures
      </Link>

      {/* Match header card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500/10 via-transparent to-teal-500/10 p-6">
            <div className="flex items-center justify-center gap-6 sm:gap-12">
              <div className="text-center flex-1">
                <div className="text-4xl mb-2">{fixture.home_team_flag}</div>
                <h2 className="text-xl font-bold text-white">{fixture.home_team}</h2>
                <p className="text-xs text-gray-400">{fixture.home_team_code}</p>
              </div>
              <div className="text-center flex-shrink-0">
                {(fixture.status === 'completed' || fixture.status === 'live') && fixture.home_score !== null
                  ? <div className="text-4xl font-mono font-black text-white">{fixture.home_score} – {fixture.away_score}</div>
                  : <div className="text-3xl font-bold text-gray-500">VS</div>}
                <Badge
                  variant={fixture.status === 'live' ? 'danger' : fixture.status === 'completed' ? 'default' : 'info'}
                  className="mt-2"
                >
                  {fixture.status === 'live' ? '🔴 LIVE'
                    : fixture.status === 'completed' ? 'Full Time'
                    : countdown}
                </Badge>
              </div>
              <div className="text-center flex-1">
                <div className="text-4xl mb-2">{fixture.away_team_flag}</div>
                <h2 className="text-xl font-bold text-white">{fixture.away_team}</h2>
                <p className="text-xs text-gray-400">{fixture.away_team_code}</p>
              </div>
            </div>
          </div>
          <CardContent className="flex flex-wrap items-center gap-4 text-sm text-gray-400 py-3">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />{formatMatchDate(fixture.kickoff_time)}
            </span>
            {fixture.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />{fixture.venue}, {fixture.city}
              </span>
            )}
            <Badge>{fixture.stage}</Badge>
            {fixture.group_name && <Badge variant="info">Group {fixture.group_name}</Badge>}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Prediction card */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {locked ? <Lock className="w-5 h-5 text-red-400" /> : <Save className="w-5 h-5 text-emerald-400" />}
                Your Prediction
                {locked && <Badge variant="danger">Locked</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {locked && !myPrediction ? (
                <p className="text-gray-500 text-sm">Kickoff has passed. You did not submit a prediction for this match.</p>
              ) : locked && myPrediction ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-center">
                    <span className="text-white font-medium">{fixture.home_team}</span>
                    <span className="text-3xl font-mono font-bold text-emerald-400 mx-4">
                      {myPrediction.predicted_home_score} – {myPrediction.predicted_away_score}
                    </span>
                    <span className="text-white font-medium">{fixture.away_team}</span>
                  </div>
                  <div className="text-center">
                    <Badge variant={myPrediction.predicted_winner === 'draw' ? 'warning' : 'success'}>
                      {myPrediction.predicted_winner === 'draw' ? 'Draw'
                        : myPrediction.predicted_winner === 'home'
                        ? `${fixture.home_team} Win` : `${fixture.away_team} Win`}
                    </Badge>
                  </div>
                  {myPrediction.calculated && (
                    <div className="text-center pt-2 border-t border-white/10">
                      <span className="text-sm text-gray-400">Points Earned: </span>
                      <span className={`font-bold text-xl ${
                        myPrediction.points_earned > 0 ? 'text-emerald-400'
                        : myPrediction.points_earned < 0 ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        {myPrediction.points_earned > 0 ? '+' : ''}{myPrediction.points_earned}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-white mb-2 truncate">{fixture.home_team}</p>
                      {/* FIX: value clamped on change to prevent inputs above 20 */}
                      <Input
                        type="number" min="0" max="20"
                        value={homeScore}
                        onChange={(e) => setHomeScore(clampScore(e.target.value))}
                        className="text-center text-xl font-bold"
                      />
                    </div>
                    <div className="text-center text-gray-500 font-bold text-lg">VS</div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white mb-2 truncate">{fixture.away_team}</p>
                      <Input
                        type="number" min="0" max="20"
                        value={awayScore}
                        onChange={(e) => setAwayScore(clampScore(e.target.value))}
                        className="text-center text-xl font-bold"
                      />
                    </div>
                  </div>

                  <div className="text-center space-y-1">
                    <Badge variant={getWinner(homeScore, awayScore) === 'draw' ? 'warning' : 'success'}>
                      {getWinner(homeScore, awayScore) === 'draw' ? 'Draw'
                        : getWinner(homeScore, awayScore) === 'home'
                        ? `${fixture.home_team} Win` : `${fixture.away_team} Win`}
                    </Badge>
                    {/* FIX: corrected scoring hint — matches actual SQL logic */}
                    <p className="text-xs text-gray-500">Correct winner: +2 pts · Exact score: +5 pts total</p>
                  </div>

                  <Button onClick={handleSave} className="w-full" disabled={saving || locked}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving…' : myPrediction ? 'Update Prediction' : 'Submit Prediction'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Community stats */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />Community Predictions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {communityStats.total_predictions === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No predictions yet. Be the first!</p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">{communityStats.total_predictions} predictions submitted</p>
                  {[
                    { label: `${fixture.home_team} Win`, pct: communityStats.home_pct, key: 'home' },
                    { label: 'Draw', pct: communityStats.draw_pct, key: 'draw' },
                    { label: `${fixture.away_team} Win`, pct: communityStats.away_pct, key: 'away' },
                  ].map(item => (
                    <div key={item.key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-300">{item.label}</span>
                        <span className={`font-bold ${item.pct === maxPct ? 'text-emerald-400' : 'text-gray-400'}`}>
                          {item.pct}%
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${item.pct === maxPct ? 'bg-emerald-500' : 'bg-gray-600'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${item.pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-sky-400" />Prediction Feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              {publicPredictions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-2">No public predictions yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {publicPredictions.map((pred, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2">
                        <Avatar fallback={pred.username} size="sm" />
                        <span className="text-sm text-white">{pred.username}</span>
                      </div>
                      <Badge variant={pred.predicted_winner === 'draw' ? 'warning' : pred.predicted_winner === 'home' ? 'success' : 'info'}>
                        {pred.predicted_winner === 'draw' ? 'Draw'
                          : pred.predicted_winner === 'home' ? fixture.home_team
                          : fixture.away_team}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
