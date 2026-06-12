import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Fixture, Profile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Avatar } from '../components/ui/avatar';
import { STAGES, GROUPS, istInputToUtcIso, utcIsoToIstInput } from '../lib/utils';
import { useAppToast } from '../components/layout/AppLayout';
import {
  Shield, Plus, Trash2, Users, BarChart3, Award,
  CheckCircle, Pencil, X, Settings, ToggleLeft, ToggleRight, AlertCircle,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';

type Tab = 'fixtures' | 'results' | 'users' | 'stats' | 'settings';

/** Reusable toggle row for settings panel. */
function SettingToggle({
  title,
  description,
  chips,
  enabled,
  saving,
  onToggle,
}: {
  title: string;
  description: string;
  chips: { label: string; active: boolean }[];
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700">
      <div className="space-y-1 flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
        <div className="flex gap-2 mt-2 flex-wrap">
          {chips.map(c => (
            <span
              key={c.label}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                c.active ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={saving}
        className="flex-shrink-0 transition-opacity disabled:opacity-50"
        aria-label={`Toggle ${title}`}
      >
        {enabled
          ? <ToggleRight className="w-12 h-12 text-emerald-400" />
          : <ToggleLeft className="w-12 h-12 text-gray-500" />}
      </button>
    </div>
  );
}

/** Confirmation modal for destructive actions. */
function ConfirmModal({
  message, onConfirm, onCancel,
}: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-200">{message}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="danger" onClick={onConfirm} className="flex-1">Delete</Button>
          <Button variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { profile } = useAuth();
  const { showToast } = useAppToast();
  const [tab, setTab] = useState<Tab>('fixtures');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [newFixture, setNewFixture] = useState({
    home_team: '', away_team: '', home_team_code: '', away_team_code: '',
    home_team_flag: '', away_team_flag: '', kickoff_time: '',
    stage: 'Group Stage', group_name: 'A', venue: '', city: '', match_number: 1,
  });
  const [resultFixtureId, setResultFixtureId] = useState('');
  const [resultHomeScore, setResultHomeScore] = useState(0);
  const [resultAwayScore, setResultAwayScore] = useState(0);
  const [savingFixture, setSavingFixture] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [editingFixture, setEditingFixture] = useState<Fixture | null>(null);
  const [editForm, setEditForm] = useState({
    home_team: '', away_team: '', home_team_code: '', away_team_code: '',
    home_team_flag: '', away_team_flag: '', kickoff_time: '',
    stage: 'Group Stage', group_name: 'A', venue: '', city: '',
    match_number: 1, status: 'upcoming' as Fixture['status'],
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [negativePoints, setNegativePoints] = useState(false);
  // NEW: no-prediction penalty toggle
  const [noPredictPenalty, setNoPredictPenalty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const [fixRes, usersRes, settingsRes] = await Promise.all([
      supabase.from('fixtures').select('*').order('kickoff_time', { ascending: true }),
      supabase.from('profiles').select('*').order('total_points', { ascending: false }),
      // NEW: also fetch no_prediction_penalty_enabled
      supabase
        .from('app_settings')
        .select('negative_points_enabled, no_prediction_penalty_enabled')
        .eq('id', 1)
        .maybeSingle(),
    ]);
    if (fixRes.error || usersRes.error) {
      setFetchError('Failed to load admin data. Please refresh.');
    }
    if (fixRes.data) setFixtures(fixRes.data);
    if (usersRes.data) setUsers(usersRes.data);
    if (settingsRes.data) {
      setNegativePoints(settingsRes.data.negative_points_enabled);
      setNoPredictPenalty(settingsRes.data.no_prediction_penalty_enabled ?? false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateFixture = async () => {
    if (!newFixture.home_team || !newFixture.away_team || !newFixture.kickoff_time) return;
    setSavingFixture(true);
    const { error } = await supabase.from('fixtures').insert({
      ...newFixture,
      kickoff_time: istInputToUtcIso(newFixture.kickoff_time),
      status: 'upcoming',
      result_entered: false,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Fixture created!', 'success');
      setNewFixture({
        home_team: '', away_team: '', home_team_code: '', away_team_code: '',
        home_team_flag: '', away_team_flag: '', kickoff_time: '',
        stage: 'Group Stage', group_name: 'A', venue: '', city: '', match_number: 1,
      });
      await fetchData();
    }
    setSavingFixture(false);
  };

  const handleDeleteFixture = async (fid: string) => {
    const { error } = await supabase.from('fixtures').delete().eq('id', fid);
    if (error) showToast(error.message, 'error');
    else showToast('Fixture deleted.', 'info');
    setConfirmDeleteId(null);
    await fetchData();
  };

  const handleEnterResult = async () => {
    if (!resultFixtureId) return;
    setSavingResult(true);
    const { error: updateErr } = await supabase.from('fixtures').update({
      home_score: resultHomeScore,
      away_score: resultAwayScore,
      result_entered: true,
      status: 'completed',
    }).eq('id', resultFixtureId);

    if (updateErr) {
      showToast(updateErr.message, 'error');
      setSavingResult(false);
      return;
    }

    const { error: rpcErr } = await supabase.rpc('calculate_fixture_points', { p_fixture_id: resultFixtureId });
    if (rpcErr) showToast(rpcErr.message, 'error');
    else showToast('Result saved and points calculated!', 'success');

    setResultFixtureId(''); setResultHomeScore(0); setResultAwayScore(0);
    await fetchData();
    setSavingResult(false);
  };

  const handleToggleAdmin = async (userId: string, isAdmin: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_admin: !isAdmin }).eq('id', userId);
    if (error) showToast(error.message, 'error');
    else showToast(isAdmin ? 'Admin removed.' : 'Admin granted.', 'success');
    await fetchData();
  };

  const openEdit = (f: Fixture) => {
    setEditForm({
      home_team: f.home_team, away_team: f.away_team,
      home_team_code: f.home_team_code, away_team_code: f.away_team_code,
      home_team_flag: f.home_team_flag, away_team_flag: f.away_team_flag,
      kickoff_time: utcIsoToIstInput(f.kickoff_time),
      stage: f.stage, group_name: f.group_name,
      venue: f.venue, city: f.city,
      match_number: f.match_number, status: f.status,
    });
    setEditingFixture(f);
  };

  const handleSaveEdit = async () => {
    if (!editingFixture) return;
    setSavingEdit(true);
    const { error } = await supabase.from('fixtures').update({
      ...editForm,
      kickoff_time: istInputToUtcIso(editForm.kickoff_time),
    }).eq('id', editingFixture.id);
    if (error) showToast(error.message, 'error');
    else showToast('Fixture updated!', 'success');
    setEditingFixture(null);
    await fetchData();
    setSavingEdit(false);
  };

  /** Generic helper to flip a boolean column in app_settings row 1. */
  const handleToggleSetting = async (
    column: 'negative_points_enabled' | 'no_prediction_penalty_enabled',
    currentValue: boolean,
    setter: (v: boolean) => void,
    label: string,
  ) => {
    setSavingSettings(true);
    const newValue = !currentValue;
    const { error } = await supabase
      .from('app_settings')
      .update({ [column]: newValue, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) showToast(error.message, 'error');
    else {
      setter(newValue);
      showToast(`${label} ${newValue ? 'enabled' : 'disabled'}.`, 'info');
    }
    setSavingSettings(false);
  };

  const tabs: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: 'fixtures', label: 'Fixtures', icon: Plus },
    { key: 'results', label: 'Results', icon: CheckCircle },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'stats', label: 'Stats', icon: BarChart3 },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const totalPoints = users.reduce((s, u) => s + u.total_points, 0);
  const completedFixtures = fixtures.filter(f => f.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-amber-400" />Admin Panel
        </h1>
        <p className="text-gray-400 mt-1">Manage fixtures, results, and users</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(t => (
          <Button key={t.key} variant={tab === t.key ? 'primary' : 'ghost'} size="sm" onClick={() => setTab(t.key)}>
            <t.icon className="w-4 h-4 mr-1.5" />{t.label}
          </Button>
        ))}
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{fetchError}
          <button onClick={fetchData} className="ml-auto underline text-red-300">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'fixtures' && (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Create New Fixture</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Input label="Home Team" value={newFixture.home_team} onChange={e => setNewFixture({ ...newFixture, home_team: e.target.value })} placeholder="e.g. Brazil" />
                    <Input label="Away Team" value={newFixture.away_team} onChange={e => setNewFixture({ ...newFixture, away_team: e.target.value })} placeholder="e.g. Germany" />
                    <Input label="Home Code" value={newFixture.home_team_code} onChange={e => setNewFixture({ ...newFixture, home_team_code: e.target.value })} placeholder="BRA" />
                    <Input label="Away Code" value={newFixture.away_team_code} onChange={e => setNewFixture({ ...newFixture, away_team_code: e.target.value })} placeholder="GER" />
                    <Input label="Home Flag" value={newFixture.home_team_flag} onChange={e => setNewFixture({ ...newFixture, home_team_flag: e.target.value })} placeholder="🇧🇷" />
                    <Input label="Away Flag" value={newFixture.away_team_flag} onChange={e => setNewFixture({ ...newFixture, away_team_flag: e.target.value })} placeholder="🇩🇪" />
                    <Input label="Kickoff Time (IST)" type="datetime-local" value={newFixture.kickoff_time} onChange={e => setNewFixture({ ...newFixture, kickoff_time: e.target.value })} />
                    <Select label="Stage" options={STAGES.map(s => ({ value: s, label: s }))} value={newFixture.stage} onChange={e => setNewFixture({ ...newFixture, stage: e.target.value })} />
                    <Select label="Group" options={GROUPS.map(g => ({ value: g, label: `Group ${g}` }))} value={newFixture.group_name} onChange={e => setNewFixture({ ...newFixture, group_name: e.target.value })} />
                    <Input label="Venue" value={newFixture.venue} onChange={e => setNewFixture({ ...newFixture, venue: e.target.value })} placeholder="SoFi Stadium" />
                    <Input label="City" value={newFixture.city} onChange={e => setNewFixture({ ...newFixture, city: e.target.value })} placeholder="Los Angeles" />
                    <Input label="Match Number" type="number" value={newFixture.match_number.toString()} onChange={e => setNewFixture({ ...newFixture, match_number: parseInt(e.target.value) || 1 })} />
                  </div>
                  <Button className="mt-4" onClick={handleCreateFixture} disabled={savingFixture}>
                    <Plus className="w-4 h-4 mr-1" />{savingFixture ? 'Creating...' : 'Create Fixture'}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {fixtures.map(f => (
                  <Card key={f.id}>
                    <CardContent className="py-3 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {f.home_team_flag} {f.home_team} vs {f.away_team} {f.away_team_flag}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(f.kickoff_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                          {' · '}{f.stage}{f.group_name ? ` · Group ${f.group_name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={f.status === 'completed' ? 'success' : f.status === 'live' ? 'danger' : 'info'}>
                          {f.status}
                        </Badge>
                        {f.result_entered && <Badge variant="success">Result Entered</Badge>}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setConfirmDeleteId(f.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === 'results' && (
            <Card>
              <CardHeader><CardTitle>Enter Match Result</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select
                  label="Select Fixture"
                  options={[
                    { value: '', label: 'Choose a fixture...' },
                    ...fixtures
                      .filter(f => !f.result_entered)
                      .map(f => ({
                        value: f.id,
                        label: `${f.home_team} vs ${f.away_team} — ${new Date(f.kickoff_time).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
                      })),
                  ]}
                  value={resultFixtureId}
                  onChange={e => setResultFixtureId(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Home Score" type="number" min="0" value={resultHomeScore.toString()} onChange={e => setResultHomeScore(parseInt(e.target.value) || 0)} />
                  <Input label="Away Score" type="number" min="0" value={resultAwayScore.toString()} onChange={e => setResultAwayScore(parseInt(e.target.value) || 0)} />
                </div>
                <Button onClick={handleEnterResult} disabled={!resultFixtureId || savingResult}>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {savingResult ? 'Saving & Calculating...' : 'Enter Result & Calculate Points'}
                </Button>
                <p className="text-xs text-gray-500">
                  Entering a result automatically calculates points for all predictions.
                  {noPredictPenalty && ' Users who did not predict will receive −1 pt.'}
                </p>
              </CardContent>
            </Card>
          )}

          {tab === 'users' && (
            <div className="space-y-2">
              {users.map(u => (
                <Card key={u.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar fallback={u.username} size="sm" src={u.avatar_url || undefined} />
                      <div>
                        <p className="text-sm font-medium text-white">{u.username}</p>
                        <p className="text-xs text-gray-500">{u.total_points} pts · {u.total_predictions} predictions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={u.is_admin ? 'warning' : 'default'}>{u.is_admin ? 'Admin' : 'User'}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleAdmin(u.id, u.is_admin)}>
                        {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {tab === 'stats' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Users', value: users.length, icon: Users },
                { label: 'Total Fixtures', value: fixtures.length, icon: Plus },
                { label: 'Completed', value: completedFixtures, icon: CheckCircle },
                { label: 'Total Points', value: totalPoints, icon: Award },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="py-4 text-center">
                    <s.icon className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-400" />Scoring Rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Toggle 1 — wrong winner penalty */}
                  <SettingToggle
                    title="Negative Points for Wrong Winner"
                    description="Users lose 1 point for every incorrect winner prediction."
                    chips={[
                      { label: 'Correct winner: +2 pts', active: false },
                      { label: 'Exact score: +5 pts total', active: false },
                      { label: `Wrong winner: ${negativePoints ? '−1 pt' : '0 pts'}`, active: negativePoints },
                    ]}
                    enabled={negativePoints}
                    saving={savingSettings}
                    onToggle={() =>
                      handleToggleSetting('negative_points_enabled', negativePoints, setNegativePoints, 'Wrong-winner penalty')
                    }
                  />

                  {/* Toggle 2 — no-prediction penalty (NEW) */}
                  <SettingToggle
                    title="Penalise No-Show Predictions (−1 pt)"
                    description={
                      'When enabled, users who registered before a match\'s kickoff and did not submit ' +
                      'any prediction for that match receive −1 point when the result is entered. ' +
                      'A "Did not predict" record will appear in their history.'
                    }
                    chips={[
                      { label: 'Predicted: normal scoring', active: false },
                      { label: `No prediction: ${noPredictPenalty ? '−1 pt' : '0 pts'}`, active: noPredictPenalty },
                    ]}
                    enabled={noPredictPenalty}
                    saving={savingSettings}
                    onToggle={() =>
                      handleToggleSetting('no_prediction_penalty_enabled', noPredictPenalty, setNoPredictPenalty, 'No-show penalty')
                    }
                  />

                  <p className="text-xs text-gray-500">
                    Settings only apply to future result calculations. Already-calculated predictions are not retroactively changed.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Edit Fixture Modal */}
      {editingFixture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Edit Fixture</h2>
              <button onClick={() => setEditingFixture(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Home Team" value={editForm.home_team} onChange={e => setEditForm({ ...editForm, home_team: e.target.value })} />
                <Input label="Away Team" value={editForm.away_team} onChange={e => setEditForm({ ...editForm, away_team: e.target.value })} />
                <Input label="Home Code" value={editForm.home_team_code} onChange={e => setEditForm({ ...editForm, home_team_code: e.target.value })} placeholder="BRA" />
                <Input label="Away Code" value={editForm.away_team_code} onChange={e => setEditForm({ ...editForm, away_team_code: e.target.value })} placeholder="GER" />
                <Input label="Home Flag" value={editForm.home_team_flag} onChange={e => setEditForm({ ...editForm, home_team_flag: e.target.value })} placeholder="🇧🇷" />
                <Input label="Away Flag" value={editForm.away_team_flag} onChange={e => setEditForm({ ...editForm, away_team_flag: e.target.value })} placeholder="🇩🇪" />
                <Input label="Kickoff Time (IST)" type="datetime-local" value={editForm.kickoff_time} onChange={e => setEditForm({ ...editForm, kickoff_time: e.target.value })} />
                <Select label="Status" options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'live', label: 'Live' }, { value: 'completed', label: 'Completed' }]} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as Fixture['status'] })} />
                <Select label="Stage" options={STAGES.map(s => ({ value: s, label: s }))} value={editForm.stage} onChange={e => setEditForm({ ...editForm, stage: e.target.value })} />
                <Select label="Group" options={GROUPS.map(g => ({ value: g, label: `Group ${g}` }))} value={editForm.group_name} onChange={e => setEditForm({ ...editForm, group_name: e.target.value })} />
                <Input label="Venue" value={editForm.venue} onChange={e => setEditForm({ ...editForm, venue: e.target.value })} />
                <Input label="City" value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} />
                <Input label="Match Number" type="number" value={editForm.match_number.toString()} onChange={e => setEditForm({ ...editForm, match_number: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</Button>
                <Button variant="ghost" onClick={() => setEditingFixture(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this fixture? This will also remove all associated predictions and cannot be undone."
          onConfirm={() => handleDeleteFixture(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
