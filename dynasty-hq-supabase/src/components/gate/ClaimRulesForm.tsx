'use client';

export interface ClaimRules {
  allowPick: boolean;
  allowRandom: boolean;
  rerollLimit: number;
  minOverall: number | null;
  maxOverall: number | null;
  conferences: string[];
}
export interface MetaTeam { name: string; conference: string | null; overall: number | null }

export function matchCount(rules: ClaimRules, teams: MetaTeam[]): number {
  return teams.filter((t) => {
    if (rules.conferences.length && rules.conferences.indexOf(t.conference || '') === -1) return false;
    if (t.overall !== null) {
      if (rules.minOverall !== null && t.overall < rules.minOverall) return false;
      if (rules.maxOverall !== null && t.overall > rules.maxOverall) return false;
    }
    return true;
  }).length;
}

/** How coaches get a team: pick / random draw / rerolls / which teams are in the pool. Tap-only, with a live count. */
export default function ClaimRulesForm({ value, onChange, teams, conferences }: { value: ClaimRules; onChange: (v: ClaimRules) => void; teams: MetaTeam[]; conferences: string[] }) {
  const ratings = Array.from(new Set(teams.map((t) => t.overall).filter((n): n is number => n !== null))).sort((a, b) => a - b);
  const count = matchCount(value, teams);
  const set = (patch: Partial<ClaimRules>) => onChange({ ...value, ...patch });
  const toggleConf = (c: string) => set({ conferences: value.conferences.indexOf(c) > -1 ? value.conferences.filter((x) => x !== c) : value.conferences.concat(c) });
  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <div className="gate-rules">
      <label className="gate-check"><input type="checkbox" checked={value.allowPick} onChange={(e) => set({ allowPick: e.target.checked })} /> Coaches can pick their team</label>
      <label className="gate-check"><input type="checkbox" checked={value.allowRandom} onChange={(e) => set({ allowRandom: e.target.checked })} /> Coaches can draw a random team</label>
      {value.allowRandom ? (
        <label className="gate-field">Rerolls allowed
          <select className="gate-input small" value={value.rerollLimit} onChange={(e) => set({ rerollLimit: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      ) : null}

      {ratings.length ? (
        <div className="gate-field">Team rating range (optional)
          <div className="gate-pair">
            <select className="gate-input small" aria-label="Lowest rating" value={value.minOverall ?? ''} onChange={(e) => set({ minOverall: num(e.target.value) })}>
              <option value="">Any low</option>
              {ratings.map((n) => <option key={n} value={n}>{n}+</option>)}
            </select>
            <select className="gate-input small" aria-label="Highest rating" value={value.maxOverall ?? ''} onChange={(e) => set({ maxOverall: num(e.target.value) })}>
              <option value="">Any high</option>
              {ratings.map((n) => <option key={n} value={n}>up to {n}</option>)}
            </select>
          </div>
          <span className="gate-hint">Starting ratings run {ratings[0]} to {ratings[ratings.length - 1]}.</span>
        </div>
      ) : null}

      {conferences.length ? (
        <div className="gate-field">Limit to conferences (none selected = all)
          <div className="gate-chips">
            {conferences.map((c) => (
              <button key={c} type="button" aria-pressed={value.conferences.indexOf(c) > -1} className={`gate-chip ${value.conferences.indexOf(c) > -1 ? 'on' : ''}`} onClick={() => toggleConf(c)}>{c}</button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={count === 0 ? 'gate-error' : 'gate-hint'} role="status">
        {count === 0 ? 'No teams match these settings. Nobody could claim a team.' : `${count} team${count === 1 ? '' : 's'} match.`}
        {count > 0 && count < 4 ? ' That is a very small pool.' : ''}
      </div>
    </div>
  );
}
