-- Annex Ink supporter preference: whether to render the sparkle burst on
-- dice critical successes. NULL = "use the default" (which is ON), 1 = on,
-- 0 = off. Free users get nothing either way; the resolver normalises the
-- value to a boolean and forces it false when the user isn't an Ink
-- supporter.
--
-- Surfaced through resolvePersonalPlan and loadCurrentSession, so a schema
-- change here requires redeploying auth + api workers.
ALTER TABLE users ADD COLUMN personal_crit_sparkles INTEGER;
