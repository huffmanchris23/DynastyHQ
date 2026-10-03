export const metadata = { title: 'Privacy Policy · Dynasty HQ' };

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 18px 64px', lineHeight: 1.55 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, textTransform: 'uppercase', color: 'var(--dhq-navy)', fontSize: 34, margin: 0 }}>Privacy Policy</h1>
      <p style={{ opacity: 0.6, fontSize: 13 }}>Dynasty HQ · Last updated October 3, 2026</p>

      <p>Dynasty HQ is a small web app for tracking college football dynasty leagues. This page explains what information it handles and why.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account information.</strong> When you sign in with Google, we receive your name, email address, and Google account ID. If email sign-in is turned on, we receive the email address you enter.</li>
        <li><strong>League information.</strong> The dynasties you create or join, your team, your role, and posts or requests you submit inside the app.</li>
        <li><strong>Screenshots you upload.</strong> Images of in-game screens (schedules, stats, standings, and similar), plus the data read from them.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in and keep you signed in on your device.</li>
        <li>To show you your dynasty and the other members of your league.</li>
        <li>To read the text in your screenshots and turn it into dashboard data. The images are sent to Anthropic&apos;s Claude API for this purpose.</li>
      </ul>
      <p>We do not sell your information, show ads, or use it for anything other than running the app.</p>

      <h2>Who can see what</h2>
      <p>Members of a dynasty can see that dynasty&apos;s published data, including each member&apos;s team and name. The commissioner of a dynasty can see more, such as who has uploaded for the current week. Uploaded screenshots are stored privately and are not shown to other members.</p>

      <h2>Services we rely on</h2>
      <p>Dynasty HQ is hosted on Vercel, stores data and sign-in sessions with Supabase, uses Google for sign-in, and uses Anthropic&apos;s Claude API to read screenshots. Each of these handles data under its own policies.</p>

      <h2>Storage and deletion</h2>
      <p>Screenshots may be deleted after they are processed to save storage space. You can ask to have your account and data removed by contacting us{contact ? <> at <a href={`mailto:${contact}`}>{contact}</a></> : <> through your dynasty commissioner</>}.</p>

      <h2>Children</h2>
      <p>Dynasty HQ is not intended for children under 13.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top will be updated.</p>

      <p style={{ marginTop: 28, fontSize: 14 }}><a href="/terms">Terms of Service</a> · <a href="/">Back to Dynasty HQ</a></p>
    </main>
  );
}
