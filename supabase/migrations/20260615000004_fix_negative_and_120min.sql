-- ── Fix 1: Wrong answer now gives -1 when negative_points_enabled = true ──────
-- ── Fix 2: Comments updated to say 120 min instead of 90 min ─────────────────
--
-- KNOCKOUT — Draw predicted path:
--   Exact draw score + correct penalty winner  = 5 pts
--   Wrong draw score + correct penalty winner  = 3 pts
--   Any draw score   + wrong penalty winner    = 2 pts
--   Game NOT a draw                            = -1 pt (if negative_points_enabled) else 0
--
-- KNOCKOUT — Direct win predicted path:
--   Exact score + team wins in 120 min         = 5 pts
--   Wrong score + team wins in 120 min         = 2 pts
--   Game goes to penalties OR wrong team       = -1 pt (if negative_points_enabled) else 0
--
-- WILDCARD multipliers (knockout):
--   5 pts → 10 pts
--   3 pts →  6 pts
--   2 pts →  4 pts
--   0 pts → -3 pts
--  -1 pts → -3 pts  (same as 0 with wildcard)
--
-- GROUP STAGE (unchanged):
--   Exact score    = 5 pts
--   Correct winner = 2 pts
--   Wrong winner   = -1 pt (if negative_points_enabled)
--   Wildcard: 5→10, 2→4, 0/-1→-3

CREATE OR REPLACE FUNCTION calculate_fixture_points(p_fixture_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_home_score           INTEGER;
  v_away_score           INTEGER;
  v_penalty_winner       TEXT;
  v_stage                TEXT;
  v_is_knockout          BOOLEAN;
  v_actual_120min_winner TEXT;   -- 'home' | 'away' | 'draw' after 120 min
  v_negative_enabled     BOOLEAN;
  v_no_predict_penalty   BOOLEAN;
  v_kickoff_time         TIMESTAMPTZ;
  rec                    RECORD;
  v_points               INTEGER;
BEGIN
  SELECT home_score, away_score, penalty_winner, stage, kickoff_time
    INTO v_home_score, v_away_score, v_penalty_winner, v_stage, v_kickoff_time
    FROM fixtures
   WHERE id = p_fixture_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(negative_points_enabled, false),
    COALESCE(no_prediction_penalty_enabled, false)
    INTO v_negative_enabled, v_no_predict_penalty
    FROM app_settings WHERE id = 1;

  v_is_knockout := is_knockout_stage(v_stage);

  -- Determine actual result after 120 minutes (90 min + extra time if any)
  IF    v_home_score > v_away_score THEN v_actual_120min_winner := 'home';
  ELSIF v_home_score < v_away_score THEN v_actual_120min_winner := 'away';
  ELSE                                    v_actual_120min_winner := 'draw';
  END IF;

  -- ── Step 1: score predictions ──────────────────────────────────────────────
  FOR rec IN
    SELECT * FROM predictions
     WHERE fixture_id        = p_fixture_id
       AND calculated        = false
       AND predicted_winner != 'abstain'
  LOOP
    v_points := 0;

    IF v_is_knockout THEN

      IF rec.predicted_winner = 'draw' THEN
        -- ── User predicted a DRAW + picked penalty winner ────────────────────

        IF v_actual_120min_winner = 'draw' THEN
          -- Game did end in a draw after 120 min → go to penalties
          IF rec.predicted_penalty_winner = v_penalty_winner THEN
            -- Correct penalty winner
            IF rec.predicted_home_score = v_home_score
               AND rec.predicted_away_score = v_away_score THEN
              v_points := 5;  -- Exact draw score + correct penalty winner
            ELSE
              v_points := 3;  -- Wrong draw score + correct penalty winner
            END IF;
          ELSE
            -- Wrong penalty winner (score irrelevant)
            v_points := 2;
          END IF;
        ELSE
          -- FIX: Game was NOT a draw — user was completely wrong
          -- Apply -1 if negative_points_enabled, else 0
          v_points := CASE WHEN v_negative_enabled THEN -1 ELSE 0 END;
        END IF;

      ELSE
        -- ── User predicted a DIRECT WIN ──────────────────────────────────────

        IF v_actual_120min_winner = 'draw' THEN
          -- FIX: Game went to penalties — user predicted direct win so wrong
          -- Apply -1 if negative_points_enabled, else 0
          v_points := CASE WHEN v_negative_enabled THEN -1 ELSE 0 END;
        ELSE
          IF rec.predicted_winner = v_actual_120min_winner THEN
            -- Correct team won directly
            IF rec.predicted_home_score = v_home_score
               AND rec.predicted_away_score = v_away_score THEN
              v_points := 5;  -- Exact score + correct team
            ELSE
              v_points := 2;  -- Wrong score + correct team
            END IF;
          ELSE
            -- FIX: Wrong team — apply -1 if negative_points_enabled, else 0
            v_points := CASE WHEN v_negative_enabled THEN -1 ELSE 0 END;
          END IF;
        END IF;
      END IF;

      -- Wildcard multiplier for knockout
      -- Both 0 and -1 map to -3 with wildcard (any wrong answer = -3)
      IF rec.wildcard_used THEN
        v_points := CASE v_points
          WHEN  5 THEN 10
          WHEN  3 THEN  6
          WHEN  2 THEN  4
          ELSE        -3   -- 0 or -1 with wildcard = -3
        END;
      END IF;

    ELSE
      -- ── GROUP STAGE (unchanged) ───────────────────────────────────────────
      IF rec.predicted_winner = v_actual_120min_winner THEN
        v_points := 2;
        IF rec.predicted_home_score = v_home_score
           AND rec.predicted_away_score = v_away_score THEN
          v_points := 5;
        END IF;
      ELSIF v_negative_enabled THEN
        v_points := -1;
      END IF;

      IF rec.wildcard_used THEN
        v_points := CASE
          WHEN v_points =  5 THEN 10
          WHEN v_points =  2 THEN  4
          ELSE                    -3
        END;
      END IF;
    END IF;

    UPDATE predictions
       SET points_earned = v_points,
           calculated    = true
     WHERE id = rec.id;

    UPDATE profiles
       SET total_points      = total_points + v_points,
           correct_winners   = correct_winners + CASE
             WHEN v_is_knockout AND v_points IN (5, 10, 3, 6, 2, 4) THEN 1
             WHEN NOT v_is_knockout AND rec.predicted_winner = v_actual_120min_winner THEN 1
             ELSE 0
           END,
           correct_scores    = correct_scores + CASE
             WHEN v_points IN (5, 10) THEN 1 ELSE 0
           END,
           total_predictions = total_predictions + 1
     WHERE id = rec.user_id;
  END LOOP;

  -- ── Step 2: no-show penalty ────────────────────────────────────────────────
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
