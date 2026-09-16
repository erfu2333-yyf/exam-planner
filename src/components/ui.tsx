import type { ReactNode } from "react";
import { PALETTE } from "../theme";

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  small,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  small?: boolean;
  title?: string;
}) {
  const classes = ["btn"];
  if (variant === "primary") classes.push("btn-primary");
  if (variant === "danger") classes.push("btn-danger");
  if (small) classes.push("btn-small");
  return (
    <button
      type="button"
      className={classes.join(" ")}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="pill" data-active={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function NumberField({
  value,
  onChange,
  width = 62,
  step = 0.5,
  min = 0,
  title,
}: {
  value: number | string;
  onChange: (value: string) => void;
  width?: number;
  step?: number;
  min?: number;
  title?: string;
}) {
  return (
    <input
      className="field"
      type="number"
      step={step}
      min={min}
      value={value}
      title={title}
      onChange={(event) => onChange(event.target.value)}
      style={{ width, textAlign: "right" }}
    />
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
  width,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  width?: number | string;
  autoComplete?: string;
}) {
  return (
    <input
      className="field"
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete ?? (type === "password" ? "current-password" : undefined)}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: width ?? "100%" }}
    />
  );
}

export function Modal({
  title,
  children,
  onClose,
  width,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={width ? { maxWidth: width } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="row"
          style={{ justifyContent: "space-between", marginBottom: 14 }}
        >
          <strong style={{ fontSize: 17 }}>{title}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: "var(--text-2)",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (colorId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {PALETTE.map((item) => (
        <button
          key={item.id}
          type="button"
          className="swatch"
          data-active={item.id === value}
          title={item.label}
          onClick={() => onChange(item.id)}
          style={{ background: item.base }}
        />
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  // 用 div 而不是 label：颜色选择器里是一排按钮，被 label 包住会让按钮读成标签文字
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  const color = tone === "warning" ? "var(--danger)" : "var(--accent)";
  return (
    <div
      style={{
        borderLeft: `4px solid ${color}`,
        borderRadius: 6,
        background: "var(--surface-2)",
        padding: "9px 12px",
      }}
    >
      {children}
    </div>
  );
}
