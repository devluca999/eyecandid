import type { Metadata } from "next";
import { LegalPage, Section } from "../_legal/legal";

export const metadata: Metadata = { title: "Terms · Eyecandid" };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="2026-11-17">
      <p style={{ margin: 0 }}>
        Eyecandid is a video editor that makes real people look great. By using it you agree to the plain terms below. They are a draft and will be
        reviewed before launch.
      </p>

      <Section title="Your footage is yours">
        <p style={{ margin: 0 }}>
          You keep all rights to what you upload and what you make. You give us permission to store it and process it only to run the edit you
          asked for. Only upload what you have the right to use, and don&apos;t upload anyone&apos;s likeness without their consent.
        </p>
      </Section>

      <Section title="Free and Pro">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Free: clips up to 60 seconds and 200 MB, one edit processing at a time, exports are watermarked, files kept 7 days.</li>
          <li>Pro is by request: clips up to 5 minutes, files kept 30 days. Pro limits and price may change before it opens.</li>
          <li>Free edits can be paused for a day when we reach our daily budget. We say so when it happens.</li>
        </ul>
      </Section>

      <Section title="What not to do">
        <p style={{ margin: 0 }}>
          Don&apos;t upload anything illegal, don&apos;t use the service to harass or impersonate people, and don&apos;t try to get around the limits
          (automated uploads, many sessions, scraping). We may refuse or remove work that does.
        </p>
      </Section>

      <Section title="Files expire">
        <p style={{ margin: 0 }}>
          Uploaded clips, proxies and exports are deleted on a schedule (see privacy). Download what you want to keep. We can&apos;t restore deleted files.
        </p>
      </Section>

      <Section title="No promises about the machine">
        <p style={{ margin: 0 }}>
          Automatic cuts and captions can be wrong. Check your export before you publish it. The service is provided as is, may be unavailable at
          times, and to the extent the law allows we aren&apos;t liable for lost footage or lost income.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p style={{ margin: 0 }}>
          We will change these terms as the product changes and update the date above. A contact address is to be added before launch.
        </p>
      </Section>
    </LegalPage>
  );
}
