import { Sparkles, Users } from 'lucide-react';
import type { PeerState } from '../hooks/useWebRTC.js';
import { Avatar } from './Avatar.js';

interface SidebarProps {
  displayName: string;
  peers: PeerState[];
  localFileCount: number;
  selectedFilter: 'all' | 'me' | string;
  onSelectFilter: (filter: 'all' | 'me' | string) => void;
  onChangeDisplayName: (name: string) => void;
  onRandomizeDisplayName: () => void;
}

export function Sidebar({
  displayName,
  peers,
  localFileCount,
  selectedFilter,
  onSelectFilter,
  onChangeDisplayName,
  onRandomizeDisplayName,
}: SidebarProps) {
  const totalFiles =
    localFileCount + peers.reduce((sum, p) => sum + p.sharedFiles.length, 0);

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-2xl bg-white md:h-full md:w-68 lg:w-72">
      {/* Users / Peers List */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-2.5 pt-1">
          <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Users · {peers.length + 1}
          </span>
        </div>

        <nav className="space-y-1">
          {/* All Room Files */}
          <button
            type="button"
            onClick={() => onSelectFilter('all')}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
              selectedFilter === 'all'
                ? 'bg-[#111111] font-semibold text-white'
                : 'font-medium text-zinc-600 hover:bg-[#F6F6F5] hover:text-[#111111]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Users
                className={`h-4 w-4 shrink-0 ${
                  selectedFilter === 'all' ? 'text-blue-500' : 'text-zinc-400'
                }`}
              />
              <span>All Shared Files</span>
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                selectedFilter === 'all' ? 'text-zinc-300' : 'text-zinc-400'
              }`}
            >
              {totalFiles}
            </span>
          </button>

          {/* Local User */}
          <button
            type="button"
            onClick={() => onSelectFilter('me')}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition ${
              selectedFilter === 'me'
                ? 'bg-[#111111] font-semibold text-white'
                : 'font-medium text-zinc-600 hover:bg-[#F6F6F5] hover:text-[#111111]'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar
                name={displayName.trim() || 'You'}
                sizeClass="h-8 w-8"
                textClass="text-xs"
              />
              <span className="truncate">
                {displayName.trim() || 'You'}{' '}
                <span
                  className={`text-xs ${
                    selectedFilter === 'me' ? 'text-[#FF8533]' : 'text-zinc-400'
                  }`}
                >
                  you
                </span>
              </span>
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                selectedFilter === 'me' ? 'text-zinc-300' : 'text-zinc-400'
              }`}
            >
              {localFileCount}
            </span>
          </button>

          {/* Remote Peers */}
          {peers.map((peer) => {
            const isSelected = selectedFilter === peer.peerId;
            const isReady = peer.dataChannelOpen;
            return (
              <button
                key={peer.peerId}
                type="button"
                onClick={() => onSelectFilter(peer.peerId)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition ${
                  isSelected
                    ? 'bg-[#111111] font-semibold text-white'
                    : 'font-medium text-zinc-600 hover:bg-[#F6F6F5] hover:text-[#111111]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="relative shrink-0">
                    <Avatar
                      name={peer.displayName}
                      sizeClass="h-8 w-8"
                      textClass="text-xs"
                    />
                    <span
                      className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ${
                        isSelected ? 'ring-[#111111]' : 'ring-white'
                      } ${
                        isReady
                          ? 'bg-emerald-500'
                          : peer.connectionState === 'failed'
                            ? 'bg-rose-500'
                            : 'bg-amber-500'
                      }`}
                    />
                  </span>
                  <span className="truncate">{peer.displayName}</span>
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    isSelected ? 'text-zinc-300' : 'text-zinc-400'
                  }`}
                >
                  {peer.sharedFiles.length}
                </span>
              </button>
            );
          })}
        </nav>

        {peers.length === 0 && (
          <p className="mt-4 px-3 text-xs text-zinc-400">
            Waiting for peers to join...
          </p>
        )}
      </div>

      {/* Local Device Name Editor */}
      <div className="border-t border-black/[0.08] p-3">
        <label className="block text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
          Your Device
        </label>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="text"
            value={displayName}
            maxLength={40}
            onChange={(e) => onChangeDisplayName(e.target.value)}
            className="w-full rounded-xl border border-black/[0.12] bg-[#EDF2F8] px-3 py-2 text-xs font-medium text-[#111111] outline-none transition focus:border-[#111111]/40 focus:bg-white"
          />
          <button
            type="button"
            onClick={onRandomizeDisplayName}
            className="group/btn rounded-xl border border-black/[0.12] bg-[#EDF2F8] p-2 text-zinc-700 transition hover:border-black/[0.18] hover:bg-[#E2E9F4] hover:text-blue-600 active:scale-95"
            title="Randomize device name"
            aria-label="Randomize device name"
          >
            <Sparkles className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:rotate-12 group-hover/btn:scale-110 motion-reduce:transition-none" />
          </button>
        </div>
      </div>
    </aside>
  );
}
