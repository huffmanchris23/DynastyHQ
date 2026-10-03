export const metadata = { title: 'Terms of Service · Dynasty HQ' };

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 18px 64px', lineHeight: 1.55 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, textTransform: 'uppercase', color: 'var(--dhq-navy)', fontSize: 34, margin: 0 }}>Terms of Service</h1>
      <p style={{ opacity: 0.6, fontSize: 13 }}>Dynasty HQ · Last updated October 3, 2026</p>

      <p>By using Dynasty HQ you agree to these terms. If you do not agree, please do not use the app.</p>

      <h2>What Dynasty HQ is</h2>
      <p>Dynasty HQ is a fan-made tool for tracking college football video game dynasty leagues. It is not affiliated with, endorsed by, or sponsored by Electronic Arts or any league, school, or conference.</p>

      <h2>Your account</h2>
      <p>You sign in with a Google account{' '}(or email, if enabled). You are responsible for activity on your account. Do not share access or try to use another person&apos;s account.</p>

      <h2>Your content</h2>
      <p>You keep ownership of what you upload and post. You give Dynasty HQ permission to store and process it, including sending screenshots to a third-party AI service to read them, so the app can work. Only upload screenshots of your own game screens, and do not post anything unlawful, abusive, or that invades someone&apos;s privacy.</p>

      <h2>Dynasties and commissioners</h2>
      <p>Each dynasty is run by its commissioner, who can set rules, approve team moves, publish weeks, and remove members. The commissioner&apos;s decisions about a league are their own, not Dynasty HQ&apos;s.</p>

      <h2>Accuracy</h2>
      <p>Data in the app is read from screenshots by automated tools and can contain mistakes. Odds, spreads, broadcast slots, and written content are for entertainment only and are not betting or financial advice.</p>

      <h2>Availability</h2>
      <p>The app is provided &quot;as is&quot; with no promise that it will always be available, error-free, or that your data will never be lost. Features can change or be removed at any time.</p>

      <h2>Ending access</h2>
      <p>You can stop using the app at any time. Access may be removed for misuse of the app.</p>

      <h2>Contact</h2>
      <p>Questions or removal requests: {contact ? <a href={`mailto:${contact}`}>{contact}</a> : 'please ask your dynasty commissioner'}.</p>

      <p style={{ marginTop: 28, fontSize: 14 }}><a href="/privacy">Privacy Policy</a> · <a href="/">Back to Dynasty HQ</a></p>
    </main>
  );
}
