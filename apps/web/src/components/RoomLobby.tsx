import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Hash,
  Lock,
  LogIn,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Avatar } from './Avatar.js';

type LobbyMode = 'create' | 'join';

interface RoomLobbyProps {
  initialRoomId: string;
  hasInviteRoom: boolean;
  displayName: string;
  error: string | null;
  onRandomizeDisplayName: () => string;
  onGenerateRoomId: () => string;
  onEnterRoom: (params: {
    roomId: string;
    displayName: string;
    password?: string;
  }) => void;
}

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;

export function RoomLobby({
  initialRoomId,
  hasInviteRoom,
  displayName,
  error,
  onRandomizeDisplayName,
  onGenerateRoomId,
  onEnterRoom,
}: RoomLobbyProps) {
  const [mode, setMode] = useState<LobbyMode>(
    hasInviteRoom ? 'join' : 'create',
  );
  const [nameInput, setNameInput] = useState(displayName);
  const [createRoomInput, setCreateRoomInput] = useState(initialRoomId);
  const [joinRoomInput, setJoinRoomInput] = useState(
    hasInviteRoom ? initialRoomId : '',
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameInput(displayName);
  }, [displayName]);

  useEffect(() => {
    if (hasInviteRoom) {
      setMode('join');
      setJoinRoomInput(initialRoomId);
    } else {
      setCreateRoomInput(initialRoomId);
    }
  }, [hasInviteRoom, initialRoomId]);

  useEffect(() => {
    if (error) {
      passwordRef.current?.focus();
    }
  }, [error]);

  const activeRoomInput = mode === 'create' ? createRoomInput : joinRoomInput;
  const activeError = validationError ?? error;

  const handleModeChange = (nextMode: LobbyMode) => {
    setMode(nextMode);
    setPasswordInput('');
    setShowPassword(false);
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedRoom = activeRoomInput.trim();
    const cleanedName = nameInput.trim();

    if (!cleanedName) {
      setValidationError('Please enter a display name.');
      return;
    }

    if (!ROOM_ID_REGEX.test(cleanedRoom)) {
      setValidationError(
        mode === 'create'
          ? 'Room code must be 3-64 characters (letters, numbers, _ or -).'
          : 'Enter a valid room code (3-64 characters: letters, numbers, _ or -).',
      );
      return;
    }

    setValidationError(null);
    onEnterRoom({
      roomId: cleanedRoom,
      displayName: cleanedName,
      password: passwordInput.length > 0 ? passwordInput : undefined,
    });
  };

  const isCreate = mode === 'create';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#DEE9F9] px-4 py-8 text-[#111111]">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="DropNow logo" className="h-9 w-9" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#111111]">
              DropNow
            </h1>
            <p className="text-xs text-zinc-500">
              Instant peer-to-peer file sharing
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div
          role="tablist"
          aria-label="Room mode"
          className="mt-5 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#EDF2F8] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isCreate}
            onClick={() => handleModeChange('create')}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              isCreate
                ? 'bg-white text-[#111111]'
                : 'text-zinc-500 hover:text-[#111111]'
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Create Room</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isCreate}
            onClick={() => handleModeChange('join')}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              !isCreate
                ? 'bg-white text-[#111111]'
                : 'text-zinc-500 hover:text-[#111111]'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Join Room</span>
          </button>
        </div>

        {/* Explicit Form Title */}
        <div className="mt-5">
          <h2 className="text-base font-bold tracking-tight text-[#111111]">
            {isCreate ? 'Create a new room' : 'Join an existing room'}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isCreate
              ? 'Start a private P2P room and share the code or invite link.'
              : 'Enter the room code shared with you to connect.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Display Name */}
          <div>
            <label
              htmlFor="lobby-display-name"
              className="mb-1.5 flex items-center justify-between text-xs font-semibold text-zinc-700"
            >
              <span>Your name</span>
              <span className="font-normal text-zinc-400">
                Visible to peers
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Avatar
                name={nameInput.trim() || 'Anonymous Peer'}
                sizeClass="h-9 w-9"
                textClass="text-sm"
              />
              <div className="relative flex-1">
                <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  id="lobby-display-name"
                  type="text"
                  maxLength={40}
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-black/[0.1] bg-[#EDF2F8] py-2.5 pr-3 pl-9 text-sm font-medium text-[#111111] outline-none transition focus:border-blue-600/50 focus:bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => setNameInput(onRandomizeDisplayName())}
                className="group rounded-xl border border-black/[0.1] bg-[#EDF2F8] p-2.5 text-zinc-600 transition hover:bg-[#E2E9F4] hover:text-[#111111] active:scale-95"
                title="Generate random name"
                aria-label="Generate random name"
              >
                <RefreshCw className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180 motion-reduce:transition-none" />
              </button>
            </div>
          </div>

          {/* Room Code */}
          <div>
            <label
              htmlFor="lobby-room-code"
              className="mb-1.5 flex items-center justify-between text-xs font-semibold text-zinc-700"
            >
              <span>{isCreate ? 'New room code' : 'Room code'}</span>
              {!isCreate && hasInviteRoom ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                  From invite link
                </span>
              ) : (
                <span className="font-normal text-zinc-400">
                  {isCreate ? 'Auto-generated or custom' : 'Required'}
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Hash className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  id="lobby-room-code"
                  type="text"
                  maxLength={64}
                  value={activeRoomInput}
                  onChange={(e) => {
                    if (isCreate) {
                      setCreateRoomInput(e.target.value);
                    } else {
                      setJoinRoomInput(e.target.value);
                    }
                    if (validationError) setValidationError(null);
                  }}
                  placeholder={
                    isCreate ? 'e.g. team-sync' : 'Enter room code'
                  }
                  className="w-full rounded-xl border border-black/[0.1] bg-[#EDF2F8] py-2.5 pr-3 pl-9 font-mono text-sm font-medium text-[#111111] outline-none transition focus:border-blue-600/50 focus:bg-white"
                />
              </div>
              {isCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateRoomInput(onGenerateRoomId());
                    if (validationError) setValidationError(null);
                  }}
                  className="group rounded-xl border border-black/[0.1] bg-[#EDF2F8] p-2.5 text-zinc-600 transition hover:bg-[#E2E9F4] hover:text-[#111111] active:scale-95"
                  title="Generate new room code"
                  aria-label="Generate new room code"
                >
                  <RefreshCw className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180 motion-reduce:transition-none" />
                </button>
              )}
            </div>
          </div>

          {/* Room Password */}
          <div>
            <label
              htmlFor="lobby-room-password"
              className="mb-1.5 flex items-center justify-between text-xs font-semibold text-zinc-700"
            >
              <span>{isCreate ? 'Set room password' : 'Room password'}</span>
              <span className="font-normal text-zinc-400">
                {isCreate ? 'Optional' : 'If required'}
              </span>
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                ref={passwordRef}
                id="lobby-room-password"
                type={showPassword ? 'text' : 'password'}
                maxLength={128}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={
                  isCreate
                    ? 'Leave empty for an open room'
                    : 'Enter password if room is locked'
                }
                className="w-full rounded-xl border border-black/[0.1] bg-[#EDF2F8] py-2.5 pr-10 pl-9 text-sm font-medium text-[#111111] outline-none transition focus:border-blue-600/50 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1 text-zinc-400 transition hover:text-zinc-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {activeError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/20 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
            >
              {activeError}
            </div>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99]"
          >
            <span>{isCreate ? 'Create room' : 'Join room'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-zinc-100 pt-4 text-[11px] text-zinc-400">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
          <span>End-to-end encrypted WebRTC · Zero server storage</span>
        </div>
      </div>
    </div>
  );
}
