import { createPortal } from "react-dom";

export default function Modal({ children, className }) {
  return createPortal(
    <div className={className}>{children}</div>,
    document.body
  );
}
