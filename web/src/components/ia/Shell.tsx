import Link from "next/link";
import "./tema.css";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "SOFT"] });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data" });

const NAV = [
  { href: "/hm/candidatos", label: "Candidatos" },
  { href: "/at/carga", label: "Cargar candidato" },
];

// Marco común de las vistas de candidatos (Persona B). Tema propio: papel
// cálido + tinta, acento rosa Liverpool solo para lo accionable.
export function Shell({ rol, children }: { rol: "HM" | "AT"; children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${sans.variable} ${mono.variable} lh-shell min-h-screen`}>
      <header className="border-b border-[var(--lh-rule)] bg-[var(--lh-paper)]/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-6 py-3">
          <Link href="/hm/candidatos" className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">LivHire</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--lh-muted)]">Atracción de talento</span>
          </Link>
          <nav className="flex gap-5 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-[var(--lh-ink-2)] hover:text-[var(--lh-accent)]">
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto rounded-sm border border-[var(--lh-rule)] px-2 py-0.5 font-[family-name:var(--font-data)] text-[11px] text-[var(--lh-muted)]">
            vista {rol}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
    </div>
  );
}
