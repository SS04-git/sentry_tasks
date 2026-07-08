// app/components/KpiCaveat.tsx
const KPI_CAVEATS = {
  deployment_frequency: 'High deployment counts do not imply higher team performance.',
  lead_time:            'Lead time should be interpreted alongside quality metrics.',
  occupancy:            'Occupancy reflects building utilization, not employee productivity.',
  attendance:           'Attendance is operational data and must not be used as a performance score.',
  commit_count:         'Commit counts are gameable and should not be used for performance evaluation.',
  pull_requests:        'PR volume measures workflow activity, not impact.',
} as const;

type KpiKey = keyof typeof KPI_CAVEATS;

interface KpiCaveatProps {
  kpiKey?: KpiKey;
  text?: string;
}

export function KpiCaveat({ kpiKey, text }: KpiCaveatProps) {
  const message = text ?? (kpiKey ? KPI_CAVEATS[kpiKey] : undefined);
  if (!message) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '6px',
      marginTop: '0.6rem', padding: '6px 10px',
      background: 'var(--surface-alt)',
      borderRadius: '8px', borderLeft: '2px solid var(--border)',
    }}>
      <i className="fa-solid fa-circle-info" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }} />
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{message}</p>
    </div>
  );
}
