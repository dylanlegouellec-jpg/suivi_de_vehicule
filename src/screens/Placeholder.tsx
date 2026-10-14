import EmptyState from '../components/EmptyState'

export default function Placeholder({ title, phase }: { title: string; phase: number }) {
  return <EmptyState icon="🚧" title={title} text={`Cet écran arrive en phase ${phase}.`} />
}
