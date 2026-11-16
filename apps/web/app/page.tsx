import Link from "next/link";
import { Lens, Lockup } from "@eyelore/ui";
import { Hero } from "./hero";

export default function Landing() {
  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-24 py-16">
        <Lockup height={22} />
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-32 px-24 pb-64 text-center">
        <Lens shape="circle" scene="sofa" width={280} label="a creator talking to camera" caption="this ring tracks my sleep" />
        <Hero />
        <Link href="/hello" className="el-pill el-pill--secondary" data-testid="see-engine">
          see the engine
        </Link>
      </section>
    </main>
  );
}
