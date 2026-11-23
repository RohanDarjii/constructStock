import Link from "next/link";
import { inter, manrope } from "@/shared/styles/fonts";
import styles from "@/components/auth/auth-layout.module.css";

const steps = [
  { title: "Create a company", text: "Set up the first Owner and choose an organization currency." },
  { title: "Sign in", text: "Access your company workspace as soon as it is created." },
  { title: "Manage operations", text: "Invite your team, assign sites, and organize materials." },
];

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={[styles.shell, inter.variable, manrope.variable].join(" ")}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/"><span aria-hidden="true" className={styles.mark}>C</span>ConstructStock</Link>
      <Link className={styles.back} href="/">Back to main site</Link>
    </header>
    <main className={styles.main}>
      <div className={styles.card}>
        <section className={styles.formPanel}>{children}</section>
        <aside aria-label="Workspace overview" className={styles.infoPanel}>
          <div><span className={styles.kicker}>YOUR WORKSPACE</span><h2>One place for every material decision.</h2></div>
          <p>Start with a company account. Your material history will stay tied to the right organization and site.</p>
          <div className={styles.steps}>{steps.map((step, index) => <div className={styles.step} key={step.title}><span className={styles.stepNumber}>{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></div>)}</div>
          <div className={styles.sample}><div className={styles.sampleTop}><span>ILLUSTRATIVE INVENTORY VIEW</span><span>ONE SITE</span></div><div className={styles.sampleTitle}>Rebar 16 mm · Northgate</div><div className={styles.sampleStats}><div><span>On hand</span><strong>42.5 t</strong></div><div><span>Reserved</span><strong>8.0 t</strong></div><div><span>Available</span><strong>34.5 t</strong></div></div></div>
        </aside>
      </div>
    </main>
  </div>;
}
