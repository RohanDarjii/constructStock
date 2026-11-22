import type { ReactNode } from "react";
import Link from "next/link";
import { inter, manrope } from "@/shared/styles/fonts";
import styles from "./landing-page.module.css";

type IconName = "sites" | "ledger" | "waste" | "transfer" | "check" | "box";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    sites: <><rect x="3" y="9" width="7" height="12" rx="1" /><rect x="10" y="3" width="11" height="18" rx="1" /><path d="M6 13h1m-1 4h1m8-10h1m-1 4h1m-1 4h1m-1 4h1" /></>,
    ledger: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    waste: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></>,
    transfer: <><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    box: <><path d="m12 2 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V7M12 12v10" /></>,
  };
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function Brand() {
  return <Link aria-label="ConstructStock home" className={styles.brand} href="/"><svg aria-hidden="true" fill="none" viewBox="0 0 36 36"><rect fill="#144227" height="36" rx="9" width="36" /><path d="M9 12.5 18 8l9 4.5-9 4.5-9-4.5Zm0 5.5 9 4.5 9-4.5M9 23.5l9 4.5 9-4.5" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg><span>ConstructStock</span></Link>;
}

const benefits: { icon: IconName; title: string; text: string }[] = [
  { icon: "sites", title: "One view across sites", text: "See where materials are held and what is available at each project." },
  { icon: "ledger", title: "A traceable stock ledger", text: "Follow receipts, issues, wastage, transfers, and corrections." },
  { icon: "transfer", title: "Stock with a clear state", text: "Separate on-hand, reserved, available, and in-transit quantities." },
  { icon: "waste", title: "Waste you can account for", text: "Record damaged and wasted materials with reasons and site context." },
];
const steps = [
  { title: "Purchase", text: "Order materials for a site." },
  { title: "Receive", text: "Record full or partial deliveries." },
  { title: "Track", text: "See stock by material and batch." },
  { title: "Use", text: "Issue and consume materials." },
  { title: "Move", text: "Transfer stock between sites." },
  { title: "Review", text: "Understand waste and activity." },
];
const roles = [
  { title: "Owners & admins", text: "See company-wide inventory, sites, purchasing, transfers, and reports." },
  { title: "Site managers", text: "Manage materials, requests, and activity for their assigned sites." },
  { title: "Storekeepers", text: "Record deliveries, issues, wastage, and transfer handovers." },
];

function DashboardPreview() {
  return <div aria-label="Illustrative ConstructStock dashboard preview" className={styles.preview} role="group">
    <div className={styles.previewTopbar}><div className={styles.windowDots}><i /><i /><i /></div><span>ConstructStock / Overview</span><span className={styles.previewBadge}>Illustrative preview</span></div>
    <div className={styles.previewBody}>
      <aside aria-hidden="true" className={styles.previewSidebar}>
        <div className={styles.previewSidebarBrand}><span>C</span><b>Workspace</b></div>
        <div className={styles.previewNavActive}><Icon name="sites" /> Overview</div>
        <div className={styles.previewNav}><Icon name="box" /> Inventory</div>
        <div className={styles.previewNav}><Icon name="ledger" /> Purchase orders</div>
        <div className={styles.previewNav}><Icon name="transfer" /> Transfers</div>
        <div className={styles.previewNav}><Icon name="waste" /> Wastage</div>
        <div className={styles.previewSidebarFoot}>SITE VIEW<br /><strong>All sites</strong></div>
      </aside>
      <div className={styles.previewContent}>
        <div className={styles.previewHeading}><div><span>OVERVIEW</span><h3>Material operations</h3></div><div className={styles.siteSelector}><Icon name="sites" /> All sites</div></div>
        <div className={styles.metricGrid}>
          <div className={styles.metric}><span>Materials tracked</span><strong>128</strong><small>Across 4 sites</small></div>
          <div className={styles.metric}><span>Open purchase orders</span><strong>18</strong><small>6 awaiting delivery</small></div>
          <div className={styles.metric}><span>Items below minimum</span><strong>7</strong><small>Review stock levels</small></div>
          <div className={styles.metric}><span>Transfers in transit</span><strong>2</strong><small>Awaiting receipt</small></div>
        </div>
        <div className={styles.previewLower}>
          <div className={styles.tableCard}><div className={styles.cardHeading}><strong>Site inventory</strong><span>Sample data</span></div><div className={styles.tableScroll}><table><thead><tr><th>Material</th><th>Site</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead><tbody>
            <tr><td>Rebar 16 mm</td><td>Northgate</td><td>42.5 t</td><td>8.0 t</td><td>34.5 t</td></tr>
            <tr><td>Portland cement</td><td>Riverside</td><td>360 bags</td><td>80 bags</td><td>280 bags</td></tr>
            <tr><td>Structural timber</td><td>Westside</td><td>24.0 m³</td><td>4.5 m³</td><td>19.5 m³</td></tr>
          </tbody></table></div></div>
          <div className={styles.activityCard}><div className={styles.cardHeading}><strong>Recent activity</strong></div>
            <div className={styles.activityItem}><span><Icon name="box" /></span><div><strong>Delivery recorded</strong><small>Cement · Riverside</small></div></div>
            <div className={styles.activityItem}><span><Icon name="transfer" /></span><div><strong>Transfer dispatched</strong><small>Rebar · Northgate to Westside</small></div></div>
            <div className={styles.activityItem}><span><Icon name="waste" /></span><div><strong>Wastage logged</strong><small>Timber offcuts · Westside</small></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className={styles.sectionIntro}><span className={styles.kicker}>{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>;
}

export default function LandingPage() {
  return <div className={[styles.page, inter.variable, manrope.variable].join(" ")}>
    <header className={styles.header}><div className={styles.headerInner}>
      <Brand />
      <nav aria-label="Main navigation" className={styles.desktopNav}><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#sites">Across sites</a><a href="#roles">For your team</a></nav>
      <div className={styles.headerActions}><Link className={styles.signIn} href="/login">Sign in</Link><Link className={styles.headerCta} href="/register-company">Create workspace</Link></div>
      <details className={styles.mobileMenu}><summary aria-label="Open menu"><span /><span /><span /></summary><nav aria-label="Mobile navigation"><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#sites">Across sites</a><a href="#roles">For your team</a><Link href="/login">Sign in</Link><Link href="/register-company">Create workspace</Link></nav></details>
    </div></header>

    <main>
      <section className={styles.hero}><div className={styles.container}>
        <div className={styles.heroCopy}><span className={styles.eyebrowPill}><span /> CONSTRUCTION MATERIAL CONTROL</span><h1>Know what you have.<br /><em>Know where it goes.</em></h1><p>Bring purchasing, receiving, stock, consumption, wastage, and site transfers into one clear workspace for your construction team.</p><div className={styles.heroActions}><Link className={styles.primaryButton} href="/register-company">Create workspace</Link><a className={styles.secondaryButton} href="#product">Explore the product</a></div><span className={styles.heroNote}>Built for teams managing materials across multiple sites.</span></div>
        <DashboardPreview />
      </div></section>

      <section aria-label="Product benefits" className={styles.benefits} id="product"><div className={styles.container}><div className={styles.benefitGrid}>{benefits.map((benefit) => <article className={styles.benefitCard} key={benefit.title}><span className={styles.iconTile}><Icon name={benefit.icon} /></span><h2>{benefit.title}</h2><p>{benefit.text}</p></article>)}</div></div></section>

      <section className={styles.section} id="workflow"><div className={styles.container}><SectionHeading eyebrow="ONE CONNECTED WORKFLOW" title="From purchase order to the last unit used." text="Follow each material through the everyday decisions that shape a project's stock." /><div className={styles.steps}>{steps.map((step, index) => <div className={styles.step} key={step.title}><span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span><strong>{step.title}</strong><p>{step.text}</p></div>)}</div></div></section>

      <section className={styles.tonalSection}><div className={styles.container}><div className={styles.featureGrid}>
        <div className={styles.featureCopy}><span className={styles.kicker}>INVENTORY WITH CONTEXT</span><h2>A useful answer to “what&apos;s available?”</h2><p>See physical stock alongside reservations and stock in transit, with batch history behind every movement. Teams can plan with the quantity they can actually use.</p><ul><li><Icon name="check" /> Site-level material visibility</li><li><Icon name="check" /> Batch-based stock records</li><li><Icon name="check" /> A ledger of every movement and correction</li></ul></div>
        <div className={styles.stockCard}><div className={styles.stockCardTop}><div><span className={styles.cardOverline}>MATERIAL SNAPSHOT · SAMPLE DATA</span><h3>Rebar 16 mm</h3><p>Northgate Tower · tonnes</p></div><span className={styles.stockTag}>In stock</span></div><div className={styles.stockTotal}><span>Available to issue</span><strong>34.5 <small>t</small></strong></div><div className={styles.stockBar}><span /></div><div className={styles.stockBreakdown}><div><span>On hand</span><strong>42.5 t</strong></div><div><span>Reserved</span><strong>8.0 t</strong></div><div><span>In transit</span><strong>3.0 t</strong></div></div><div className={styles.stockCardFoot}><Icon name="ledger" /> Every change has a recorded transaction</div></div>
      </div></div></section>

      <section className={styles.section}><div className={styles.container}><div className={styles.featureGrid}>
        <div className={styles.purchaseCard}><div className={styles.purchaseTop}><span className={styles.cardOverline}>PURCHASE ORDER · SAMPLE DATA</span><span className={styles.purchaseStatus}>Partially received</span></div><h3>PO #1042</h3><p className={styles.purchaseSubtitle}>Portland cement · Riverside site</p><div className={styles.progressLabels}><span>Delivery progress</span><strong>60%</strong></div><div className={styles.progressTrack}><span /></div><div className={styles.purchaseStats}><div><span>Ordered</span><strong>500 bags</strong></div><div><span>Received</span><strong>300 bags</strong></div><div><span>Remaining</span><strong>200 bags</strong></div></div><div className={styles.purchaseFoot}>Multiple deliveries, one clear order history</div></div>
        <div className={styles.featureCopy}><span className={styles.kicker}>PURCHASING & RECEIVING</span><h2>Know what was ordered, and what actually arrived.</h2><p>Keep purchase orders connected to deliveries and site stock. Record partial receipts as they happen, so the outstanding quantity stays visible.</p><ul><li><Icon name="check" /> Purchase orders tied to sites and suppliers</li><li><Icon name="check" /> Full and partial receiving</li><li><Icon name="check" /> Stock updated when a delivery is recorded</li></ul></div>
      </div></div></section>

      <section className={styles.tonalSection} id="sites"><div className={styles.container}><SectionHeading eyebrow="BETTER USE OF MATERIALS" title="Move surplus. Record waste. Keep the story intact." text="Transfers and wastage are part of the same material history, with clear steps and site accountability." /><div className={styles.doubleCards}><article className={styles.operationCard}><span className={styles.iconTile}><Icon name="transfer" /></span><h3>Transfers between sites</h3><p>Request stock, approve and reserve it, dispatch it into transit, then receive it at the destination.</p><div className={styles.transferSteps}><span>Requested</span><span>Approved</span><span>Dispatched</span><span>Received</span></div></article><article className={styles.operationCard}><span className={styles.iconTile}><Icon name="waste" /></span><h3>Wastage with a reason</h3><p>Record material damage, loss, or waste against the site and material. Review where waste is happening and why.</p><div className={styles.wasteExample}><span>Example record</span><strong>Timber offcuts</strong><small>Westside · Cutting waste</small></div></article></div></div></section>

      <section className={styles.section} id="roles"><div className={styles.container}><SectionHeading eyebrow="MADE FOR THE WHOLE TEAM" title="The right view for each role." text="Company roles and site assignments keep everyday work connected to the people responsible for it." /><div className={styles.roleGrid}>{roles.map((role) => <article className={styles.roleCard} key={role.title}><span className={styles.roleLine} /><h3>{role.title}</h3><p>{role.text}</p></article>)}</div></div></section>

      <section className={styles.finalCta}><div className={styles.container}><span className={styles.kicker}>CONSTRUCTSTOCK</span><h2>Bring clarity to every construction site.</h2><p>One place to understand your materials, movements, and waste across the company.</p><div className={styles.finalActions}><Link className={styles.lightButton} href="/register-company">Create workspace</Link><Link className={styles.darkOutlineButton} href="/login">Sign in</Link></div></div></section>
    </main>

    <footer className={styles.footer}><div className={styles.container}><div className={styles.footerMain}><div><Brand /><p>Construction material inventory and waste management, together in one workspace.</p></div><nav aria-label="Footer navigation"><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#sites">Across sites</a><Link href="/login">Sign in</Link></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} ConstructStock</span><span>Built for clearer material decisions.</span></div></div></footer>
  </div>;
}
