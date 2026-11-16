import { X } from 'lucide-react';
import { Avatar } from './Avatar.js';

export interface ToastItem {
  id: string;
  peerName: string;
  leaving: boolean;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#111111] py-2.5 pr-3 pl-3.5 text-xs text-white shadow-[0_12px_32px_rgba(17,17,17,0.22)] ${
            toast.leaving ? 'animate-toast-exit' : 'animate-toast-enter'
          }`}
        >
          <span className="relative shrink-0">
            <Avatar
              name={toast.peerName}
              sizeClass="h-6 w-6"
              textClass="text-[10px]"
            />
            <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#111111]" />
          </span>

          <p className="whitespace-nowrap">
            <span className="font-semibold text-white">{toast.peerName}</span>{' '}
            <span className="text-zinc-300">joined the room</span>
          </p>

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="ml-1 flex h-5 w-5 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
