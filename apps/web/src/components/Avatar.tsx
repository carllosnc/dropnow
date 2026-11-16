import { useState } from 'react';
import { getAvatarUrl } from '../lib/format.js';

interface AvatarProps {
  name: string;
  seed?: string;
  sizeClass?: string;
  textClass?: string;
}

export function Avatar({
  name,
  seed,
  sizeClass = 'h-6 w-6',
  textClass = 'text-xs',
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const avatarSeed = seed ?? name;
  const initial = (name.trim()[0] ?? 'P').toUpperCase();

  if (failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-blue-600/15 font-semibold text-blue-700 ${sizeClass} ${textClass}`}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={getAvatarUrl(avatarSeed)}
      alt={name}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full bg-blue-600/15 object-cover ${sizeClass}`}
    />
  );
}
