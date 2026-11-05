import InfoTip from '@/components/ui/InfoTip'
import type { Copy } from './copy'

// Card heading plus the little "i" that explains the metric in plain words.
// Every panel on the dashboard uses this so the explanation sits in the same
// place everywhere. `right` is for a per-card control such as the table toggle.
export default function SectionTitle({ copy, right }: { copy: Copy; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="t-card flex items-center gap-2 text-foreground">
        {copy.label}
        {copy.tip && <InfoTip label={`What "${copy.label}" means`}>{copy.tip}</InfoTip>}
      </h3>
      {right}
    </div>
  )
}
