"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Settings2, X } from "lucide-react";

/** Chave usada para lembrar o descarte entre sessões. */
const STORAGE_KEY = "oficina:aviso-configuracao-descartado";

/**
 * Aviso de configuração pendente.
 *
 * Aparece enquanto os dados de identidade da oficina (nome, CNPJ, telefone,
 * endereço) estiverem vazios ou iguais ao exemplo do seed — esses valores saem
 * no cabeçalho da OS impressa, então vale o lembrete.
 *
 * É descartável: o "X" grava a escolha no navegador e o aviso não volta.
 */
export function SetupNotice({ gaps }: { gaps: string[] }) {
  // Começa oculto para não piscar para quem já descartou; o efeito decide depois.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage indisponível (navegador restrito): mostra o aviso.
      setDismissed(false);
    }
  }, []);

  if (gaps.length === 0 || dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sem persistência: ao menos some nesta sessão
    }
    setDismissed(true);
  }

  const list =
    gaps.length === 1
      ? gaps[0]
      : `${gaps.slice(0, -1).join(", ")} e ${gaps.at(-1)}`;

  return (
    <div
      role="status"
      className="no-print mb-5 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Falta configurar: {list}.</p>
          <p className="mt-0.5 text-amber-800">
            Esses dados saem no cabeçalho da ordem de serviço impressa e nos recibos.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
          Configurar agora
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Descartar aviso"
          className="rounded-lg p-1.5 text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
