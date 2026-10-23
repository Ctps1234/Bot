"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/**
 * Evento que abre a ajuda de atalhos. Despachado pelo botão na barra lateral,
 * para que o recurso seja descobrível sem depender de o usuário adivinhar "?".
 */
export const SHOW_SHORTCUTS_EVENT = "oficina:mostrar-atalhos";

/** Sequência "g" + tecla: navegação entre módulos. */
const GOTO: Record<string, { href: string; label: string }> = {
  d: { href: "/dashboard", label: "Painel" },
  o: { href: "/os", label: "Ordens de serviço" },
  c: { href: "/clientes", label: "Clientes" },
  v: { href: "/veiculos", label: "Veículos" },
  f: { href: "/financeiro", label: "Financeiro" },
  r: { href: "/relatorios", label: "Relatórios" },
  s: { href: "/configuracoes", label: "Configurações" },
};

/** Janela (ms) para completar a sequência iniciada por "g". */
const SEQUENCE_TIMEOUT = 1200;

/** Verdadeiro quando o foco está em um campo editável. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-slate-50 px-1.5 font-sans text-[11px] font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.08)]">
      {children}
    </kbd>
  );
}

/**
 * Atalhos de teclado globais, pensados para o balcão: abrir OS sem tirar a mão
 * do teclado, pular entre módulos e focar a busca.
 *
 * Não interfere quando o usuário está digitando em um campo nem quando há um
 * modal aberto — nesses casos a tecla pertence ao campo/modal.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingGoto = useRef(false);
  const gotoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    pendingGoto.current = false;
    if (gotoTimer.current) {
      clearTimeout(gotoTimer.current);
      gotoTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const openHelp = () => setHelpOpen(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, openHelp);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, openHelp);
  }, []);

  useEffect(() => clearPending, [clearPending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Combinações do navegador/sistema (Ctrl+C, Cmd+K…) nunca são capturadas.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      // Com modal aberto, as teclas pertencem ao modal (Escape fecha).
      if (document.querySelector('[role="dialog"]')) return;

      const key = event.key;

      if (key === "?" || (key === "/" && event.shiftKey)) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          '[data-shortcut="search"]',
        );
        if (!search) return; // página sem busca: não faz nada
        event.preventDefault();
        search.focus();
        search.select();
        return;
      }

      // Segunda tecla da sequência "g" + letra.
      if (pendingGoto.current) {
        const target = GOTO[key.toLowerCase()];
        clearPending();
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (key.toLowerCase() === "g") {
        event.preventDefault();
        pendingGoto.current = true;
        gotoTimer.current = setTimeout(clearPending, SEQUENCE_TIMEOUT);
        return;
      }

      if (key.toLowerCase() === "n") {
        event.preventDefault();
        router.push("/os/nova");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearPending, router]);

  return (
    <div className="no-print">
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Atalhos de teclado"
        subtitle="Funcionam fora de campos de texto e com nenhum modal aberto."
        size="md"
      >
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <Keyboard className="h-3.5 w-3.5" aria-hidden />
              Ações
            </h3>
            <ul className="space-y-2">
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-700">Nova ordem de serviço</span>
                <Kbd>N</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-700">Focar a busca da tela</span>
                <Kbd>/</Kbd>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-700">Esta ajuda</span>
                <Kbd>?</Kbd>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Ir para — pressione <Kbd>G</Kbd> e depois a letra
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(GOTO).map(([letter, target]) => (
                <li key={target.href} className="flex items-center justify-between gap-3">
                  <span className="text-slate-700">{target.label}</span>
                  <span className="flex items-center gap-1">
                    <Kbd>G</Kbd>
                    <Kbd>{letter.toUpperCase()}</Kbd>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Modal>
    </div>
  );
}
