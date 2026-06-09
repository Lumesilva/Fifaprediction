import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry, Profile } from '../types';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { getPredictionAccuracy } from '../lib/utils';
import { motion } from 'framer-motion';
import { Trophy, Medal, Search, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 20;

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // FIX: debounce search so we don't fire a query on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLeaderboard = useCallback(async (searchTerm: string, currentPage: number) => {
    setLoading(true);
    setFetchError(null);
    const q = searchTerm
      ? supabase.from('profiles').select('*', { count: 'exact' }).ilike('username', `%${searchTerm}%`).order('total_points', { ascending: false }).range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)
      : supabase.from('profiles').select('*', { count: 'exact' }).order('total_points', { ascending: false }).range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      setFetchError('Failed to load leaderboard. Please try again.');
    } else if (data) {
      setEntries(data.map((p: Profile, i: number) => ({
        rank: currentPage * PAGE_SIZE + i + 1,
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url,
        total_points: p.total_points,
        correct_winners: p.correct_winners,
        correct_scores: p.correct_scores,
        total_predictions: p.total_predictions,
        accuracy: getPredictionAccuracy(p.correct_winners, p.total_predictions),
      })));
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => { fetchLeaderboard(search, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX: debounced search — wait 300ms after last keystroke before querying
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLeaderboard(value, 0), 300);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center">
        <Trophy className="w-4 h-4 text-black" />
      </div>
    );
    if (rank === 2) return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center">
        <Medal className="w-4 h-4 text-black" />
      </div>
    );
    if (rank === 3) return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center">
        <Medal className="w-4 h-4 text-white" />
      </div>
    );
    return (
      <span className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-400">
        {rank}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Global Leaderboard</h1>
        <p className="text-gray-400 mt-1">See how you rank against other predictors</p>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {fetchError}
          <button onClick={() => fetchLeaderboard(search, page)} className="ml-auto underline text-red-300">Retry</button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            {/* FIX: debounced via handleSearchChange */}
            <Input
              placeholder="Search usernames…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <span className="text-sm text-gray-500">{totalCount} players</span>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No players found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left w-12">Rank</th>
                    <th className="px-4 py-3 text-left">Player</th>
                    <th className="px-4 py-3 text-center">Points</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell">Winners</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell">Scores</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">{getRankBadge(e.rank)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/profile/${e.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                          <Avatar fallback={e.username} size="sm" src={e.avatar_url || undefined} />
                          <span className="font-medium text-white">{e.username}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-emerald-400">{e.total_points}</span>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-gray-300">{e.correct_winners}</span>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-gray-300">{e.correct_scores}</span>
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <Badge variant={e.accuracy >= 70 ? 'success' : e.accuracy >= 40 ? 'warning' : 'default'}>
                          {e.accuracy}%
                        </Badge>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                <ChevronLeft className="w-4 h-4 mr-1" />Previous
              </Button>
              <span className="text-sm text-gray-400">Page {page + 1} of {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next<ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
