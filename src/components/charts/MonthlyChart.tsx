import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatEuro } from '../../lib/format'
import type { MonthCost } from '../../lib/stats/stats'
import ChartTooltip from './ChartTooltip'

const tick = { fill: 'var(--viz-text-secondary)', fontSize: 12 }
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const label = (k: string) => MONTH.format(new Date(`${k}-01T00:00:00`))

export default function MonthlyChart({ data }: { data: MonthCost[] }) {
  return (
    <section className="card viz-root" aria-label="Coût par mois">
      <h3 className="mb-2 font-semibold">Coût par mois</h3>
      <div className="h-56" role="img" aria-label={`Histogramme du coût mensuel, ${data.length} mois`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="key" tick={tick} stroke="var(--viz-grid)" interval="preserveStartEnd"
              tickFormatter={(k: string) => k.slice(5) + '/' + k.slice(2, 4)} />
            <YAxis tick={tick} stroke="var(--viz-grid)" width={56} tickFormatter={(v: number) => `${v} €`} />
            <Tooltip
              cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip title={label(String(payload[0].payload.key))}
                    rows={[{ value: formatEuro(Number(payload[0].value)), label: 'Dépenses', color: 'var(--series-1)' }]} />
                ) : null
              }
            />
            <Bar dataKey="total" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="min-h-[44px] cursor-pointer py-2">Voir sous forme de tableau</summary>
        <table className="w-full"><thead><tr className="text-left"><th>Mois</th><th className="text-right">Total</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.key}><td className="capitalize">{label(d.key)}</td><td className="text-right">{formatEuro(d.total)}</td></tr>)}</tbody></table>
      </details>
    </section>
  )
}
