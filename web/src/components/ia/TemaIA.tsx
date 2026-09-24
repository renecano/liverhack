import "./tema.css";

// Tema de las vistas de candidatos (Persona B) DENTRO del AppShell de Persona A:
// solo tipografías y utilidades; la paleta, la cabecera, la navegación y la sesión
// son del shell (app/globals.css, app/hm/layout.tsx, app/at/layout.tsx).
export function TemaIA({ children }: { children: React.ReactNode }) {
  return <div className="lh-shell">{children}</div>;
}
