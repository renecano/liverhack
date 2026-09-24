"use client";

import { useState } from "react";
import { MessageSquare, X, Send, ChevronDown } from "lucide-react";

export function AsistenteHM() {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState<{rol: "user" | "ia", texto: string}[]>([
    {
      rol: "ia",
      texto: "¡Hola! Soy tu asistente de LivHire. Pregúntame '¿qué tengo que hacer hoy?' o cualquier duda sobre tus procesos pendientes."
    }
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mensaje.trim()) return;

    // Agregar mensaje del usuario
    setMensajes((prev) => [...prev, { rol: "user", texto: mensaje }]);
    
    // Simular respuesta de IA (en el futuro se conecta a lib/ia)
    setTimeout(() => {
      setMensajes((prev) => [...prev, {
        rol: "ia",
        texto: "Tienes 2 tareas prioritarias:\n\n1. 🔴 Atrasado: Elegir perfiles para 'Gerente E-commerce'.\n2. 🟡 En riesgo: Validar no negociables de 'Analista Jr'.\n\n¿Quieres ir a la sección de pendientes?"
      }]);
    }, 1000);

    setMensaje("");
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {/* Botón flotante para abrir chat */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="flex items-center gap-2 bg-black hover:bg-zinc-800 text-white px-5 py-3 rounded-full shadow-lg transition-transform hover:scale-105"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="font-medium text-sm">Asistente HM</span>
        </button>
      )}

      {/* Ventana de chat */}
      {abierto && (
        <div className="bg-white w-[350px] h-[500px] flex flex-col rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden transition-all duration-300 transform scale-100 opacity-100 origin-bottom-left">
          {/* Header */}
          <div className="bg-black text-white px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <h3 className="font-medium text-sm">Asistente HM (Copiloto)</h3>
            </div>
            <button onClick={() => setAbierto(false)} className="hover:bg-zinc-800 p-1 rounded-md transition-colors">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Área de mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50">
            {mensajes.map((msg, i) => (
              <div key={i} className={`flex ${msg.rol === "user" ? "justify-end" : "justify-start"}`}>
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    msg.rol === "user" 
                      ? "bg-black text-white rounded-tr-sm" 
                      : "bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.texto}
                </div>
              </div>
            ))}
          </div>

          {/* Input de texto */}
          <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-3 bg-white flex gap-2">
            <input
              type="text"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Ej. ¿Qué tengo que hacer hoy?"
              className="flex-1 bg-zinc-100 border-transparent rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
            />
            <button
              type="submit"
              disabled={!mensaje.trim()}
              className="bg-black text-white p-2 rounded-full hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
