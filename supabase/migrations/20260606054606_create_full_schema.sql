
-- PROFILES
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  total_points INTEGER NOT NULL DEFAULT 0,
  correct_winners INTEGER NOT NULL DEFAULT 0,
  correct_scores INTEGER NOT NULL DEFAULT 0,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- FIXTURES
CREATE TABLE fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_number INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_team_code TEXT NOT NULL DEFAULT '',
  away_team_code TEXT NOT NULL DEFAULT '',
  home_team_flag TEXT NOT NULL DEFAULT '',
  away_team_flag TEXT NOT NULL DEFAULT '',
  kickoff_time TIMESTAMPTZ NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Group Stage',
  group_name TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed')),
  home_score INTEGER,
  away_score INTEGER,
  result_entered BOOLEAN NOT NULL DEFAULT false,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_fixtures" ON fixtures FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_fixtures" ON fixtures FOR INSERT TO authenticated WITH CHECK (
  (SELECT is_admin FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "update_fixtures" ON fixtures FOR UPDATE TO authenticated USING (
  (SELECT is_admin FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "delete_fixtures" ON fixtures FOR DELETE TO authenticated USING (
  (SELECT is_admin FROM profiles WHERE id = auth.uid())
);

-- Also allow anon to read fixtures (for landing page)
CREATE POLICY "select_fixtures_anon" ON fixtures FOR SELECT TO anon USING (true);

-- PREDICTIONS
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  predicted_home_score INTEGER NOT NULL DEFAULT 0,
  predicted_away_score INTEGER NOT NULL DEFAULT 0,
  predicted_winner TEXT NOT NULL CHECK (predicted_winner IN ('home', 'draw', 'away')),
  points_earned INTEGER NOT NULL DEFAULT 0,
  calculated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fixture_id)
);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_predictions" ON predictions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_predictions" ON predictions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_predictions" ON predictions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_predictions" ON predictions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Allow authenticated users to read all predictions (for community stats)
CREATE POLICY "select_all_predictions" ON predictions FOR SELECT TO authenticated USING (true);

-- POINTS CALCULATION FUNCTION
-- 2pts for correct winner, +3pts bonus for exact score (max 5)
CREATE OR REPLACE FUNCTION calculate_fixture_points(p_fixture_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_home_score INTEGER;
  v_away_score INTEGER;
  v_actual_winner TEXT;
  rec RECORD;
  v_points INTEGER;
BEGIN
  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM fixtures WHERE id = p_fixture_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  IF v_home_score > v_away_score THEN v_actual_winner := 'home';
  ELSIF v_home_score < v_away_score THEN v_actual_winner := 'away';
  ELSE v_actual_winner := 'draw';
  END IF;

  FOR rec IN SELECT * FROM predictions WHERE fixture_id = p_fixture_id AND calculated = false LOOP
    v_points := 0;
    IF rec.predicted_winner = v_actual_winner THEN
      v_points := 2;
      IF rec.predicted_home_score = v_home_score AND rec.predicted_away_score = v_away_score THEN
        v_points := 5;
      END IF;
    END IF;

    UPDATE predictions SET points_earned = v_points, calculated = true WHERE id = rec.id;

    UPDATE profiles SET
      total_points = total_points + v_points,
      correct_winners = correct_winners + CASE WHEN rec.predicted_winner = v_actual_winner THEN 1 ELSE 0 END,
      correct_scores = correct_scores + CASE WHEN v_points = 5 THEN 1 ELSE 0 END,
      total_predictions = total_predictions + 1
    WHERE id = rec.user_id;
  END LOOP;
END;
$$;
