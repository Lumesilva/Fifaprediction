-- Add no_prediction_penalty_enabled to app_settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS no_prediction_penalty_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add 'abstain' as a valid predicted_winner value for ghost rows
ALTER TABLE predictions
  DROP CONSTRAINT IF EXISTS predictions_predicted_winner_check;

ALTER TABLE predictions
  ADD CONSTRAINT predictions_predicted_winner_check
  CHECK (predicted_winner IN ('home', 'draw', 'away', 'abstain'));

-- Updated calculate_fixture_points:
-- 1. Awards points to users who DID predict (existing logic, unchanged).
-- 2. Penalises users who did NOT predict with -1 pt if no_prediction_penalty_enabled = true.
--    Only users who registered BEFORE the fixture kickoff are penalised.
--    Ghost rows (predicted_winner = 'abstain') are inserted so history is visible.
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
  -- Fetch fixture details
  SELECT home_score, away_score, kickoff_time
    INTO v_home_score, v_away_score, v_kickoff_time
    FROM fixtures
   WHERE id = p_fixture_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  -- Read both toggles from app_settings
  SELECT
    COALESCE(negative_points_enabled, false),
    COALESCE(no_prediction_penalty_enabled, false)
    INTO v_negative_enabled, v_no_predict_penalty
    FROM app_settings
   WHERE id = 1;

  -- Determine actual winner
  IF    v_home_score > v_away_score THEN v_actual_winner := 'home';
  ELSIF v_home_score < v_away_score THEN v_actual_winner := 'away';
  ELSE                                    v_actual_winner := 'draw';
  END IF;

  -- ── Step 1: score existing predictions ────────────────────────────────
  FOR rec IN
    SELECT * FROM predictions
     WHERE fixture_id = p_fixture_id
       AND calculated = false
       AND predicted_winner != 'abstain'
  LOOP
    v_points := 0;

    IF rec.predicted_winner = v_actual_winner THEN
      v_points := 2;
      IF rec.predicted_home_score = v_home_score
         AND rec.predicted_away_score = v_away_score THEN
        v_points := 5;
      END IF;
    ELSIF v_negative_enabled THEN
      v_points := -1;
    END IF;

    UPDATE predictions
       SET points_earned = v_points, calculated = true
     WHERE id = rec.id;

    UPDATE profiles
       SET total_points      = total_points + v_points,
           correct_winners   = correct_winners   + CASE WHEN rec.predicted_winner = v_actual_winner THEN 1 ELSE 0 END,
           correct_scores    = correct_scores    + CASE WHEN v_points = 5           THEN 1 ELSE 0 END,
           total_predictions = total_predictions + 1
     WHERE id = rec.user_id;
  END LOOP;

  -- ── Step 2: penalise no-shows ─────────────────────────────────────────
  IF v_no_predict_penalty THEN
    FOR rec IN
      -- All users who registered before kickoff AND have no prediction for this fixture
      SELECT p.id AS user_id
        FROM profiles p
       WHERE p.created_at < v_kickoff_time
         AND NOT EXISTS (
               SELECT 1 FROM predictions pr
                WHERE pr.fixture_id = p_fixture_id
                  AND pr.user_id    = p.id
             )
    LOOP
      -- Insert ghost row so the penalty is visible in prediction history
      INSERT INTO predictions (
        user_id, fixture_id,
        predicted_home_score, predicted_away_score,
        predicted_winner, points_earned, calculated
      ) VALUES (
        rec.user_id, p_fixture_id,
        0, 0,
        'abstain', -1, true
      );

      -- Deduct 1 point from profile
      UPDATE profiles
         SET total_points      = total_points - 1,
             total_predictions = total_predictions + 1
       WHERE id = rec.user_id;
    END LOOP;
  END IF;
END;
$$;
