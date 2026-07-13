// app/components/KpiCaveat.tsx
const KPI_CAVEATS = {
    "deployment_frequency": "Deployment frequency reflects release activity and is best interpreted alongside other delivery metrics.",
    "lead_time":            "Lead time is most meaningful when evaluated alongside quality and reliability metrics.",
    "occupancy":            "Occupancy measures facility usage within a workplace.",
    "attendance":           "Attendance records reflect workforce presence for operational reporting.",
    "commit_count":         "Commit count reflects repository activity and contribution patterns over time.",
    "pull_requests":        "Pull request count reflects code review and development workflow activity.",
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
