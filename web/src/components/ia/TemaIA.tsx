import "./tema.css";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz", "SOFT"] });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data" });

// Tema de las vistas de candidatos (Persona B) DENTRO del AppShell de Persona A:
// solo variables de color y tipografías; la cabecera, la navegación y la sesión
// son del shell (app/hm/layout.tsx, app/at/layout.tsx).
export function TemaIA({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${sans.variable} ${mono.variable} lh-shell`}>{children}</div>;
}
