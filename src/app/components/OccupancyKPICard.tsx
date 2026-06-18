interface Props {
  title: string;
  value: number | string;
  icon?: string;
}

export default function OccupancyKPICard({
  title,
  value,
  icon,
}: Props) {
  return (
    <div className="card stat-card">
      <div className="stat-top">
        <div className="icon-badge icon-badge-cyan">
          <i className={`fa-solid ${icon} icon-cyan`} />
        </div>
      </div>

      <div className="stat-value">
        {value}
      </div>

      <div className="stat-label">
        {title}
      </div>
    </div>
  );
}