import { Button } from "@toss/tds-mobile";
import { graniteEvent } from "@apps-in-toss/web-framework";
import { useEffect, useId, useRef, type ReactNode } from "react";
export function Action({
  children,
  onClick,
  secondary = false,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <Button
      type={type}
      display="block"
      variant={secondary ? "weak" : "fill"}
      disabled={disabled}
      onClick={onClick}
      className={secondary ? "wallet-action wallet-secondary" : "wallet-action"}
    >
      {children}
    </Button>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  required = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        required={required}
      />
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  const labelId = useId();
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      <select
        aria-labelledby={labelId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card ${className}`}>
      {children}
    </section>
  );
}
export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(
    () => graniteEvent.addEventListener("backEvent", { onEvent: onClose }),
    [onClose],
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-content">
        <h2 id={titleId}>{title}</h2>
        {children}
        <Action secondary onClick={onClose}>
          닫기
        </Action>
      </div>
    </dialog>
  );
}
export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v11H3z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    meal: (
      <>
        <path d="M5 3v7m3-7v7m3-7v7M5 7h6M8 10v11M18 3v18M18 3c-4 4-4 8 0 8" />
      </>
    ),
    exercise: (
      <>
        <path d="m6 6 12 12M3 6l3-3m12 18 3-3M3 10l7-7m4 18 7-7" />
      </>
    ),
    my: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 8V5l14-3v3M21 10h-7v6h7" />
        <circle cx="17" cy="13" r=".7" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.wallet}
    </svg>
  );
}
