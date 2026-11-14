import { ChevronRight } from 'lucide-react';
import Reveal from './Reveal';
import Badge from './Badge';

const PORTRAIT_URL = 'https://meez.design/web/media/ext/7c6fb70f3e54bac9.webp';

const services = ['AI Automation', 'AI Integration', 'AI Agent Development'];

export default function SectionOne() {
  return (
    <section className="flex min-h-screen flex-col justify-between px-5 pb-12 pt-24 supports-[height:100svh]:min-h-[100svh] sm:px-8 sm:pt-28 md:px-12 md:pb-16">
      <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
        <ul className="flex flex-col gap-2">
          {services.map((service, i) => (
            <Reveal
              as="li"
              key={service}
              delay={150 + i * 120}
              className="font-mono text-xs uppercase tracking-[0.15em] text-white/90 drop-shadow-md"
            >
              / {service}
            </Reveal>
          ))}
        </ul>

        <Reveal
          as="p"
          delay={300}
          className="max-w-xs text-lg leading-relaxed text-white drop-shadow-md sm:text-right sm:text-xl"
        >
          We design automation that brings clarity, precision, and efficiency to the way your company operates.
        </Reveal>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Reveal delay={150} className="mb-5">
            <Badge>We Automate 100+ Businesses</Badge>
          </Reveal>
          <Reveal
            as="h1"
            delay={280}
            className="text-5xl font-normal leading-[1.05] tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl"
          >
            Clear. Precise.
            <br />
            Automated.
          </Reveal>
        </div>

        <Reveal delay={420} className="self-start md:self-auto">
          <div className="flex items-center gap-4 rounded-xl bg-white/15 p-3 backdrop-blur-md">
            <img
              src={PORTRAIT_URL}
              alt="Mitha, co-founder of NovaAI"
              className="h-24 w-20 rounded-lg object-cover"
            />
            <div className="flex flex-col gap-1.5 pr-2">
              <p className="text-sm font-medium text-white">Talk with Mitha</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/60">Co-founder of NovaAI</p>
              <a
                href="#"
                className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors duration-300 hover:bg-white/85"
              >
                Book 15-mins call
                <ChevronRight size={14} />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
