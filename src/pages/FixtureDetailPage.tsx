import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Fixture, Prediction, CommunityStats } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Avatar } from '../components/ui/avatar';
import { formatMatchDate, isPredictionLocked, isKnockoutStage } from '../lib/utils';
import { useCountdown } from '../hooks/useCountdown';
import { useAppToast } from '../components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, MapPin, Users, ChevronLeft, Save, Lock,
  BarChart3, AlertCircle, Ban, Zap, Shield,
} from 'lucide-react';

interface PublicPrediction {
  predicted_winner: 'home' | 'draw' | 'away' | 'abstain';
  predicted_penalty_winner: 'home' | 'away' | null;
  wildcard_used: boolean;
  username: string;
}

/** Wildcard toggle button */
function WildcardToggle({
  active, remaining, locked, onToggle,
}: { active: boolean; remaining: number; locked: boolean; onToggle: () => void }) {
  const canActivate = remaining > 0 || active;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked || !canActivate}
      className={[
        'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200 text-sm font-medium',
        active
          ? 'border-amber-400 bg-amber-400/10 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
          : canActivate
          ? 'border-gray-600 bg-gray-800/50 text-gray-300 hover:border-amber-400/50 hover:text-amber-300'
          : 'border-gray-700 bg-gray-800/30 text-gray-600 cursor-not-allowed',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">🃏</span>
        <div className="text-left">
          <p className="font-semibold">{active ? 'Wildcard Active!' : 'Use Wildcard'}</p>
          <p className="text-xs opacity-70">
            {active ? 'Correct: ×2 pts · Wrong: −3 pts'
              : remaining === 0 ? 'No wildcards left'
              : `${remaining} wildcard${remaining !== 1 ? 's' : ''} remaining`}
          </p>
        </div>
      </div>
      <div className={['w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
        active ? 'bg-amber-400 border-amber-400' : 'border-gray-500'].join(' ')}>
        {active && <Zap className="w-3 h-3 text-black" />}
      </div>
    </button>
  );
}

/** Penalty winner selector shown only for knockout draws */
function PenaltyWinnerSelector({
  homeTeam, awayTeam, homeFlag, awayFlag,
  value, onChange, locked,
}: {
  homeTeam: string; awayTeam: string;
  homeFlag: string; awayFlag: string;
  value: 'home' | 'away' | null;
  onChange: (v: 'home' | 'away') => void;
  locked: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-sky-400 flex-shrink-0" />
        <p className="text-sm font-semibold text-white">Who wins on penalties?</p>
      </div>
      <p className="text-xs text-gray-500">Your score predicts a draw after 120 mins — pick the penalty winner.</p>
      <div className="grid grid-cols-2 gap-3">
        {(['home', 'away'] as const).map(side => {
          const team = side === 'home' ? homeTeam : awayTeam;
          const flag = side === 'home' ? homeFlag : awayFlag;
          const selected = value === side;
          return (
            <button
              key={side}
              type="button"
              disabled={locked}
              onClick={() => onChange(side)}
              className={[
                'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-sm font-medium',
                selected
                  ? 'border-sky-400 bg-sky-400/10 text-sky-300'
                  : 'border-gray-600 bg-gray-800/50 text-gray-300 hover:border-sky-400/50',
                locked ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <span className="text-2xl">{flag}</span>
              <span className="truncate w-full text-center text-xs">{team}</span>
              {selected && <Badge variant="info" className="text-xs">Penalty Win</Badge>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FixtureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useAppToast();

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [myPrediction, setMyPrediction] = useState<Prediction | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStats>({
    home_pct: 0, draw_pct: 0, away_pct: 0, total_predictions: 0,
  });
  const [publicPredictions, setPublicPredictions] = useState<PublicPrediction[]>([]);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [penaltyWinner, setPenaltyWinner] = useState<'home' | 'away' | null>(null);
  const [wildcardActive, setWildcardActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const countdown = useCountdown(fixture?.kickoff_time ?? '');
  const wildcardsRemaining = profile?.wildcards_remaining ?? 0;

  // Derived state
  const isKnockout = fixture ? isKnockoutStage(fixture.stage) : false;
  const predicted120minDraw = homeScore === awayScore;
  // Penalty picker is shown for knockout matches where user predicts a draw
  const showPenaltyPicker = isKnockout && predicted120minDraw;

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
      if (predRes.data.predicted_winner !== 'abstain') {
        setHomeScore(predRes.data.predicted_home_score);
        setAwayScore(predRes.data.predicted_away_score);
        setPenaltyWinner(predRes.data.predicted_penalty_winner);
        setWildcardActive(predRes.data.wildcard_used);
      }
    }

    const { data: allPreds } = await supabase
      .from('predictions')
      .select('predicted_winner, predicted_penalty_winner, wildcard_used, profiles!inner(username)')
      .eq('fixture_id', id);

    if (allPreds && allPreds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const real = allPreds.filter((p: any) => p.predicted_winner !== 'abstain');
      const total = real.length;
      if (total > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const home = real.filter((p: any) => p.predicted_winner === 'home').length;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draw = real.filter((p: any) => p.predicted_winner === 'draw').length;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const away = real.filter((p: any) => p.predicted_winner === 'away').length;
        setCommunityStats({
          home_pct: Math.round((home / total) * 100),
          draw_pct: Math.round((draw / total) * 100),
          away_pct: Math.round((away / total) * 100),
          total_predictions: total,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPublicPredictions(allPreds.map((p: any) => ({
        predicted_winner: p.predicted_winner,
        predicted_penalty_winner: p.predicted_penalty_winner ?? null,
        wildcard_used: p.wildcard_used ?? false,
        username: p.profiles?.username || 'Anonymous',
      })));
    }
  }, [id, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clear penalty winner when score is no longer a draw (knockout)
  useEffect(() => {
    if (isKnockout && !predicted120minDraw) setPenaltyWinner(null);
  }, [isKnockout, predicted120minDraw]);

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
  const isAbstain = myPrediction?.predicted_winner === 'abstain';

  const clampScore = (val: string) => Math.min(20, Math.max(0, parseInt(val) || 0));

  const getWinner120 = (h: number, a: number): 'home' | 'draw' | 'away' =>
    h > a ? 'home' : h < a ? 'away' : 'draw';

  /** Derive who user predicts to advance (for display) */
  const predictedAdvancing = (): string => {
    const w90 = getWinner120(homeScore, awayScore);
    if (w90 === 'home') return fixture.home_team;
    if (w90 === 'away') return fixture.away_team;
    if (penaltyWinner === 'home') return `${fixture.home_team} (pens)`;
    if (penaltyWinner === 'away') return `${fixture.away_team} (pens)`;
    return '—';
  };

  /** Scoring hint — differs by whether user picked draw or direct win in knockout */
  const scoringHint = (): React.ReactNode => {
    if (!isKnockout) {
      // Group stage
      if (wildcardActive) {
        return (
          <span>🃏 Wildcard · Correct winner: <strong>+4 pts</strong> · Exact score: <strong>+10 pts</strong> · Wrong: <strong>−3 pts</strong></span>
        );
      }
      return (
        <span>Correct winner: <strong>+2 pts</strong> · Exact score: <strong>+5 pts</strong></span>
      );
    }

    // Knockout — draw path
    if (predicted120minDraw) {
      if (wildcardActive) {
        return (
          <span>🃏 Exact score + correct pens: <strong>+10 pts</strong> · Wrong score + correct pens: <strong>+6 pts</strong> · Wrong pens: <strong>+4 pts</strong> · Not a draw: <strong>−3 pts</strong></span>
        );
      }
      return (
        <span>Exact score + correct pens: <strong>+5 pts</strong> · Wrong score + correct pens: <strong>+3 pts</strong> · Wrong pens: <strong>+2 pts</strong> · Not a draw: <strong>−1 pt</strong> (or 0)</span>
      );
    }

    // Knockout — direct win path
    if (wildcardActive) {
      return (
        <span>🃏 Exact score: <strong>+10 pts</strong> · Correct team wins 120 min: <strong>+4 pts</strong> · Goes to pens or wrong team: <strong>−3 pts</strong></span>
      );
    }
    return (
      <span>Exact score: <strong>+5 pts</strong> · Correct team wins in 120 min: <strong>+2 pts</strong> · Goes to pens or wrong team: <strong>−1 pt</strong> (or 0)</span>
    );
  };

  const handleWildcardToggle = () => { if (!locked) setWildcardActive(p => !p); };

  const handleSave = async () => {
    if (!user || !id || locked) return;

    // Validation: knockout draw requires penalty winner
    if (isKnockout && predicted120minDraw && !penaltyWinner) {
      showToast('Please select a penalty winner for this knockout match.', 'error');
      return;
    }

    setSaving(true);
    const winner120 = getWinner120(homeScore, awayScore);
    const previouslyUsedWildcard = myPrediction?.wildcard_used ?? false;
    const wildcardChanging = wildcardActive !== previouslyUsedWildcard;
    const wildcardDelta = wildcardChanging ? (wildcardActive ? -1 : 1) : 0;

    if (wildcardDelta === -1 && wildcardsRemaining <= 0) {
      showToast('No wildcards remaining!', 'error');
      setSaving(false);
      return;
    }

    const payload = {
      predicted_home_score: homeScore,
      predicted_away_score: awayScore,
      predicted_winner: winner120,
      // Only store penalty winner for knockout draws, null otherwise
      predicted_penalty_winner: (isKnockout && winner120 === 'draw') ? penaltyWinner : null,
      wildcard_used: wildcardActive,
    };

    let saveError: string | null = null;
    if (myPrediction && !isAbstain) {
      const { error } = await supabase.from('predictions').update(payload).eq('id', myPrediction.id);
      saveError = error?.message ?? null;
    } else {
      const { error } = await supabase.from('predictions').insert({ user_id: user.id, fixture_id: id, ...payload });
      saveError = error?.message ?? null;
    }

    if (saveError) { showToast(saveError, 'error'); setSaving(false); return; }

    if (wildcardDelta !== 0) {
      await supabase.from('profiles').update({ wildcards_remaining: wildcardsRemaining + wildcardDelta }).eq('id', user.id);
      await refreshProfile();
    }

    showToast(
      myPrediction && !isAbstain
        ? wildcardActive ? '🃏 Wildcard prediction updated!' : 'Prediction updated!'
        : wildcardActive ? '🃏 Wildcard applied!' : 'Prediction submitted!',
      'success',
    );
    await fetchData();
    setSaving(false);
  };

  const maxPct = Math.max(communityStats.home_pct, communityStats.draw_pct, communityStats.away_pct);

  /** Format a public prediction label for the feed */
  const feedLabel = (pred: PublicPrediction) => {
    if (pred.predicted_winner === 'abstain') return null;
    if (pred.predicted_winner === 'draw' && pred.predicted_penalty_winner) {
      const penTeam = pred.predicted_penalty_winner === 'home' ? fixture.home_team : fixture.away_team;
      return `Draw · ${penTeam} pens`;
    }
    if (pred.predicted_winner === 'home') return `${fixture.home_team} Win`;
    if (pred.predicted_winner === 'away') return `${fixture.away_team} Win`;
    return 'Draw';
  };

  return (
    <div className="space-y-6">
      <Link to="/fixtures" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft className="w-4 h-4" />Back to Fixtures
      </Link>

      {/* Match header */}
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
                  ? (
                    <div>
                      <div className="text-4xl font-mono font-black text-white">{fixture.home_score} – {fixture.away_score}</div>
                      {fixture.penalty_winner && (
                        <p className="text-xs text-sky-400 mt-1">
                          {fixture.penalty_winner === 'home' ? fixture.home_team : fixture.away_team} wins on penalties
                        </p>
                      )}
                    </div>
                  )
                  : <div className="text-3xl font-bold text-gray-500">VS</div>}
                <Badge
                  variant={fixture.status === 'live' ? 'danger' : fixture.status === 'completed' ? 'default' : 'info'}
                  className="mt-2"
                >
                  {fixture.status === 'live' ? '🔴 LIVE' : fixture.status === 'completed' ? 'Full Time' : countdown}
                </Badge>
                {isKnockout && <Badge variant="warning" className="mt-1">Knockout</Badge>}
              </div>
              <div className="text-center flex-1">
                <div className="text-4xl mb-2">{fixture.away_team_flag}</div>
                <h2 className="text-xl font-bold text-white">{fixture.away_team}</h2>
                <p className="text-xs text-gray-400">{fixture.away_team_code}</p>
              </div>
            </div>
          </div>
          <CardContent className="flex flex-wrap items-center gap-4 text-sm text-gray-400 py-3">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatMatchDate(fixture.kickoff_time)}</span>
            {fixture.venue && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{fixture.venue}, {fixture.city}</span>}
            <Badge>{fixture.stage}</Badge>
            {fixture.group_name && <Badge variant="info">Group {fixture.group_name}</Badge>}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Prediction card */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <Card className={wildcardActive && !locked ? 'border-amber-400/40 shadow-[0_0_30px_rgba(251,191,36,0.08)]' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {locked ? <Lock className="w-5 h-5 text-red-400" /> : <Save className="w-5 h-5 text-emerald-400" />}
                Your Prediction
                {locked && <Badge variant="danger">Locked</Badge>}
                {myPrediction?.wildcard_used && <span className="text-base">🃏</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Did not predict */}
              {locked && (!myPrediction || isAbstain) ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                    <Ban className="w-6 h-6 text-red-400" />
                  </div>
                  <p className="text-white font-medium">Did not predict</p>
                  <p className="text-xs text-gray-500 text-center">You did not submit a prediction before kickoff.</p>
                  {isAbstain && myPrediction?.calculated && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                      <span className="text-sm text-gray-400">Points:</span>
                      <span className="font-bold text-red-400">{myPrediction.points_earned} pt</span>
                    </div>
                  )}
                </div>

              ) : locked && myPrediction && !isAbstain ? (
                /* Locked submitted prediction */
                <div className="space-y-3">
                  {myPrediction.wildcard_used && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-sm">
                      <span className="text-lg">🃏</span>
                      <span className="font-medium">Wildcard was applied</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{fixture.home_team}</span>
                    <span className="text-3xl font-mono font-bold text-emerald-400 mx-4">
                      {myPrediction.predicted_home_score} – {myPrediction.predicted_away_score}
                    </span>
                    <span className="text-white font-medium">{fixture.away_team}</span>
                  </div>
                  {myPrediction.predicted_winner === 'draw' && myPrediction.predicted_penalty_winner && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs">
                      <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                      Penalty winner predicted:&nbsp;
                      <strong>
                        {myPrediction.predicted_penalty_winner === 'home' ? fixture.home_team : fixture.away_team}
                      </strong>
                    </div>
                  )}
                  {myPrediction.calculated && (
                    <div className="text-center pt-2 border-t border-white/10">
                      <span className="text-sm text-gray-400">Points Earned: </span>
                      <span className={`font-bold text-xl ${myPrediction.points_earned > 0 ? 'text-emerald-400' : myPrediction.points_earned < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {myPrediction.points_earned > 0 ? '+' : ''}{myPrediction.points_earned}
                      </span>
                      {myPrediction.wildcard_used && <span className="ml-2 text-xs text-amber-400">(wildcard)</span>}
                    </div>
                  )}
                </div>

              ) : (
                /* Open prediction form */
                <>
                  {/* Knockout scoring rules card */}
                  {isKnockout && (
                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 border-b border-sky-500/20">
                        <Shield className="w-4 h-4 text-sky-400 flex-shrink-0" />
                        <p className="text-xs font-semibold text-sky-300">Knockout Match — How Scoring Works</p>
                      </div>
                      <div className="p-3 space-y-3 text-xs">

                        {/* Path 1 — direct win */}
                        <div className="space-y-1">
                          <p className="text-gray-300 font-medium">If you predict a direct win (e.g. Argentina 2–1):</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                            <span className="text-gray-400">Exact score, team wins 120 min</span>
                            <span className="text-emerald-400 font-bold">+5 pts</span>
                            <span className="text-gray-400">Wrong score, team wins 120 min</span>
                            <span className="text-emerald-400 font-bold">+2 pts</span>
                            <span className="text-gray-400">Game goes to penalties</span>
                            <span className="text-red-400 font-bold">−1 pt (or 0)</span>
                            <span className="text-gray-400">Wrong team wins</span>
                            <span className="text-red-400 font-bold">−1 pt (or 0)</span>
                          </div>
                        </div>

                        <div className="border-t border-sky-500/20" />

                        {/* Path 2 — draw + penalty picker */}
                        <div className="space-y-1">
                          <p className="text-gray-300 font-medium">If you predict a draw (any score) + pick penalty winner:</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                            <span className="text-gray-400">Exact draw score + correct pens</span>
                            <span className="text-emerald-400 font-bold">+5 pts</span>
                            <span className="text-gray-400">Wrong draw score + correct pens</span>
                            <span className="text-sky-400 font-bold">+3 pts</span>
                            <span className="text-gray-400">Any draw score + wrong pens</span>
                            <span className="text-amber-400 font-bold">+2 pts</span>
                            <span className="text-gray-400">Game NOT a draw (direct win)</span>
                            <span className="text-red-400 font-bold">−1 pt (or 0)</span>
                          </div>
                        </div>

                        {wildcardActive && (
                          <>
                            <div className="border-t border-amber-400/20" />
                            <div className="space-y-1">
                              <p className="text-amber-300 font-medium">🃏 Wildcard multiplier active:</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
                                <span className="text-gray-400">5 pts →</span><span className="text-amber-300 font-bold">10 pts</span>
                                <span className="text-gray-400">3 pts →</span><span className="text-amber-300 font-bold">6 pts</span>
                                <span className="text-gray-400">2 pts →</span><span className="text-amber-300 font-bold">4 pts</span>
                                <span className="text-gray-400">0 / −1 pts →</span><span className="text-red-400 font-bold">−3 pts</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-white mb-2 truncate">{fixture.home_team}</p>
                      <Input type="number" min="0" max="20" value={homeScore}
                        onChange={(e) => setHomeScore(clampScore(e.target.value))}
                        className="text-center text-xl font-bold" />
                    </div>
                    <div className="text-center text-gray-500 font-bold text-lg">
                      {isKnockout ? "120'" : 'VS'}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white mb-2 truncate">{fixture.away_team}</p>
                      <Input type="number" min="0" max="20" value={awayScore}
                        onChange={(e) => setAwayScore(clampScore(e.target.value))}
                        className="text-center text-xl font-bold" />
                    </div>
                  </div>

                  {/* Penalty winner picker — only for knockout draws */}
                  <AnimatePresence>
                    {showPenaltyPicker && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <PenaltyWinnerSelector
                          homeTeam={fixture.home_team} awayTeam={fixture.away_team}
                          homeFlag={fixture.home_team_flag} awayFlag={fixture.away_team_flag}
                          value={penaltyWinner} onChange={setPenaltyWinner} locked={locked}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Advancing summary + dynamic scoring hint */}
                  <div className="text-center space-y-1">
                    {isKnockout ? (
                      <p className="text-sm text-gray-300">
                        {predicted120minDraw
                          ? <>Draw → Pens: <strong className="text-white">{predictedAdvancing()}</strong></>
                          : <>Advancing: <strong className="text-white">{predictedAdvancing()}</strong></>}
                      </p>
                    ) : (
                      <Badge variant={getWinner120(homeScore, awayScore) === 'draw' ? 'warning' : 'success'}>
                        {getWinner120(homeScore, awayScore) === 'draw' ? 'Draw'
                          : getWinner120(homeScore, awayScore) === 'home' ? `${fixture.home_team} Win` : `${fixture.away_team} Win`}
                      </Badge>
                    )}
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={`${wildcardActive}-${predicted120minDraw}-${isKnockout}`}
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                        className={`text-xs ${wildcardActive ? 'text-amber-400 font-medium' : 'text-gray-500'}`}
                      >
                        {scoringHint()}
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  <WildcardToggle
                    active={wildcardActive} remaining={wildcardsRemaining}
                    locked={locked} onToggle={handleWildcardToggle}
                  />

                  <Button onClick={handleSave} className="w-full" disabled={saving || locked}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving…' : myPrediction && !isAbstain ? 'Update Prediction' : 'Submit Prediction'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Community stats + feed */}
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
                    { label: `${fixture.home_team} ${isKnockout ? 'Advance' : 'Win'}`, pct: communityStats.home_pct, key: 'home' },
                    { label: 'Draw', pct: communityStats.draw_pct, key: 'draw' },
                    { label: `${fixture.away_team} ${isKnockout ? 'Advance' : 'Win'}`, pct: communityStats.away_pct, key: 'away' },
                  ].map(item => (
                    <div key={item.key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-300">{item.label}</span>
                        <span className={`font-bold ${item.pct === maxPct ? 'text-emerald-400' : 'text-gray-400'}`}>{item.pct}%</span>
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
                <p className="text-gray-500 text-sm text-center py-2">No predictions yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {publicPredictions.map((pred, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar fallback={pred.username} size="sm" />
                        <span className="text-sm text-white truncate">{pred.username}</span>
                        {pred.wildcard_used && <span className="text-sm flex-shrink-0" title="Wildcard">🃏</span>}
                      </div>
                      {pred.predicted_winner === 'abstain' ? (
                        <Badge variant="danger">Did not predict</Badge>
                      ) : (
                        <Badge variant={
                          pred.predicted_winner === 'draw' ? 'warning'
                          : pred.predicted_winner === 'home' ? 'success' : 'info'
                        }>
                          {feedLabel(pred)}
                        </Badge>
                      )}
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
