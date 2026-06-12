import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Prediction, Profile } from '../types';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar } from '../components/ui/avatar';
import { getPredictionAccuracy } from '../lib/utils';
import { useAppToast } from '../components/layout/AppLayout';
import { motion } from 'framer-motion';
import { User, Save, Target, Zap, TrendingUp, Award, AlertCircle, Ban } from 'lucide-react';

export default function ProfilePage() {
  const { id } = useParams<{ id?: string }>();
  const { user, profile: myProfile, refreshProfile } = useAuth();
  const { showToast } = useAppToast();
  const [profileData, setProfileData] = useState<Profile | null>(null);
  const [predictions, setPredictions] = useState<(Prediction & { home_team: string; away_team: string })[]>([]);
  const [editingUsername, setEditingUsername] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isOwnProfile = !id || id === user?.id;
  const profileId = id || user?.id;

  const fetchProfile = useCallback(async () => {
    if (!profileId) return;
    setFetchError(null);
    const [profileRes, predsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
      (() => {
        // Own profile: show all predictions (including upcoming) so the user
        // can review their own future picks.
        // Other profiles: only completed fixtures — prevents seeing future predictions.
        const q = supabase
          .from('predictions')
          .select('*, fixtures!inner(home_team, away_team, status)')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false })
          .limit(50);
        return isOwnProfile ? q : q.eq('fixtures.status', 'completed');
      })(),
    ]);
    if (profileRes.error) { setFetchError('Failed to load profile.'); return; }
    if (profileRes.data) setProfileData(profileRes.data);
    if (predsRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPredictions(predsRes.data.map((p: any) => ({
        ...p,
        home_team: p.fixtures?.home_team || '',
        away_team: p.fixtures?.away_team || '',
        fixture_status: p.fixtures?.status || '',
      })));
    }
  }, [profileId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => {
    if (myProfile && isOwnProfile) setEditingUsername(myProfile.username);
  }, [myProfile, isOwnProfile]);

  if (fetchError) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
        <AlertCircle className="w-5 h-5" />{fetchError}
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const accuracy = getPredictionAccuracy(profileData.correct_winners, profileData.total_predictions);

  const handleSave = async () => {
    if (!user) return;
    const trimmed = editingUsername.trim();
    if (!trimmed) return;
    if (trimmed.length < 3 || trimmed.length > 20) { showToast('Username must be 3–20 characters.', 'error'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { showToast('Only letters, numbers, and underscores allowed.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ username: trimmed }).eq('id', user.id);
    if (error) { showToast(error.message, 'error'); }
    else { showToast('Username updated!', 'success'); await refreshProfile(); await fetchProfile(); setIsEditing(false); }
    setSaving(false);
  };

  const stats = [
    { label: 'Total Points', value: profileData.total_points, icon: TrendingUp },
    { label: 'Winners', value: profileData.correct_winners, icon: Target },
    { label: 'Exact Scores', value: profileData.correct_scores, icon: Zap },
    { label: 'Accuracy', value: `${accuracy}%`, icon: Award },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Avatar fallback={profileData.username} size="xl" src={profileData.avatar_url || undefined} />
              <div className="flex-1 text-center sm:text-left">
                {isOwnProfile && isEditing ? (
                  <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap">
                    <Input value={editingUsername} onChange={(e) => setEditingUsername(e.target.value)} className="max-w-[200px]" placeholder="Username" />
                    <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <h1 className="text-2xl font-bold text-white">{profileData.username}</h1>
                    {isOwnProfile && <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}><User className="w-3 h-3" /></Button>}
                  </div>
                )}
                <p className="text-gray-400 mt-1">{profileData.total_predictions} predictions made</p>
                {profileData.is_admin && <Badge variant="warning" className="mt-2">Admin</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="py-3 text-center">
                <s.icon className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-bold text-white mb-4">Prediction History</h2>
        {predictions.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-gray-500">No predictions yet</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {predictions.map((p) => {
              const isAbstain = p.predicted_winner === 'abstain';
              return (
                <Card key={p.id}>
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{p.home_team} vs {p.away_team}</p>
                      {isAbstain ? (
                        /* NEW: clear "Did not predict" label for ghost rows */
                        <div className="flex items-center gap-1 mt-0.5">
                          <Ban className="w-3 h-3 text-red-400 flex-shrink-0" />
                          <p className="text-xs text-red-400">Did not predict</p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Predicted: {p.predicted_home_score} – {p.predicted_away_score} ({p.predicted_winner})
                        </p>
                      )}
                    </div>
                    {p.calculated && (
                      <Badge variant={p.points_earned > 0 ? 'success' : p.points_earned < 0 ? 'danger' : 'default'} className="flex-shrink-0">
                        {p.points_earned > 0 ? '+' : ''}{p.points_earned} pts
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
