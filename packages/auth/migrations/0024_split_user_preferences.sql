-- Move cosmetic / per-user preference columns off the users table into a 1:1
-- satellite. Same rationale as 0023 (user_billing): the users row is read on
-- every authenticated request via loadCurrentSession, and these columns
-- (fonts, ring style, presence colour, sparkle toggle, timezone, bio, badges)
-- are not auth-essential. bio in particular is potentially long markdown.
--
-- A user_preferences row only exists once a user has set at least one
-- preference; LEFT JOIN handles the absent-row case throughout the codebase.
CREATE TABLE user_preferences (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reading_font             TEXT,
  editing_font             TEXT,
  ui_font                  TEXT,
  personal_plan_style      TEXT,
  personal_presence_color  TEXT,
  personal_crit_sparkles   INTEGER,
  timezone                 TEXT,
  bio                      TEXT,
  badges                   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO user_preferences (
  user_id, reading_font, editing_font, ui_font,
  personal_plan_style, personal_presence_color, personal_crit_sparkles,
  timezone, bio, badges
)
SELECT id, reading_font, editing_font, ui_font,
       personal_plan_style, personal_presence_color, personal_crit_sparkles,
       timezone, bio, COALESCE(badges, 0)
FROM users
WHERE reading_font IS NOT NULL
   OR editing_font IS NOT NULL
   OR ui_font IS NOT NULL
   OR personal_plan_style IS NOT NULL
   OR personal_presence_color IS NOT NULL
   OR personal_crit_sparkles IS NOT NULL
   OR timezone IS NOT NULL
   OR bio IS NOT NULL
   OR badges != 0;

ALTER TABLE users DROP COLUMN reading_font;
ALTER TABLE users DROP COLUMN editing_font;
ALTER TABLE users DROP COLUMN ui_font;
ALTER TABLE users DROP COLUMN personal_plan_style;
ALTER TABLE users DROP COLUMN personal_presence_color;
ALTER TABLE users DROP COLUMN personal_crit_sparkles;
ALTER TABLE users DROP COLUMN timezone;
ALTER TABLE users DROP COLUMN bio;
ALTER TABLE users DROP COLUMN badges;
