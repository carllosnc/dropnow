import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileFeed, type FeedEntry } from './components/FileFeed.js';
import { Sidebar } from './components/Sidebar.js';
import { ToastContainer, type ToastItem } from './components/Toast.js';
import { TopBar } from './components/TopBar.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { generateDeviceName, generateId } from './lib/format.js';

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const existing = params.get('room')?.trim();
  if (existing && /^[a-zA-Z0-9_-]{3,64}$/.test(existing)) {
    return existing;
  }
  const fresh = generateId(8);
  const url = new URL(window.location.href);
  url.searchParams.set('room', fresh);
  window.history.replaceState(null, '', url.toString());
  return fresh;
}

export function App() {
  const [roomId, setRoomId] = useState<string>(getInitialRoomId);
  const [displayName, setDisplayName] = useState<string>(generateDeviceName);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'me' | string>(
    'all',
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const localPeerId = useMemo(() => generateId(12), []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      toastTimersRef.current.delete(id);
    }

    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );

    const removeTimer = window.setTimeout(() => {
      toastTimersRef.current.delete(`remove:${id}`);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 230);
    toastTimersRef.current.set(`remove:${id}`, removeTimer);
  }, []);

  const pushToast = useCallback(
    (peerName: string, message: string) => {
      const id = generateId(8);
      setToasts((prev) => [
        ...prev.slice(-2),
        { id, peerName, message, leaving: false },
      ]);
      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, 3500);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  const handlePeerJoined = useCallback(
    (peer: { peerId: string; displayName: string }) => {
      pushToast(peer.displayName, 'joined the room');
    },
    [pushToast],
  );

  const notifyFilesAdded = useCallback(
    (ownerName: string, files: { name: string }[]) => {
      if (files.length === 0) return;
      const firstFile = files[0];
      const message =
        files.length === 1 && firstFile
          ? `shared ${firstFile.name}`
          : `shared ${files.length} files`;
      pushToast(ownerName, message);
    },
    [pushToast],
  );

  const handlePeerFilesAdded = useCallback(
    (peer: {
      peerId: string;
      displayName: string;
      files: { name: string }[];
    }) => {
      notifyFilesAdded(peer.displayName, peer.files);
    },
    [notifyFilesAdded],
  );

  const {
    wsStatus,
    turnEnabled,
    peers,
    sharedFiles,
    transfers,
    error,
    addSharedFiles,
    removeSharedFile,
    downloadFile,
    cancelTransfer,
  } = useWebRTC(roomId, displayName, localPeerId, {
    onPeerJoined: handlePeerJoined,
    onPeerFilesAdded: handlePeerFilesAdded,
  });

  const handleAddSharedFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;
      addSharedFiles(incoming);
      notifyFilesAdded(displayName.trim() || 'You', incoming);
    },
    [addSharedFiles, displayName, notifyFilesAdded],
  );

  const entries = useMemo(() => {
    const list: FeedEntry[] = [];

    if (selectedFilter === 'all' || selectedFilter === 'me') {
      for (const file of sharedFiles) {
        list.push({
          kind: 'local',
          file,
          ownerId: 'me',
          ownerName: displayName.trim() || 'You',
          isPeerReady: true,
        });
      }
    }

    for (const peer of peers) {
      if (selectedFilter !== 'all' && selectedFilter !== peer.peerId) {
        continue;
      }
      for (const file of peer.sharedFiles) {
        list.push({
          kind: 'peer',
          file,
          ownerId: peer.peerId,
          ownerName: peer.displayName,
          isPeerReady: peer.dataChannelOpen,
        });
      }
    }

    list.sort((a, b) => a.file.sharedAt - b.file.sharedAt);
    return list;
  }, [selectedFilter, sharedFiles, displayName, peers]);

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard API may be unavailable in insecure contexts
    }
  };

  const handleSwitchRoom = (nextRoom: string) => {
    const cleaned = nextRoom.trim();
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(cleaned)) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', cleaned);
    window.history.replaceState(null, '', url.toString());
    setRoomId(cleaned);
    setSelectedFilter('all');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#DEE9F9] px-4 py-5 text-[#111111] sm:px-6 lg:px-10">
      {/* Main Framed Workspace */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 md:h-[calc(100vh-2.5rem)] md:flex-none">
        <TopBar
          roomId={roomId}
          fileCount={entries.length}
          wsStatus={wsStatus}
          turnEnabled={turnEnabled}
          onSwitchRoom={handleSwitchRoom}
          onNewRoom={() => handleSwitchRoom(generateId(8))}
          onCopyInvite={handleCopyInvite}
        />

        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <Sidebar
            displayName={displayName}
            peers={peers}
            localFileCount={sharedFiles.length}
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
            onChangeDisplayName={setDisplayName}
            onRandomizeDisplayName={() => setDisplayName(generateDeviceName())}
          />

          <main className="flex min-h-0 flex-1 flex-col">
            <FileFeed
              entries={entries}
              transfers={transfers}
              onPickFiles={() => fileInputRef.current?.click()}
              onAddFiles={handleAddSharedFiles}
              onRemoveLocalFile={removeSharedFile}
              onDownloadFile={downloadFile}
              onCancelTransfer={cancelTransfer}
            />
          </main>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleAddSharedFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
