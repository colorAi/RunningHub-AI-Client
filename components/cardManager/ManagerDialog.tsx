import React, { useEffect, useId, useRef } from "react";
export const controlClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50";
export default function ManagerDialog({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="w-[min(560px,calc(100vw-32px))] max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-[#161920] dark:text-slate-100"
    >
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="关闭对话框"
          disabled={busy}
          className={controlClass}
          onClick={onClose}
        >
          关闭
        </button>
      </header>
      {children}
    </dialog>
  );
}
