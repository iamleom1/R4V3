import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Briefcase,
  ChevronRight,
  Download,
  Layers3,
  Linkedin,
  Mail,
  MapPin,
  Moon,
  Sun,
  X
} from "lucide-react";

const assetBase = import.meta.env.BASE_URL;
const headshot = `${assetBase}headshot.jpg`;
const resumeHref = `${assetBase}Leonardo_Medina_Resume.pdf`;
const linkedInHref = "https://www.linkedin.com/in/leonardo-medina-391817287";

const projects = [
  {
    id: "r4v3",
    category: "Featured",
    role: "Founder · Product Manager",
    title: "R4V3",
    subtitle: "Event-based social discovery platform",
    blurb:
      "Designed around a simple insight: people are more likely to connect when the context is shared. Instead of profile-first matching, R4V3 centers the event itself.",
    metrics: ["RSVP flow working", "Crew toggle live", "Matching + chat functional"],
    accent: "from-blue-500/20 to-cyan-400/10",
    problem:
      "Most social discovery products are built around profiles, not context. For solo event-goers, especially in live music and rave settings, that creates friction, weak relevance, and a less trustworthy experience.",
    insight:
      "The strongest intent signal is not a swipe — it is showing up. By tying discovery to events users are actually attending, the product can make matching feel more relevant, timely, and natural.",
    decisions: [
      "Made the event the core unit of discovery instead of the user profile.",
      "Linked visibility in matching to a user’s ‘Going’ status to improve relevance.",
      "Added a ‘Looking for Crew’ toggle so users can control how actively they want to be surfaced.",
      "Kept chat event-contextual to reduce noise and support real coordination."
    ],
    tradeoffs: [
      "Prioritized a focused MVP over social breadth.",
      "Curated the event feed instead of showing everything to keep discovery high-signal.",
      "Built around practical coordination and safety rather than generic social browsing."
    ],
    outcome:
      "The current product direction validates the core loop: users can RSVP to events, appear in matching when relevant, and communicate through chat once connected. The next phase is real-user testing and refining ranking, discovery depth, and onboarding."
  },
  {
    id: "dealflow",
    category: "Systems",
    role: "Product / Systems Project",
    title: "Deal Flow Optimization",
    subtitle: "Integrated automotive finance workflow redesign",
    blurb:
      "Mapped how dealership finance work moved across disconnected systems, then redesigned the flow into a single integrated experience focused on speed, accuracy, and fewer handoff failures.",
    metrics: ["Up to 35–50% less touch-time", "Fewer manual re-entry points", "Centralized audit + document flow"],
    accent: "from-blue-600/20 to-slate-400/10",
    problem:
      "Finance managers were moving across multiple disconnected systems to gather customer information, submit lender applications, manage deal tracking, price coverage, generate contracts, and complete registration. The result was duplicated entry, delays, and avoidable errors.",
    insight:
      "The issue was not one bad step — it was the system boundary between steps. The biggest gains would come from reducing transitions, not just improving individual tasks.",
    decisions: [
      "Reframed the problem as workflow integration rather than isolated task optimization.",
      "Designed a centralized system to unify customer data entry, lender submissions, document handling, and registration flow.",
      "Introduced API-driven lender and warranty quote logic instead of repeated manual portal entry.",
      "Added e-contracting and a document repository to reduce paper friction and lost-signature risk."
    ],
    tradeoffs: [
      "Focused scope on the finance workflow instead of broader dealership infrastructure.",
      "Balanced speed gains with compliance needs through audit logging and role-based access concepts.",
      "Designed around operational feasibility rather than speculative feature expansion."
    ],
    outcome:
      "The proposed system reduced duplicate typing, streamlined lender and pricing steps, and created a single source of truth for deal data, documents, and audit activity. The plan estimated a 35% reduction in processing time, with DFD-based analysis indicating a 25–50% cut in touch-time per deal."
  },
  {
    id: "spot",
    category: "Product",
    role: "Product Development Project",
    title: "S.P.O.T.",
    subtitle: "Seat Placement Optimization Technology",
    blurb:
      "Built an MVP concept for a classroom seat-availability system that combined physical signaling, early interface thinking, and go-to-market feasibility.",
    metrics: ["3D modeled prototype", "Roadmap built in phases", "Pricing + breakeven explored"],
    accent: "from-sky-500/20 to-blue-400/10",
    problem:
      "In shared classroom or event settings, people waste time finding open seats and instructors lack simple visual cues for seat availability and engagement.",
    insight:
      "A useful solution had to be visible in the environment itself, not only inside an app. The physical signal and digital layer needed to work together.",
    decisions: [
      "Created a physical prototype using Shapr3D and 3D printing to make the concept tangible early.",
      "Used a UI smoke test to show how users would interpret and interact with the system.",
      "Built a phased roadmap covering validation, beta testing, launch, and later expansion.",
      "Extended the concept beyond classrooms to broader shared-space environments."
    ],
    tradeoffs: [
      "Balanced hardware ambition with early prototyping speed.",
      "Explored outsourcing and cost structure instead of assuming full in-house manufacturing.",
      "Kept the MVP focused on core availability signaling before layering on advanced capabilities."
    ],
    outcome:
      "The project moved beyond idea-stage by pairing prototype development with business feasibility, roadmap planning, and pricing logic. It demonstrated an ability to connect user need, form factor, and product rollout thinking in one concept."
  },
  {
    id: "airbnb",
    category: "Analytics",
    role: "Financial Analysis Project",
    title: "Airbnb Analysis",
    subtitle: "Turning financial statements into strategic insight",
    blurb:
      "Analyzed Airbnb’s balance sheet, income statement, cash flow, and ratios to understand where growth was coming from and how profitability had changed over time.",
    metrics: ["Revenue up 66%", "2021 loss to 2023 profit", "ROA and ROE sharply improved"],
    accent: "from-slate-500/20 to-blue-500/10",
    problem:
      "Financial statements are only useful if they can be translated into operating story, strategic momentum, and business implications.",
    insight:
      "Airbnb’s story was not just revenue growth — it was stronger operating leverage, better profitability, and clearer evidence of scale efficiency.",
    decisions: [
      "Compared trend and common-size statements to isolate the real drivers of change.",
      "Connected liquidity, profitability, and leverage metrics into one narrative.",
      "Focused the analysis on what the numbers implied for business resilience and future positioning."
    ],
    tradeoffs: [
      "Chose clarity and business interpretation over purely technical accounting detail.",
      "Used ratios as decision signals rather than reporting them in isolation."
    ],
    outcome:
      "The work translated Airbnb’s financial performance into a clearer strategic picture: stronger liquidity, meaningful profitability expansion, and evidence that the company had become more efficient and resilient as it scaled."
  },
  {
    id: "poppi",
    category: "Marketing",
    role: "Marketing Analysis Project",
    title: "Poppi Marketing",
    subtitle: "Positioning, segmentation, and consumer perception",
    blurb:
      "Studied how consumers perceived Poppi across health benefits, accessibility, price, transparency, and brand image to identify where positioning was working — and where it was not.",
    metrics: ["Clustered consumer segments", "Affordability friction surfaced", "Positioning opportunities identified"],
    accent: "from-cyan-500/20 to-blue-500/10",
    problem:
      "A brand can have strong awareness and still leave value on the table if its positioning does not align with how different consumers interpret price, taste, health, and accessibility.",
    insight:
      "Poppi’s strength in image and transparency did not automatically solve value perception. The clearer opportunity was not broader messaging — it was sharper segment-specific messaging.",
    decisions: [
      "Combined qualitative and quantitative work to avoid shallow brand commentary.",
      "Used clustering and factor-based interpretation to separate consumer groups.",
      "Framed recommendations around affordability, accessibility, and brand-message alignment."
    ],
    tradeoffs: [
      "Focused on actionable market interpretation instead of generic brand praise.",
      "Balanced consumer psychology with practical marketing decisions."
    ],
    outcome:
      "The project identified where Poppi’s positioning was resonating and where perception gaps remained, especially around value and accessibility, creating a clearer path for targeted messaging and strategic growth."
  },
  {
    id: "research",
    category: "Additional",
    role: "Research Project",
    title: "Psychology Research",
    subtitle: "Reading comprehension and highlighting study",
    blurb:
      "Designed and analyzed a study on how reading level and text highlighting affect comprehension, using a factorial design and ANOVA-based interpretation.",
    metrics: ["2x2 design", "Highlighting main effect found", "Research-to-insight framing"],
    accent: "from-slate-400/20 to-blue-400/10",
    problem:
      "The project examined whether text complexity and highlighting changed reading comprehension, with a focus on what actually improves learning outcomes.",
    insight:
      "Highlighting showed a meaningful effect while text complexity alone did not, reinforcing the importance of instructional strategy over assumption.",
    decisions: [
      "Used an experimental structure instead of anecdotal educational claims.",
      "Focused the write-up on interpretation and implications, not only statistical output."
    ],
    tradeoffs: ["Positioned as supporting analytical work rather than a lead portfolio piece."],
    outcome:
      "This project reinforces my ability to design structured questions, evaluate outcomes, and turn findings into practical recommendations."
  }
] as const;

const experience = [
  {
    period: "Jan 2022 — Present",
    role: "Sales Executive",
    company: "STG Auto Group",
    points: [
      "Handled the full sales cycle from initial customer contact through negotiation, financing, and delivery.",
      "Managed CRM activity to keep leads, notes, and follow-up actions accurate and visible across the team.",
      "Worked closely with desk managers on deal structuring and negotiation write-ups that balanced customer fit with dealership profit."
    ]
  },
  {
    period: "Jun 2021 — Jan 2022",
    role: "Warehouse Team Supervisor",
    company: "UPS",
    points: [
      "Led a 15+ person team in a high-volume logistics environment with tight operational timing.",
      "Adjusted staffing and workflow in real time to maintain service and reduce bottlenecks.",
      "Trained team members on procedures, safety, and consistency across shifts."
    ]
  },
  {
    period: "May 2020 — Jul 2021",
    role: "Creative Content Specialist",
    company: "Montclair Auto Exchange",
    points: [
      "Created vehicle listings and digital content used across online inventory and promotions.",
      "Maintained reusable marketing assets and supported content updates around incoming inventory and pricing changes."
    ]
  }
] as const;

const skills = {
  "Product & Strategy": ["MVP Design", "Systems Analysis", "CRM Optimization", "KPI Tracking", "Marketing Strategy"],
  "Technical & Analytics": ["Python", "R", "SQL", "Excel", "Tableau", "Data Modeling", "Simulation Modeling"],
  Leadership: ["Cross-functional collaboration", "Stakeholder communication", "Customer research", "Coaching", "Training & development"]
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-500 dark:text-blue-300">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
      {children}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeProject = useMemo(() => projects.find((project) => project.id === activeId) ?? null, [activeId]);

  return (
    <div className={dark ? "dark bg-[#06070b] text-white" : "bg-[#f7f9fc] text-[#0f172a]"}>
      <div className="min-h-screen overflow-x-hidden transition-colors duration-300">
        <div className="pointer-events-none fixed inset-0 opacity-80">
          <div className="absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_55%)]" />
          <div className="absolute inset-y-0 right-0 w-[420px] bg-[radial-gradient(circle_at_center,rgba(96,165,250,0.08),transparent_60%)]" />
        </div>

        <header className="sticky top-0 z-40 border-b border-black/5 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-[#06070b]/70">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
            <div>
              <div className="text-sm font-semibold tracking-wide">Leonardo Medina</div>
              <div className="text-xs text-black/55 dark:text-white/55">Product-focused portfolio</div>
            </div>
            <nav className="hidden items-center gap-6 text-sm md:flex">
              <a href="#about" className="text-black/70 transition hover:text-blue-500 dark:text-white/70 dark:hover:text-blue-300">
                About
              </a>
              <a href="#projects" className="text-black/70 transition hover:text-blue-500 dark:text-white/70 dark:hover:text-blue-300">
                Projects
              </a>
              <a href="#experience" className="text-black/70 transition hover:text-blue-500 dark:text-white/70 dark:hover:text-blue-300">
                Experience
              </a>
              <a href="#contact" className="text-black/70 transition hover:text-blue-500 dark:text-white/70 dark:hover:text-blue-300">
                Contact
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <a
                href={resumeHref}
                className="hidden items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(59,130,246,0.25)] transition hover:translate-y-[-1px] md:inline-flex"
              >
                <Download className="h-4 w-4" /> Resume
              </a>
              <a
                href={linkedInHref}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm font-medium text-black/80 transition hover:border-blue-500/30 hover:text-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-blue-400/30 dark:hover:text-blue-300 md:inline-flex"
              >
                <Linkedin className="h-4 w-4" /> LinkedIn
              </a>
              <button
                onClick={() => setDark((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/80 text-black transition hover:border-blue-500/30 hover:text-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-blue-400/30 dark:hover:text-blue-300"
                aria-label="Toggle theme"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10">
          <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-16 pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:pb-24 lg:pt-20">
            <div className="max-w-3xl">
              <SectionLabel>Open to PM · PMM · Technical PM</SectionLabel>
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl"
              >
                Building products around user behavior, workflow clarity, and practical execution.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.08 }}
                className="mt-6 max-w-2xl text-lg leading-8 text-black/65 dark:text-white/68"
              >
                MBA candidate with experience across automotive operations, systems analysis, analytics, and early-stage product work. I focus on turning messy processes and user needs into clearer, more useful product decisions.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.16 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <a
                  href="#projects"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-medium text-white shadow-[0_12px_40px_rgba(59,130,246,0.28)] transition hover:translate-y-[-1px]"
                >
                  View selected work <ArrowUpRight className="h-4 w-4" />
                </a>
                <a
                  href={resumeHref}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-black/80 transition hover:border-blue-500/30 hover:text-blue-500 dark:border-white/10 dark:text-white/80 dark:hover:border-blue-400/30 dark:hover:text-blue-300"
                >
                  <Download className="h-4 w-4" /> Download resume
                </a>
                <a
                  href={linkedInHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-black/80 transition hover:border-blue-500/30 hover:text-blue-500 dark:border-white/10 dark:text-white/80 dark:hover:border-blue-400/30 dark:hover:text-blue-300"
                >
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </a>
              </motion.div>

              <div className="mt-12 grid gap-4 sm:grid-cols-3">
                {[
                  ["Customer insight", "Grounded in real-world buyer behavior and workflow friction"],
                  ["Systems thinking", "Strong fit for process-heavy, multi-step product problems"],
                  ["Execution mindset", "Comfortable moving from concept to structured MVP direction"]
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="rounded-3xl border border-black/6 bg-white/65 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-none"
                  >
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="mt-2 text-sm leading-6 text-black/60 dark:text-white/60">{copy}</div>
                  </div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-transparent to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-black/8 bg-white/70 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <img src={headshot} alt="Leonardo Medina" className="h-[520px] w-full rounded-[1.5rem] object-cover object-center" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-black/6 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="text-xs uppercase tracking-[0.18em] text-black/45 dark:text-white/45">Focus</div>
                    <div className="mt-2 text-sm font-medium">Product Management · Product Marketing · Technical PM</div>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="text-xs uppercase tracking-[0.18em] text-black/45 dark:text-white/45">Based in</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-blue-500" /> Southern California
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          <section id="about" className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-14">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <SectionLabel>About</SectionLabel>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                  A product-minded operator moving from frontline experience into product roles.
                </h2>
              </div>
              <div className="space-y-5 text-base leading-8 text-black/68 dark:text-white/68">
                <p>
                  I’m an MBA candidate with a background in automotive sales and operations, focused on transitioning into product management and product marketing roles. My experience comes from working directly with customers in fast-paced environments, where I’ve learned how to identify needs, navigate ambiguity, and drive outcomes.
                </p>
                <p>
                  I’ve applied that perspective across both digital and systems-focused work — from designing an event-based social platform built around real user behavior to mapping dealership finance workflows and redesigning them into a more integrated product experience.
                </p>
                <p>
                  I’m especially interested in product roles where customer insight, data, and execution all matter — the kind of work where better decisions lead to better systems and better user experiences.
                </p>
              </div>
            </div>
          </section>

          <section id="projects" className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <SectionLabel>Selected Work</SectionLabel>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Detailed case studies, not just project summaries.</h2>
              </div>
              <p className="max-w-xl text-sm leading-7 text-black/60 dark:text-white/60">
                Each project is framed around problem definition, product judgment, and what I chose to prioritize — the same way I want to talk about work in PM interviews.
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              {projects.map((project, index) => (
                <motion.button
                  key={project.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.45, delay: index * 0.04 }}
                  onClick={() => setActiveId(project.id)}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-black/6 bg-white/75 p-6 text-left shadow-[0_12px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:border-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:shadow-none"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${project.accent} opacity-0 transition duration-300 group-hover:opacity-100`} />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-black/45 dark:text-white/45">{project.category}</div>
                        <h3 className="mt-3 text-2xl font-semibold tracking-tight">{project.title}</h3>
                        <div className="mt-2 text-sm text-blue-500 dark:text-blue-300">{project.subtitle}</div>
                      </div>
                      <div className="rounded-full border border-black/8 bg-white/90 p-2 dark:border-white/10 dark:bg-white/5">
                        <ChevronRight className="h-4 w-4 text-blue-500 dark:text-blue-300" />
                      </div>
                    </div>
                    <p className="mt-5 max-w-xl text-sm leading-7 text-black/63 dark:text-white/63">{project.blurb}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {project.metrics.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-xs text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>

          <section id="experience" className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <SectionLabel>Experience</SectionLabel>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Work that shaped how I think about users, process, and execution.
                </h2>
              </div>
              <div className="space-y-5">
                {experience.map((item) => (
                  <div key={item.company} className="rounded-[1.5rem] border border-black/6 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-300">
                          <Briefcase className="h-4 w-4" /> {item.role}
                        </div>
                        <h3 className="mt-2 text-xl font-semibold">{item.company}</h3>
                      </div>
                      <div className="text-sm text-black/50 dark:text-white/50">{item.period}</div>
                    </div>
                    <ul className="mt-5 space-y-3 text-sm leading-7 text-black/65 dark:text-white/65">
                      {item.points.map((point) => (
                        <li key={point} className="flex gap-3">
                          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /> <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-20">
            <div className="grid gap-6 lg:grid-cols-3">
              {Object.entries(skills).map(([group, items]) => (
                <div key={group} className="rounded-[1.75rem] border border-black/6 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Layers3 className="h-4 w-4 text-blue-500" /> {group}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {items.map((item) => (
                      <span key={item} className="rounded-full border border-black/8 px-3 py-1.5 text-xs text-black/70 dark:border-white/10 dark:text-white/70">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="contact" className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-8">
            <div className="overflow-hidden rounded-[2rem] border border-blue-500/20 bg-gradient-to-br from-blue-500 via-blue-600 to-slate-900 p-px shadow-[0_20px_80px_rgba(59,130,246,0.18)]">
              <div className="rounded-[calc(2rem-1px)] bg-white px-8 py-10 dark:bg-[#09111f] sm:px-10 lg:px-12">
                <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div>
                    <SectionLabel>Contact</SectionLabel>
                    <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                      Open to product opportunities where customer insight and execution both matter.
                    </h2>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-black/65 dark:text-white/65">
                      I’m actively building toward PM, PMM, and Technical PM roles. If you’re hiring for work that sits at the intersection of product thinking, systems clarity, and customer understanding, I’d be glad to connect.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                    <a
                      href="mailto:Medina.Leonardo41@gmail.com"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-medium text-white"
                    >
                      <Mail className="h-4 w-4" /> Email
                    </a>
                    <a
                      href={linkedInHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium dark:border-white/10"
                    >
                      <Linkedin className="h-4 w-4" /> LinkedIn
                    </a>
                    <a
                      href={resumeHref}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium dark:border-white/10"
                    >
                      <Download className="h-4 w-4" /> Resume
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <AnimatePresence>
          {activeProject ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
              onClick={() => setActiveId(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                onClick={(event) => event.stopPropagation()}
                className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-black/8 bg-[#f8fbff] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] dark:border-white/10 dark:bg-[#07111e] sm:p-8"
              >
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-blue-500 dark:text-blue-300">{activeProject.category}</div>
                    <h3 className="mt-3 text-3xl font-semibold tracking-tight">{activeProject.title}</h3>
                    <div className="mt-2 text-sm text-black/55 dark:text-white/55">
                      {activeProject.role} · {activeProject.subtitle}
                    </div>
                  </div>
                  <button onClick={() => setActiveId(null)} className="rounded-full border border-black/10 p-2 dark:border-white/10" aria-label="Close modal">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-8 grid gap-6 sm:grid-cols-3">
                  {activeProject.metrics.map((metric) => (
                    <div key={metric} className="rounded-2xl border border-black/6 bg-white/80 p-4 text-sm dark:border-white/10 dark:bg-white/5">
                      {metric}
                    </div>
                  ))}
                </div>

                <div className="mt-8 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-6">
                    <div>
                      <div className="text-sm font-semibold text-blue-500 dark:text-blue-300">Problem</div>
                      <p className="mt-2 text-sm leading-7 text-black/68 dark:text-white/68">{activeProject.problem}</p>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-blue-500 dark:text-blue-300">Insight</div>
                      <p className="mt-2 text-sm leading-7 text-black/68 dark:text-white/68">{activeProject.insight}</p>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-blue-500 dark:text-blue-300">Outcome</div>
                      <p className="mt-2 text-sm leading-7 text-black/68 dark:text-white/68">{activeProject.outcome}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <div className="text-sm font-semibold text-blue-500 dark:text-blue-300">Key decisions</div>
                      <ul className="mt-3 space-y-3 text-sm leading-7 text-black/68 dark:text-white/68">
                        {activeProject.decisions.map((item) => (
                          <li key={item} className="flex gap-3">
                            <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /> <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-blue-500 dark:text-blue-300">Tradeoffs</div>
                      <ul className="mt-3 space-y-3 text-sm leading-7 text-black/68 dark:text-white/68">
                        {activeProject.tradeoffs.map((item) => (
                          <li key={item} className="flex gap-3">
                            <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /> <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
