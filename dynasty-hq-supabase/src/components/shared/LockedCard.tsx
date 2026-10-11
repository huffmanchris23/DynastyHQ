export default function LockedCard({ untilWeek, label }: { untilWeek?: number; label?: string }) {
  const text = label || (untilWeek !== undefined ? `Available Week ${untilWeek}` : 'Not available yet');
  return (
    <div className="card primary center" style={{ padding: '40px 16px' }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--primary) 25%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>🔒</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{text}</div>
    </div>
  );
}
