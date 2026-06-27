export interface Profile {
  id: string;
  username: string;
  avatar_url: string;
  is_admin: boolean;
  total_points: number;
  correct_winners: number;
  correct_scores: number;
  total_predictions: number;
  wildcards_remaining: number;
  created_at: string;
}

export interface Fixture {
  id: string;
  match_number: number;
  home_team: string;
  away_team: string;
  home_team_code: string;
  away_team_code: string;
  home_team_flag: string;
  away_team_flag: string;
  kickoff_time: string;
  stage: string;
  group_name: string;
  venue: string;
  city: string;
  status: 'upcoming' | 'live' | 'completed';
  home_score: number | null;
  away_score: number | null;
  /** Penalty winner for knockout draws — 'home' | 'away' | null */
  penalty_winner: 'home' | 'away' | null;
  result_entered: boolean;
  external_id: string | null;
  created_at: string;
}

export interface Prediction {
  id: string;
  user_id: string;
  fixture_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  /** 'abstain' = ghost row when user missed match and no-show penalty is on */
  predicted_winner: 'home' | 'draw' | 'away' | 'abstain';
  /** Required for knockout draws — which team user predicts wins on penalties */
  predicted_penalty_winner: 'home' | 'away' | null;
  points_earned: number;
  calculated: boolean;
  wildcard_used: boolean;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  avatar_url: string;
  total_points: number;
  correct_winners: number;
  correct_scores: number;
  total_predictions: number;
  accuracy: number;
}

export interface CommunityStats {
  home_pct: number;
  draw_pct: number;
  away_pct: number;
  total_predictions: number;
}
