import { useEffect, useState } from 'react';
import { Check, Copy, Hash, RefreshCw } from 'lucide-react';

interface TopBarProps {
  roomId: string;
  fileCount: number;
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  turnEnabled: boolean | null;
  onSwitchRoom: (roomId: string) => void;
  onNewRoom: () => void;
  onCopyInvite: () => Promise<void>;
}

export function TopBar({
  roomId,
  fileCount,
  wsStatus,
  turnEnabled,
  onSwitchRoom,
  onNewRoom,
  onCopyInvite,
}: TopBarProps) {
  const [roomInput, setRoomInput] = useState(roomId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRoomInput(roomId);
  }, [roomId]);

  const handleCopy = async () => {
    await onCopyInvite();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div className="group flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="DropNow logo"
            className="h-7 w-7 transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none"
          />
          <h1 className="text-base font-bold tracking-tight text-[#111111]">
            DropNow
          </h1>
        </div>

        <span className="text-zinc-300">/</span>

        <span className="font-mono text-xs text-zinc-500 tabular-nums">
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </span>
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
              className="w-28 rounded-xl border border-black/[0.12] bg-[#EDF2F8] py-1.5 pr-2.5 pl-6.5 font-mono text-xs font-medium text-[#111111] outline-none transition focus:border-[#111111]/40 focus:bg-white sm:w-32"
              aria-label="Room code"
            />
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

        <button
          type="button"
          onClick={onNewRoom}
          className="group/btn rounded-xl border border-black/[0.12] bg-[#EDF2F8] p-2 text-zinc-700 transition hover:border-black/[0.18] hover:bg-[#E2E9F4] hover:text-[#111111] active:scale-95"
          title="Create new random room"
          aria-label="Create new random room"
        >
          <RefreshCw className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover/btn:rotate-180 motion-reduce:transition-none" />
        </button>

        <div className="mx-1 hidden h-4 w-px bg-zinc-200 sm:block" />

        <div
          className="flex items-center gap-1.5 px-1 text-xs font-medium text-zinc-600"
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
    </header>
  );
}
