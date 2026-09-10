# Dynasty HQ — Data Schema

Regenerated from the live Supabase schema (project `ytukpycyzldgahvimyoh`) on
the September 2026 cleanup pass. This replaces the old
`Dynasty_HQ_Data_Schema.md` referenced in the OCR process doc, which wasn't
checked into the repo — this file now lives at the repo root going forward
so it never drifts out of sync silently again.

App identity: `dynasty_id = '00001'` (text on every table below except
`game_preview`, which is `bigint`), `user_id = 'csh001'`, `season` — text on
most tables, integer on a few (noted per table). Current dynasty: Cincinnati
(Big 12), Season 2.

## Tables (14 total)

### `settings`
One row per dynasty. `user_id`, `dynasty_id`, `current_season` (int),
`primary_color`, `secondary_color`.

### `assets` (138 rows, static — not dynasty-scoped)
Team reference: `team_abbreviation` (PK), `team_name`, `team_mascot`,
`team_overall/offense/defense`, `team_conference`, `city`, `state`,
`primary_color`, `secondary_color`, `logo_url`.

### `ocr_helper` (138 rows, static — not dynasty-scoped)
Team-name crosswalk for OCR entry. `team_abbreviation`, `team_name`,
`team_mascot`, `name_in_schedule`, `name_in_polls`, `name_in_playoffs`,
`name_in_stats`, `name_in_preview`, `name_in_betting`, `offense_rating`,
`defense_rating`, `overall_rating`.

### `game_preview`
`dynasty_id` is **bigint** here (text everywhere else). `current_week`
(bool) is the single source of truth for "what week is it" — not
`MAX(top_25.week)`. `week` is text (regular season = plain number,
postseason = label matching `week_name` vocabulary below). Columns:
`game_day`, `game_date`, `game_broadcast`, `game_location`, `team`,
`opponent`, `home_team`, `team_overall/offense/defense`,
`opponent_overall/offense/defense` (text), `team_win_probability`,
`opponent_win_probability`, `favorite`, `favorite_spread`,
`favorite_moneyline`, `total_over_under`, `game_time`, `week_name`.

### `team_schedule`
One row per game, all weeks/season. `week_name` — regular season:
`week_N`; postseason: `conference_championship`, `bowl_game`,
`playoff_round_1`, `playoff_quarterfinals`, `playoff_semifinals`,
`national_championship` (exact match required — anything else silently
breaks postseason display). `home_or_away` = `HOME`/`AWAY`. `opponent`,
`opponent_wins`, `opponent_losses`, `w_or_l` = `W`/`L`, `team_score`,
`opponent_score`.

### `top_25`
Single consolidated Top 25 poll (replaces the old `ap_poll` +
`coaches_poll` — coaches poll is no longer fed, and this table itself was
renamed from `ap_poll`). `week` is **text**. `top_25` (int, the rank
column), `team`, `wins`, `losses`. Up to 25 rows/week. `last_week` column
was dropped — this poll doesn't track week-over-week movement.

### `conference_standings`
`week`, `rank`, `overall_wins` are **bigint**; `overall_losses`, `season`
are **text**. `conference` (text) — added this pass, was missing before
(backfilled to `'Big 12'` for existing rows). `team`, `conference_wins`,
`conference_losses`, `overall_wins`, `overall_losses`. No points-for/against
columns.

### `playoff_bracket`
One row per week once the dynasty reaches the postseason.
`cfb_playoff_bracket_url` — screenshot of the bracket.

### `team_stats`
Now split via `offense_or_defense_stat` (`'offense'` | `'defense'`) instead
of one offense-only table. `national_rank` (text — `'user_team'` sentinel
row alongside numeric ranks), `team`, `points_per_game`, `yards_per_game`,
`pass_yards_per_game`, `rush_yards_per_game`. For defense rows these are
points/yards *allowed*.

### `depth_charts`
`offense_depth_chart_url`, `defense_depth_chart_url`.

### `coaching_hotseats`
`team`, `coach`, `job_security` (text, rendered as a %).

### `heisman_trophy`
`rank`, `name`, `team`, `position`.

### `my_coach`
One row per season (2 rows currently: New Mexico season 1, Cincinnati
season 2). Bio fields (`alma_mater`, `recruiting_pipeline`, `offense`,
`defense`, `image_url`, `coaching_philosophy`, `coaching_background`) plus
per-season record (`season_wins`, `season_losses`, `title`) and lifetime
totals (`career_wins`, `career_losses`, `bowl_wins`,
`conference_championships`, `playoff_apperances`, `national_titles`,
`awards`). **Note:** the app no longer trusts `career_wins`/`career_losses`
for the Record Book display — those are computed live from every decided
`team_schedule` row across all seasons instead, since the static fields
kept lagging behind the real season.

### `content`
`content_input_type` values in use: `drive_by` (Around the Nation, 4
one-liners/week), `top_take` (T.B.'s Top Takes, 3/week). `headline` holds
the blurb text itself. `team` — which team the blurb is about, resolves to
a logo badge via `assets.logo_url`. `week` is text.

## Tables removed in the September 2026 cleanup

These no longer exist and nothing in the app queries them: `ap_poll`,
`coaches_poll`, `last_week_box_score`, `last_week_player_stats`,
`top_25_schedule`, `playoff_rankings`, `passing`, `rushing`, `receiving`,
`my_recruit_board`, `national_recruit_ranks`, `broyles_award`,
`coach_of_the_year`, `top_performers`, and the original box-score table.
If any of these come back, they'll need entries here and in
`dashboard.ts`'s query list — querying a table that doesn't exist throws
and takes the whole dashboard down (this is what caused the "won't load"
issue this pass fixed).

## Hard rules (unchanged)

- `dynasty_id`/`season`/`week` NULL on any row silently hides it — no error.
- `week` is **text** on `top_25`, `content`, `team_schedule` (via
  `week_name`), and `game_preview`; **bigint** on `conference_standings`,
  `team_stats`, `playoff_bracket`, `coaching_hotseats`, `heisman_trophy`.
  Match types when filtering.
- `dynasty_id` is text `'00001'` everywhere except `game_preview`
  (bigint `1`).
- `w_or_l` = `"W"`/`"L"`. `home_or_away` = `"HOME"`/`"AWAY"`.
- `week_name` postseason values must exactly match the controlled
  vocabulary above.
