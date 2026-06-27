-- ── 1. Add wildcards_remaining to profiles ────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wildcards_remaining INTEGER NOT NULL DEFAULT 5;

-- ── 2. Add wildcard_used to predictions ──────────────────────────────────────
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS wildcard_used BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Replace calculate_fixture_points with wildcard-aware version ───────────
--
-- Scoring with wildcard ON:
--   Correct winner  → 4 pts  (2 × 2)
--   Exact score     → 10 pts (2 × 5)
--   Wrong winner    → -3 pts (always, regardless of negative_points toggle)
--
-- Scoring with wildcard OFF (unchanged):
--   Correct winner  → 2 pts
--   Exact score     → 5 pts
--   Wrong winner    → -1 pt  (only if negative_points_enabled = true)
--
-- No-show penalty still applies separately (no_prediction_penalty_enabled).
-- Wildcard is NOT refunded if the user abstains — abstain rows have wildcard_used = false
-- so no refund logic is needed.

CREATE OR REPLACE FUNCTION calculate_fixture_points(p_fixture_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_home_score             INTEGER;
  v_away_score             INTEGER;
  v_actual_winner          TEXT;
  v_negative_enabled       BOOLEAN;
  v_no_predict_penalty     BOOLEAN;
  v_kickoff_time           TIMESTAMPTZ;
  rec                      RECORD;
  v_points                 INTEGER;
BEGIN
  SELECT home_score, away_score, kickoff_time
    INTO v_home_score, v_away_score, v_kickoff_time
    FROM fixtures
   WHERE id = p_fixture_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(negative_points_enabled, false),
    COALESCE(no_prediction_penalty_enabled, false)
    INTO v_negative_enabled, v_no_predict_penalty
    FROM app_settings
   WHERE id = 1;

  IF    v_home_score > v_away_score THEN v_actual_winner := 'home';
  ELSIF v_home_score < v_away_score THEN v_actual_winner := 'away';
  ELSE                                    v_actual_winner := 'draw';
  END IF;

  -- ── Step 1: score existing predictions ──────────────────────────────────────
  FOR rec IN
    SELECT * FROM predictions
     WHERE fixture_id = p_fixture_id
       AND calculated  = false
       AND predicted_winner != 'abstain'
  LOOP
    v_points := 0;

    IF rec.wildcard_used THEN
      -- Wildcard scoring: double points for correct, -3 for wrong
      IF rec.predicted_winner = v_actual_winner THEN
        v_points := 4;  -- base 2 × 2
        IF rec.predicted_home_score = v_home_score
           AND rec.predicted_away_score = v_away_score THEN
          v_points := 10;  -- base 5 × 2
        END IF;
      ELSE
        v_points := -3;  -- wildcard wrong = always -3
      END IF;
    ELSE
      -- Normal scoring
      IF rec.predicted_winner = v_actual_winner THEN
        v_points := 2;
        IF rec.predicted_home_score = v_home_score
           AND rec.predicted_away_score = v_away_score THEN
          v_points := 5;
        END IF;
      ELSIF v_negative_enabled THEN
        v_points := -1;
      END IF;
    END IF;

    UPDATE predictions
       SET points_earned = v_points, calculated = true
     WHERE id = rec.id;

    UPDATE profiles
       SET total_points      = total_points + v_points,
           correct_winners   = correct_winners   + CASE WHEN rec.predicted_winner = v_actual_winner THEN 1 ELSE 0 END,
           correct_scores    = correct_scores    + CASE WHEN v_points IN (5, 10) THEN 1 ELSE 0 END,
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
        predicted_winner, points_earned, calculated, wildcard_used
      ) VALUES (
        rec.user_id, p_fixture_id,
        0, 0, 'abstain', -1, true, false
      );

      UPDATE profiles
         SET total_points      = total_points - 1,
             total_predictions = total_predictions + 1
       WHERE id = rec.user_id;
    END LOOP;
  END IF;
END;
$$;
