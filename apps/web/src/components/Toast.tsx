import { useState } from 'react';
import { X } from 'lucide-react';
import { Avatar } from './Avatar.js';

export interface ToastItem {
  id: string;
  peerName: string;
  message: string;
  leaving: boolean;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const [expanded, setExpanded] = useState(false);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="fixed right-5 bottom-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)]"
      style={{ height: expanded ? `${toasts.length * 66}px` : '64px' }}
    >
      {toasts.map((toast, index) => {
        const offset = toasts.length - 1 - index;
        const translateY = expanded ? -(offset * 66) : -(offset * 8);
        const scale = expanded ? 1 : Math.max(0.88, 1 - offset * 0.045);
        const opacity = expanded
          ? 1
          : offset === 0
            ? 1
            : offset === 1
              ? 0.92
              : 0.8;

        return (
          <div
            key={toast.id}
            style={{
              zIndex: toasts.length - offset,
              transform: `translateY(${translateY}px) scale(${scale})`,
              opacity,
            }}
            className="pointer-events-auto absolute right-0 bottom-0 w-full origin-bottom transition-[transform,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          >
            <div
              role="status"
              className={`flex items-center gap-3 rounded-xl border border-white/[0.1] bg-[#111111] px-4 py-3 text-white shadow-[0_12px_32px_rgba(17,17,17,0.28)] ${
                toast.leaving ? 'animate-toast-exit' : 'animate-toast-enter'
              }`}
            >
              <span className="relative shrink-0">
                <Avatar
                  name={toast.peerName}
                  sizeClass="h-7 w-7"
                  textClass="text-[11px]"
                />
                <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#111111]" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">
                  {toast.peerName}
                </p>
                <p className="truncate text-[11px] text-zinc-400">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
