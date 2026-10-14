import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ConsumptionSegment } from '../../lib/stats/fuel'
import { formatDate } from '../../lib/format'
import ChartTooltip from './ChartTooltip'

const tick = { fill: 'var(--viz-text-secondary)', fontSize: 12 }

export default function ConsumptionChart({ segments }: { segments: ConsumptionSegment[] }) {
  const data = segments.map((s) => ({ date: s.date, v: Number(s.lPer100.toFixed(2)) }))
  return (
    <section className="card viz-root" aria-label="Évolution de la consommation">
      <h3 className="mb-2 font-semibold">Évolution de la consommation (L/100 km)</h3>
      <div className="h-56" role="img" aria-label={`Courbe de consommation, ${data.length} points`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="date" tick={tick} tickFormatter={(d: string) => d.slice(5, 7) + '/' + d.slice(2, 4)} stroke="var(--viz-grid)" />
            <YAxis tick={tick} domain={["auto", "auto"]} stroke="var(--viz-grid)" width={40} tickFormatter={(v: number) => String(v).replace(".", ",")} />
            <Tooltip
              cursor={{ stroke: 'var(--viz-text-secondary)', strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={formatDate(String(payload[0].payload.date))}
                    rows={[{ value: `${String(payload[0].value).replace('.', ',')} L/100 km`, label: 'Consommation', color: 'var(--series-1)' }]}
                  />
                ) : null
              }
            />
            <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2}
              dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--viz-surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: 'var(--viz-surface)', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="min-h-[44px] cursor-pointer py-2">Voir sous forme de tableau</summary>
        <table className="w-full"><thead><tr className="text-left"><th>Date</th><th className="text-right">L/100 km</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.date}><td>{formatDate(d.date)}</td><td className="text-right">{d.v.toFixed(1).replace('.', ',')}</td></tr>)}</tbody></table>
      </details>
    </section>
  )
}
