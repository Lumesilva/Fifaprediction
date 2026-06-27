-- ── 1. Add penalty_winner to fixtures ────────────────────────────────────────
ALTER TABLE fixtures
  ADD COLUMN IF NOT EXISTS penalty_winner TEXT DEFAULT NULL
  CHECK (penalty_winner IN ('home', 'away', NULL));

-- ── 2. Add predicted_penalty_winner to predictions ───────────────────────────
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS predicted_penalty_winner TEXT DEFAULT NULL
  CHECK (predicted_penalty_winner IN ('home', 'away', NULL));

-- Also add wildcard_used and abstain support if not already present
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS wildcard_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wildcards_remaining INTEGER NOT NULL DEFAULT 5;

-- Fix abstain constraint if not already done
ALTER TABLE predictions
  DROP CONSTRAINT IF EXISTS predictions_predicted_winner_check;
ALTER TABLE predictions
  ADD CONSTRAINT predictions_predicted_winner_check
  CHECK (predicted_winner IN ('home', 'draw', 'away', 'abstain'));

-- ── 3. Helper: is a stage a knockout stage? ───────────────────────────────────
CREATE OR REPLACE FUNCTION is_knockout_stage(p_stage TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_stage IN (
    'Round of 32', 'Round of 16',
    'Quarter Final', 'Semi Final',
    'Third Place', 'Final'
  );
$$;

-- ── 4. Full calculate_fixture_points with penalty + wildcard support ──────────
--
-- GROUP STAGE scoring (unchanged):
--   Exact score              = 5 pts
--   Correct winner           = 2 pts
--   Wrong winner             = -1 pt (if negative_points_enabled)
--
-- KNOCKOUT scoring:
--   Exact score 90min + correct penalty winner = 5 pts
--   Exact score 90min + wrong penalty winner   = 3 pts
--   Wrong score but correct team advancing     = 2 pts
--   Wrong team advancing                       = 0 pts
--
-- WILDCARD multiplier (knockout):
--   5 pts → 10 pts
--   3 pts →  6 pts
--   2 pts →  4 pts
--   0 pts → -3 pts
--
-- WILDCARD multiplier (group):
--   5 pts → 10 pts
--   2 pts →  4 pts
--   0/-1  → -3 pts

CREATE OR REPLACE FUNCTION calculate_fixture_points(p_fixture_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_home_score             INTEGER;
  v_away_score             INTEGER;
  v_penalty_winner         TEXT;     -- 'home' | 'away' | NULL
  v_stage                  TEXT;
  v_is_knockout            BOOLEAN;
  v_actual_90min_winner    TEXT;     -- who won 90 mins ('home'|'away'|'draw')
  v_actual_advancing       TEXT;     -- who actually advances ('home'|'away')
  v_negative_enabled       BOOLEAN;
  v_no_predict_penalty     BOOLEAN;
  v_kickoff_time           TIMESTAMPTZ;
  rec                      RECORD;
  v_points                 INTEGER;
  v_predicted_advancing    TEXT;     -- who user predicted to advance
BEGIN
  -- Fetch fixture
  SELECT home_score, away_score, penalty_winner, stage, kickoff_time
    INTO v_home_score, v_away_score, v_penalty_winner, v_stage, v_kickoff_time
    FROM fixtures
   WHERE id = p_fixture_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  -- Read settings
  SELECT
    COALESCE(negative_points_enabled, false),
    COALESCE(no_prediction_penalty_enabled, false)
    INTO v_negative_enabled, v_no_predict_penalty
    FROM app_settings WHERE id = 1;

  v_is_knockout := is_knockout_stage(v_stage);

  -- 90-minute result
  IF    v_home_score > v_away_score THEN v_actual_90min_winner := 'home';
  ELSIF v_home_score < v_away_score THEN v_actual_90min_winner := 'away';
  ELSE                                    v_actual_90min_winner := 'draw';
  END IF;

  -- Who actually advances (knockout: penalties decide draws; group: n/a)
  IF v_is_knockout AND v_actual_90min_winner = 'draw' THEN
    v_actual_advancing := v_penalty_winner;  -- could be NULL if not entered yet
  ELSE
    v_actual_advancing := v_actual_90min_winner;
  END IF;

  -- ── Step 1: score submitted predictions ─────────────────────────────────────
  FOR rec IN
    SELECT * FROM predictions
     WHERE fixture_id   = p_fixture_id
       AND calculated   = false
       AND predicted_winner != 'abstain'
  LOOP
    v_points := 0;

    IF v_is_knockout THEN
      -- Determine who user predicted to advance
      IF rec.predicted_home_score > rec.predicted_away_score THEN
        v_predicted_advancing := 'home';
      ELSIF rec.predicted_home_score < rec.predicted_away_score THEN
        v_predicted_advancing := 'away';
      ELSE
        -- User predicted a draw → penalty winner decides
        v_predicted_advancing := rec.predicted_penalty_winner;
      END IF;

      -- Knockout scoring matrix
      IF rec.predicted_home_score = v_home_score
         AND rec.predicted_away_score = v_away_score
         AND v_actual_90min_winner = 'draw' THEN
        -- Exact 90-min draw score
        IF rec.predicted_penalty_winner = v_penalty_winner THEN
          v_points := 5;  -- Exact score + correct penalty winner
        ELSE
          v_points := 3;  -- Exact score + wrong penalty winner
        END IF;
      ELSIF rec.predicted_home_score = v_home_score
            AND rec.predicted_away_score = v_away_score
            AND v_actual_90min_winner != 'draw' THEN
        -- Exact non-draw score (team advanced directly)
        v_points := 5;
      ELSIF v_predicted_advancing IS NOT NULL
            AND v_predicted_advancing = v_actual_advancing THEN
        -- Wrong score but correct team advancing
        v_points := 2;
      ELSE
        -- Wrong team advancing
        v_points := 0;
      END IF;

      -- Apply wildcard multiplier for knockout
      IF rec.wildcard_used THEN
        v_points := CASE v_points
          WHEN 5 THEN 10
          WHEN 3 THEN  6
          WHEN 2 THEN  4
          ELSE        -3
        END;
      END IF;

    ELSE
      -- GROUP STAGE scoring (unchanged)
      IF rec.predicted_winner = v_actual_90min_winner THEN
        v_points := 2;
        IF rec.predicted_home_score = v_home_score
           AND rec.predicted_away_score = v_away_score THEN
          v_points := 5;
        END IF;
      ELSIF v_negative_enabled THEN
        v_points := -1;
      END IF;

      -- Apply wildcard multiplier for group stage
      IF rec.wildcard_used THEN
        v_points := CASE
          WHEN v_points = 5  THEN 10
          WHEN v_points = 2  THEN  4
          ELSE                    -3
        END;
      END IF;
    END IF;

    UPDATE predictions
       SET points_earned = v_points, calculated = true
     WHERE id = rec.id;

    UPDATE profiles
       SET total_points      = total_points + v_points,
           correct_winners   = correct_winners + CASE
             WHEN v_is_knockout AND v_predicted_advancing = v_actual_advancing THEN 1
             WHEN NOT v_is_knockout AND rec.predicted_winner = v_actual_90min_winner THEN 1
             ELSE 0
           END,
           correct_scores    = correct_scores + CASE
             WHEN v_points IN (5, 10) THEN 1 ELSE 0
           END,
           total_predictions = total_predictions + 1
     WHERE id = rec.user_id;
  END LOOP;

  -- ── Step 2: penalise no-shows ────────────────────────────────────────────────
  IF v_no_predict_penalty THEN
    FOR rec IN
      SELECT p.id AS user_id
        FROM profiles p
       WHERE p.created_at < v_kickoff_time
         AND NOT EXISTS (
               SELECT 1 FROM predictions pr
                WHERE pr.fixture_id = p_fixture_id
                  AND pr.user_id    = p.id
             )
    LOOP
      INSERT INTO predictions (
        user_id, fixture_id,
        predicted_home_score, predicted_away_score,
        predicted_winner, predicted_penalty_winner,
        points_earned, calculated, wildcard_used
      ) VALUES (
        rec.user_id, p_fixture_id,
        0, 0, 'abstain', NULL,
        -1, true, false
      );

      UPDATE profiles
         SET total_points      = total_points - 1,
             total_predictions = total_predictions + 1
       WHERE id = rec.user_id;
    END LOOP;
  END IF;
END;
$$;
