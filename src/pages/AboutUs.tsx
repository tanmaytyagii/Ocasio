import { Target, Eye, Heart, Check } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { KhushiIllustration, TanmayIllustration } from '../components/about/TeamIllustrations';

/**
 * About page.
 *
 * The two portraits used to be Unsplash photographs of strangers, captioned
 * with the names of the two real people who built this. They are now drawn
 * illustrations (see TeamIllustrations) — obviously representations rather than
 * photographs, which is the honest way to give a two-person team a face.
 *
 * Names, roles and skills are exactly as they were. Mission and Vision keep
 * their original wording. Values are stated as principles, not as achievements,
 * and nothing on this page claims a customer, a vendor count, funding, an award
 * or a statistic, because none of those exist.
 */
const TEAM = [
  {
    name: 'Khushi Saroha',
    role: 'Project Leader',
    skills: ['AI Developer', 'Backend Developer'],
    Illustration: KhushiIllustration,
  },
  {
    name: 'Tanmay Tyagi',
    role: 'Technical Lead',
    skills: ['AI Developer', 'Backend Developer'],
    Illustration: TanmayIllustration,
  },
];

/** Principles the team works to — deliberately not phrased as results. */
const VALUES = [
  'People first',
  'Trust through transparency',
  'Continuous improvement',
  'Celebrating meaningful events',
];

const BELIEFS = [
  {
    icon: Target,
    title: 'Mission',
    body: 'At Ocasio, we strive to simplify the event planning process by connecting people with the best vendors across India. Our platform brings together carefully curated professionals who share our commitment to excellence and customer satisfaction.',
  },
  {
    icon: Eye,
    title: 'Vision',
    body: "We envision becoming India's leading event vendor marketplace, where finding and booking the perfect vendors for any occasion is just a few clicks away. Through technology and innovation, we aim to transform how events are planned and executed across the country.",
  },
];

const AboutUs = () => {
  usePageMeta(
    'About Ocasio — the people behind the platform',
    'Ocasio is built by a small team working on how events get planned and booked in India.',
  );

  return (
    <div className="relative overflow-hidden bg-canvas">
      {/* Atmosphere, at the strength the rest of the product uses: felt, not
          seen. Two soft lavender fields, nothing else. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-24 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgb(147_51_234_/_0.09)_0%,rgb(147_51_234_/_0.03)_48%,transparent_72%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 top-[26rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgb(196_181_253_/_0.16)_0%,rgb(196_181_253_/_0.05)_46%,transparent_72%)] blur-2xl"
      />

      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <section className="shell relative pb-[clamp(3rem,5vw,4.5rem)] pt-[clamp(3rem,6vw,6rem)] text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
          About Ocasio
        </p>

        <h1 className="mx-auto mt-5 max-w-[16ch] text-[clamp(2.125rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">
          People behind the platform
        </h1>

        {/* A drawn underline rather than a border: the same hand as the
            illustrations, and it sits under the headline instead of boxing it. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 220 12"
          className="mx-auto mt-6 h-3 w-40 text-brand-300"
        >
          <path
            d="M4 8 C60 1 160 1 216 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>

        <p className="mx-auto mt-7 max-w-[42rem] text-[clamp(1rem,1.4vw,1.125rem)] leading-relaxed text-ink-soft">
          We&rsquo;re a team of passionate individuals dedicated to revolutionizing the event
          planning industry in India through technology and innovation.
        </p>
      </section>

      {/* ── team ─────────────────────────────────────────────────────────── */}
      <section className="shell relative pb-[clamp(4rem,7vw,7rem)]" aria-labelledby="team-heading">
        <h2 id="team-heading" className="sr-only">
          The team
        </h2>

        {/*
          Three columns at xl so the cards stay centred and the two editorial
          notes balance them. Below that the notes are dropped entirely rather
          than reflowed — they are composition, and stacked above a card they
          would read as content.
        */}
        <div className="grid items-center gap-10 xl:grid-cols-[minmax(0,12rem)_minmax(0,44rem)_minmax(0,12rem)] xl:justify-center">
          <p className="hidden text-right text-[0.9375rem] leading-[2] text-muted xl:block">
            Ideas
            <br />
            People
            <br />
            <span className="relative inline-block text-ink">
              Events
              <svg
                aria-hidden="true"
                viewBox="0 0 80 8"
                className="absolute -bottom-1 left-0 h-2 w-full text-brand-300"
              >
                <path
                  d="M3 5 C22 1 58 1 77 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </p>

          <ul className="mx-auto grid w-full max-w-[44rem] gap-6 sm:grid-cols-2 sm:gap-8">
            {TEAM.map(({ name, role, skills, Illustration }) => (
              <li
                key={name}
                className="group flex flex-col overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-card transition-shadow duration-300 hover:shadow-card-hover"
              >
                <div className="border-b border-line bg-brand-50/70">
                  <Illustration className="block h-auto w-full" />
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-[1.1875rem] font-semibold text-ink">{name}</h3>
                  <p className="mt-1 text-[0.9375rem] font-medium text-brand-700">{role}</p>

                  <ul className="mt-4 flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <li
                        key={skill}
                        className="rounded-full border border-line bg-canvas px-3 py-1 text-[0.8125rem] text-ink-soft"
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>

          <p className="hidden max-w-[11rem] text-[0.9375rem] leading-relaxed text-muted xl:block">
            Building better events, together.
          </p>
        </div>
      </section>

      {/* ── what we believe ──────────────────────────────────────────────── */}
      <section
        className="relative border-t border-line bg-surface py-[clamp(4rem,7vw,7rem)]"
        aria-labelledby="beliefs-heading"
      >
        <div className="shell">
          <header className="max-w-2xl">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
              What we believe
            </p>
            <h2 id="beliefs-heading" className="mt-3 text-display-sm text-ink">
              Mission, vision and values
            </h2>
          </header>

          {/*
            Dividers come from the grid, not from a card around each column, so
            the section reads as one surface with three parts rather than three
            boxes. They are dropped when the columns stack, where a vertical
            rule would sit between nothing.
          */}
          <div className="mt-[clamp(2.5rem,4vw,3.5rem)] grid gap-x-10 gap-y-12 md:grid-cols-3 md:divide-x md:divide-line">
            {BELIEFS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="md:px-10 md:first:pl-0 md:last:pr-0">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[1.1875rem] font-semibold text-ink">{title}</h3>
                <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted">
                  {body}
                </p>
              </div>
            ))}

            <div className="md:px-10 md:first:pl-0 md:last:pr-0">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                <Heart className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-[1.1875rem] font-semibold text-ink">Values</h3>
              <ul className="mt-3 space-y-2.5">
                {VALUES.map((value) => (
                  <li key={value} className="flex items-start gap-2.5 text-[0.9375rem] text-muted">
                    <Check
                      className="mt-[0.2rem] h-4 w-4 shrink-0 text-brand-600"
                      aria-hidden="true"
                    />
                    {value}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutUs;
