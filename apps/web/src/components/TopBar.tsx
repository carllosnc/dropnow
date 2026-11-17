import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Hash, Lock, LogOut, Power } from 'lucide-react';

interface TopBarProps {
  roomId: string;
  hasPassword?: boolean;
  isHost?: boolean;
  fileCount: number;
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  turnEnabled: boolean | null;
  onSwitchRoom: (roomId: string) => void;
  onCopyInvite: () => Promise<void>;
  onLeaveRoom: () => void;
  onShutdownRoom?: () => void;
}

export function TopBar({
  roomId,
  hasPassword = false,
  isHost = false,
  fileCount,
  wsStatus,
  turnEnabled,
  onSwitchRoom,
  onCopyInvite,
  onLeaveRoom,
  onShutdownRoom,
}: TopBarProps) {
  const [roomInput, setRoomInput] = useState(roomId);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRoomInput(roomId);
  }, [roomId]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    await onCopyInvite();
    setCopied(true);
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, 2000);
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onLeaveRoom}
          className="group flex items-center gap-2.5 text-left"
          title="Back to room setup"
        >
          <img
            src="/logo.png"
            alt="DropNow logo"
            className="h-7 w-7 transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none"
          />
          <h1 className="text-base font-bold tracking-tight text-[#111111]">
            DropNow
          </h1>
        </button>

        <span className="text-zinc-300">/</span>

        <span className="font-mono text-xs text-zinc-500 tabular-nums">
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </span>

        <span className="hidden text-zinc-300 sm:inline">·</span>

        <div
          className="hidden items-center gap-1.5 text-xs font-medium text-zinc-600 sm:flex"
          title={`Signaling: ${wsStatus} · ${turnEnabled ? 'TURN Relay' : 'STUN Direct'}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              wsStatus === 'connected'
                ? 'bg-emerald-500'
                : wsStatus === 'connecting'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
            }`}
          />
          <span>{wsStatus === 'connected' ? 'Live' : wsStatus}</span>
          {turnEnabled !== null && (
            <>
              <span className="text-zinc-300">·</span>
              <span className="font-mono text-[11px] text-zinc-400">
                {turnEnabled ? 'TURN' : 'STUN'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSwitchRoom(roomInput);
          }}
        >
          <div className="relative">
            <Hash className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              className={`w-28 rounded-xl border border-black/[0.12] bg-[#EDF2F8] py-1.5 pl-6.5 font-mono text-xs font-medium text-[#111111] outline-none transition focus:border-[#111111]/40 focus:bg-white sm:w-32 ${
                hasPassword ? 'pr-7' : 'pr-2.5'
              }`}
              aria-label="Room code"
            />
            {hasPassword && (
              <Lock
                className="pointer-events-none absolute top-1/2 right-2.5 h-3 w-3 -translate-y-1/2 text-blue-600"
                aria-label="Password protected"
              />
            )}
          </div>
          {roomInput !== roomId && (
            <button
              type="submit"
              className="rounded-xl bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600"
            >
              Join
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={handleCopy}
          className="group/btn inline-flex items-center gap-1.5 rounded-xl border border-black/[0.12] bg-[#EDF2F8] px-3 py-1.5 text-xs font-semibold text-[#111111] transition hover:border-black/[0.18] hover:bg-[#E2E9F4] active:scale-95"
          title="Copy invite link"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600 transition-transform duration-200 group-hover/btn:scale-110" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-zinc-700 transition-transform duration-200 group-hover/btn:-rotate-6 group-hover/btn:scale-110 motion-reduce:transition-none" />
          )}
          <span>{copied ? 'Copied' : 'Invite'}</span>
        </button>

        {isHost && onShutdownRoom ? (
          <button
            type="button"
            onClick={onShutdownRoom}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-500/30 hover:bg-rose-100 active:scale-95"
            title="Shut down room and disconnect everyone"
            aria-label="Shut down room"
          >
            <Power className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Shutdown</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onLeaveRoom}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.12] bg-[#EDF2F8] px-3 py-1.5 text-xs font-semibold text-[#111111] transition hover:border-black/[0.18] hover:bg-[#E2E9F4] active:scale-95"
            title="Leave room"
            aria-label="Leave room"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        )}
      </div>
    </header>
  );
}
