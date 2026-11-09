export function UnreadDot({ className = "" }) {
  return (
    <span
      role="img"
      aria-label="Unread notification"
      title="Unread notification"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ${className}`}
    />
  );
}
