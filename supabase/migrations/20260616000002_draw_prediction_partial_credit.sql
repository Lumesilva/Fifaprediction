-- ── Draw prediction partial credit when game is NOT a draw ────────────────────
--
-- NEW RULE: If user predicted a draw + picked a penalty winner,
-- and the game was decided directly (no draw), check if their
-- penalty winner pick matches the actual winning team:
--   Match  → +2 pts (correct team, wrong match type)
--   No match → -1 pt (or 0)
--
-- KNOCKOUT — Draw predicted path (updated):
--   Game IS a draw:
--     Exact draw score + correct penalty winner = 5 pts
--     Wrong draw score + correct penalty winner  = 3 pts
--     Any draw score   + wrong penalty winner    = 2 pts
--   Game NOT a draw:
--     Penalty winner pick = actual winning team  = 2 pts  ← NEW
--     Penalty winner pick ≠ actual winning team  = -1 pt (or 0)  ← NEW
--
-- KNOCKOUT — Direct win predicted path (unchanged):
--   Exact 120-min score + correct team advances  = 5 pts
--   Wrong score + correct team advances          = 2 pts
--   Wrong team advances                          = -1 pt (or 0)
--
-- WILDCARD multipliers (knockout): 5→10, 3→6, 2→4, 0/-1→-3
-- GROUP STAGE: unchanged

CREATE OR REPLACE FUNCTION calculate_fixture_points(p_fixture_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_home_score           INTEGER;
  v_away_score           INTEGER;
  v_penalty_winner       TEXT;
  v_stage                TEXT;
  v_is_knockout          BOOLEAN;
  v_actual_120min_winner TEXT;
  v_actual_advancing     TEXT;
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

  IF    v_home_score > v_away_score THEN v_actual_120min_winner := 'home';
  ELSIF v_home_score < v_away_score THEN v_actual_120min_winner := 'away';
  ELSE                                    v_actual_120min_winner := 'draw';
  END IF;

  -- Who actually advances (penalty winner resolves draws)
  IF v_actual_120min_winner = 'draw' THEN
    v_actual_advancing := v_penalty_winner;
  ELSE
    v_actual_advancing := v_actual_120min_winner;
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
          -- Game ended in a draw after 120 min → penalties decided it
          IF rec.predicted_penalty_winner = v_penalty_winner THEN
            IF rec.predicted_home_score = v_home_score
               AND rec.predicted_away_score = v_away_score THEN
              v_points := 5;  -- Exact draw score + correct penalty winner
            ELSE
              v_points := 3;  -- Wrong draw score + correct penalty winner
            END IF;
          ELSE
            v_points := 2;    -- Wrong penalty winner (score irrelevant)
          END IF;

        ELSE
          -- Game was NOT a draw — decided directly in 120 min
          -- NEW: check if their penalty winner pick matches actual winner
          IF rec.predicted_penalty_winner = v_actual_120min_winner THEN
            v_points := 2;  -- Picked the right team even though predicted wrong match type
          ELSE
            v_points := CASE WHEN v_negative_enabled THEN -1 ELSE 0 END;
          END IF;
        END IF;

      ELSE
        -- ── User predicted a DIRECT WIN ──────────────────────────────────────
        -- Checks who actually advances (120 min winner OR penalty winner)

        IF v_actual_advancing IS NOT NULL
           AND rec.predicted_winner = v_actual_advancing THEN
          -- Correct team advances
          IF v_actual_120min_winner != 'draw'
             AND rec.predicted_home_score = v_home_score
             AND rec.predicted_away_score = v_away_score THEN
            v_points := 5;  -- Exact 120-min score + correct team
          ELSE
            v_points := 2;  -- Correct team advances, score/format didn't match
          END IF;
        ELSE
          v_points := CASE WHEN v_negative_enabled THEN -1 ELSE 0 END;
        END IF;
      END IF;

      -- Wildcard multiplier for knockout
      IF rec.wildcard_used THEN
        v_points := CASE v_points
          WHEN  5 THEN 10
          WHEN  3 THEN  6
          WHEN  2 THEN  4
          ELSE        -3
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
