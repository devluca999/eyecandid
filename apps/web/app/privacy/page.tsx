import type { Metadata } from "next";
import { LegalPage, Section } from "../_legal/legal";

export const metadata: Metadata = { title: "Privacy · Eyecandid" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="2026-11-17">
      <p style={{ margin: 0 }}>
        Short version: when your browser can run the edit itself, your clip isn&apos;t uploaded at all. When it can&apos;t, we keep the clip so
        you can come back to it and delete the video files on a schedule. Either way we keep the edit itself, and you can delete it at any time.
        This page says what that means.
      </p>

      <Section title="What we store">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><b>Clips you upload</b> and the low-res copy (proxy) the editor makes from them.</li>
          <li><b>Your edit</b>: one document per project (cuts, captions, framing), its title (taken from the file name), and the list of changes made to it.</li>
          <li><b>Exports</b> you render.</li>
          <li><b>Which automatic cuts you undo or add</b> (timings only, no words), kept to improve the cuts and deleted with the edit.</li>
          <li><b>Emails</b>, only when you give one: a request for Pro access, a "tell me when it's ready" email, or an account.</li>
          <li><b>A random session id</b> kept in your browser so your edits are yours without signing up. It is a key to your edits: don&apos;t share it.</li>
        </ul>
      </Section>

      <Section title="How long">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Uploaded clips and proxies: <b>7 days</b> on Free, <b>30 days</b> with Pro. A daily job deletes them.</li>
          <li>Exports: <b>30 days</b>.</li>
          <li>The edit document and its change log stay until you delete the edit. After the video files expire, the edit is still there but the footage is not.</li>
          <li>Requests for access and account emails stay until you ask us to remove them.</li>
        </ul>
      </Section>

      <Section title="Deleting">
        <p style={{ margin: 0 }}>
          The delete button in the editor removes the edit for good: the project, its change log, exports, jobs, and every stored file (clip, proxy,
          renders). There is no undo. Deleting an account removes the email we hold for it.
        </p>
      </Section>

      <Section title="Edits done on your device">
        <p style={{ margin: 0 }}>
          Some editing runs in your browser. A clip edited that way is not uploaded: it stays on your device unless you choose to send it for a server
          edit.
        </p>
      </Section>

      <Section title="Analytics">
        <p style={{ margin: 0 }}>
          We count steps in the flow (landing viewed, clip dropped, preview ready, export done) to see whether the product works. Events carry a
          hash of the session id, never the id itself, and never clip content, filenames or transcripts. Page views are counted by Vercel Web
          Analytics. We don&apos;t sell data and we don&apos;t run ad trackers.
        </p>
      </Section>

      <Section title="Who handles it for us">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><b>Vercel</b> hosts the website.</li>
          <li><b>Convex</b> stores the data and the files.</li>
          <li><b>Modal</b> runs the processing (transcription, cutting, rendering) on your clip while a job runs.</li>
          <li>When switched on: <b>Clerk</b> for sign-in, <b>Stripe</b> for payment (we never see card numbers), <b>SendPulse</b> to send the emails above, and <b>Sentry</b> to receive error reports (error text and the kind of job, not clip content).</li>
        </ul>
      </Section>

      <Section title="Rate limiting">
        <p style={{ margin: 0 }}>
          To stop abuse we keep a salted hash of your network address, only to count how often something is asked, in one-hour windows that are
          cleared after a day. The address itself is not stored.
        </p>
      </Section>

      <Section title="Contact">
        <p style={{ margin: 0 }}>A contact address for privacy requests is to be added before launch.</p>
      </Section>
    </LegalPage>
  );
}
