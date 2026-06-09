
-- Updated points calculation: reads negative_points_enabled from app_settings
-- Scoring: correct winner = 2pts, exact score = +3 bonus (total 5pts)
--          wrong winner = -1pt only when negative_points_enabled = true
CREATE OR REPLACE FUNCTION calculate_fixture_points(p_fixture_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_home_score INTEGER;
  v_away_score INTEGER;
  v_actual_winner TEXT;
  v_negative_enabled BOOLEAN;
  rec RECORD;
  v_points INTEGER;
BEGIN
  SELECT home_score, away_score INTO v_home_score, v_away_score
  FROM fixtures WHERE id = p_fixture_id;

  IF v_home_score IS NULL OR v_away_score IS NULL THEN RETURN; END IF;

  SELECT negative_points_enabled INTO v_negative_enabled FROM app_settings WHERE id = 1;
  v_negative_enabled := COALESCE(v_negative_enabled, false);

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
    ELSIF v_negative_enabled THEN
      v_points := -1;
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
