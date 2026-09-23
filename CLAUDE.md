# CLAUDE.md

Antes de cualquier tarea, lee AGENTS.md y todos los archivos de docs/ (00 a 07).
Respeta las reglas de oro de AGENTS.md. Arquitectura: monolito Next.js en /web
con módulos server-side en web/src/lib/{supabase,orquestador,sla,ia,acciones};
Supabase para BD/auth/realtime/storage; MCP server es P2 (proceso aparte).
