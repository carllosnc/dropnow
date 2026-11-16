export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const unit = units[exponent] ?? 'B';
  return `${value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

const ADJECTIVES = [
  'Swift',
  'Bright',
  'Silent',
  'Solar',
  'Amber',
  'Cobalt',
  'Nimble',
  'Silver',
  'Crisp',
  'Lunar',
];

const ANIMALS = [
  'Falcon',
  'Otter',
  'Lynx',
  'Fox',
  'Heron',
  'Orca',
  'Badger',
  'Puffin',
  'Wolf',
  'Crane',
];

export function generateDeviceName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? 'Swift';
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)] ?? 'Falcon';
  return `${adj} ${animal}`;
}

export function generateId(length = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    result += alphabet[byte % alphabet.length] ?? 'a';
  }
  return result;
}

export function getAvatarUrl(seed: string): string {
  const normalized = seed.trim() || 'dropnow';
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(normalized)}`;
}
