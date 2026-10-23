import { cn } from "@/lib/utils";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="label">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  invalid?: boolean;
  /** Conteúdo renderedizado à esquerda do campo (texto ou ícone). */
  prefix?: ReactNode;
  /** Conteúdo renderizado à direita do campo (texto ou ícone). */
  suffix?: ReactNode;
}

export function Input({ className, invalid, prefix, suffix, ...rest }: InputProps) {
  if (prefix || suffix) {
    return (
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-lg border border-line bg-white",
          "focus-within:border-brand-400 focus-within:ring-3 focus-within:ring-brand-500/15",
          invalid && "border-red-400",
          className,
        )}
      >
        {prefix ? (
          <span className="flex items-center bg-slate-50 px-2.5 text-xs font-medium text-slate-500">
            {prefix}
          </span>
        ) : null}
        <input
          className="w-full border-0 bg-transparent px-2.5 py-2 text-sm outline-none"
          {...rest}
        />
        {suffix ? (
          <span className="flex items-center bg-slate-50 px-2.5 text-xs font-medium text-slate-500">
            {suffix}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <input
      className={cn("input", invalid && "input-error", className)}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("input resize-y leading-relaxed", className)} {...rest} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: { value: string | number; label: string }[];
  placeholder?: string;
  invalid?: boolean;
}

export function Select({
  className,
  options,
  placeholder,
  invalid,
  children,
  ...rest
}: SelectProps) {
  return (
    <select
      className={cn(
        "input appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222.5%22 stroke-linecap=%22round%22><path d=%22M6 9l6 6 6-6%22/></svg>')]",
        invalid && "input-error",
        className,
      )}
      {...rest}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
}

export function SearchInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      {/* data-shortcut dá um seletor estável para o atalho "/" focar a busca. */}
      <input data-shortcut="search" className="input pl-9" {...rest} />
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 accent-brand-500"
        {...rest}
      />
      <span className="text-slate-700">{label}</span>
    </label>
  );
}
