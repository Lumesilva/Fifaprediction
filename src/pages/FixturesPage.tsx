import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Fixture } from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { formatMatchDate, isPredictionLocked, STAGES } from '../lib/utils';
import { useCountdown } from '../hooks/useCountdown';
import { motion } from 'framer-motion';
import { Calendar, Clock, AlertCircle } from 'lucide-react';

/** Isolated row so each countdown ticks independently. */
function FixtureRow({ fixture, index }: { fixture: Fixture; index: number }) {
  const locked = isPredictionLocked(fixture.kickoff_time);
  const isLive = fixture.status === 'live';
  const isCompleted = fixture.status === 'completed';
  // FIX: live ticking countdown via hook
  const countdown = useCountdown(fixture.kickoff_time);

  return (
    // FIX: cap animation delay so items beyond ~10 don't wait seconds
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
    >
      <Link to={`/fixtures/${fixture.id}`}>
        <Card className="hover:border-emerald-500/30 transition-all cursor-pointer">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={isLive ? 'danger' : isCompleted ? 'default' : 'info'}>
                {isLive ? 'LIVE' : isCompleted ? 'FT' : fixture.stage}
              </Badge>
              {fixture.group_name && (
                <span className="text-xs text-gray-500">Group {fixture.group_name}</span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {fixture.home_team_flag && <span className="text-xl flex-shrink-0">{fixture.home_team_flag}</span>}
                  <span className="font-bold text-white truncate">{fixture.home_team}</span>
                </div>
                <div className="flex-shrink-0 text-center w-20">
                  {isCompleted || isLive
                    ? <span className="text-lg font-mono font-bold text-white">{fixture.home_score} – {fixture.away_score}</span>
                    : <span className="text-sm text-gray-500">vs</span>}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                  <span className="font-bold text-white truncate text-right">{fixture.away_team}</span>
                  {fixture.away_team_flag && <span className="text-xl flex-shrink-0">{fixture.away_team_flag}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />{formatMatchDate(fixture.kickoff_time)}
              </span>
              {fixture.venue && <span>{fixture.venue}, {fixture.city}</span>}
              {!isCompleted && !isLive && (
                <Badge variant={locked ? 'danger' : 'success'}>
                  {locked ? 'Locked' : countdown}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export default function FixturesPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchFixtures = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from('fixtures').select('*').order('kickoff_time', { ascending: true });
    if (stageFilter !== 'all') q = q.eq('stage', stageFilter);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) {
      setFetchError('Failed to load fixtures. Please try again.');
    } else if (data) {
      setFixtures(data);
    }
    setLoading(false);
  }, [stageFilter, statusFilter]);

  useEffect(() => { fetchFixtures(); }, [fetchFixtures]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Fixtures</h1>
        <p className="text-gray-400 mt-1">World Cup 2026 schedule and results</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Select
            options={[{ value: 'all', label: 'All Stages' }, ...STAGES.map(s => ({ value: s, label: s }))]}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <Select
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'live', label: 'Live' },
              { value: 'completed', label: 'Completed' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Error state with retry */}
      {fetchError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {fetchError}
          <button onClick={fetchFixtures} className="ml-auto underline hover:no-underline text-red-300">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : fixtures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
            No fixtures found for selected filters
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {fixtures.map((f, i) => <FixtureRow key={f.id} fixture={f} index={i} />)}
        </div>
      )}
    </div>
  );
}
