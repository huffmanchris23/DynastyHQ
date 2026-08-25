export default function ComingSoon({ label }: { label?: string }) {
  return (
    <div className="card center" style={{ padding: '48px 16px' }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--dhq-red, var(--accent)) 20%, transparent)',
          border: '1px solid color-mix(in srgb, var(--dhq-red, var(--accent)) 55%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
          fontSize: 20,
        }}
      >
        🚧
      </div>
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Coming Soon
      </div>
      {label ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{label}</div>
      ) : null}
    </div>
  );
}
