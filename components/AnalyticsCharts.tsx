import { CONSTRAINT_COLORS, Constraint } from '../lib/constants'
export default function AnalyticsCharts({ data }: { data: any }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section><h2>MRR (Closed Won)</h2><div style={{ fontSize: 36, color: 'var(--accent-blue)' }}>£{data.mrr.toLocaleString()}</div></section>
      <section><h2>Conversion</h2><p>DM → Call: {pct(data.dmToCall)} · Call → Client: {pct(data.callToClient)}</p></section>
      <section><h2>By stage</h2>{Object.entries(data.byStage).map(([s, n]: any) => <div key={s}>{s}: {n}</div>)}</section>
      <section><h2>By owner</h2>{Object.entries(data.byOwner).map(([o, n]: any) => <div key={o}>{o}: {n}</div>)}</section>
      <section><h2>By source</h2>{Object.entries(data.bySource).map(([s, n]: any) => <div key={s}>{s}: {n}</div>)}</section>
      {data.byConstraint && (
        <section><h2>By primary constraint (6 Ms)</h2>
          {Object.entries(data.byConstraint).map(([c, n]: any) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, background: CONSTRAINT_COLORS[c as Constraint], display: 'inline-block', borderRadius: 2 }} />
              {c}: {n}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
