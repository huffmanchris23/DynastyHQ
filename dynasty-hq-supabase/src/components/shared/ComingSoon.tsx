export default function ComingSoon({ label }: { label?: string }) {
  return (
    <div className="card center" style={{ padding: '48px 16px', opacity: 0.6 }}>
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Coming Soon
      </div>
      {label ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{label}</div>
      ) : null}
    </div>
  );
}
