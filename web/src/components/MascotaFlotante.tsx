"use client";

import { useState } from "react";
import Image from "next/image";

export function MascotaFlotante() {
  const [mostrarNotificacion, setMostrarNotificacion] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Burbuja de notificación */}
      {mostrarNotificacion && (
        <div 
          className="relative max-w-[250px] bg-white p-4 rounded-2xl shadow-lg border border-zinc-100 text-sm text-zinc-700 transition-all duration-300 transform scale-100 opacity-100"
        >
          ¡Hola! Tienes tareas pendientes en el ecosistema
          
          {/* Triangulito (flecha) apuntando a la mascota */}
          <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white border-b border-r border-zinc-100 transform rotate-45 shadow-[2px_2px_2px_-1px_rgba(0,0,0,0.05)]"></div>
        </div>
      )}

      {/* Mascota GIF */}
      <div 
        onClick={() => setMostrarNotificacion(!mostrarNotificacion)}
        className="relative w-20 h-20 bg-white/50 rounded-full shadow-sm flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
      >
        <Image
          src="/Mascota.gif"
          alt="Mascota asistente"
          width={80}
          height={80}
          unoptimized // CRÍTICO: Para evitar que Next.js congele el GIF
          className="object-contain drop-shadow-md rounded-full"
        />
      </div>
    </div>
  );
}
