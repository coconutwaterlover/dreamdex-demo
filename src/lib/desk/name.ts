export const PLAYER_NAME_MIN = 3;
export const PLAYER_NAME_MAX = 24;
export const PLAYER_NAME_RE = /^[A-Za-z0-9._-]{3,24}$/;
export const PLAYER_NAME_STORAGE = "dreamdesk-player-name";

export function isPlayerName(value: string | undefined): value is string {
  return !!value && PLAYER_NAME_RE.test(value);
}

export function normalizePlayerName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return isPlayerName(trimmed) ? trimmed : undefined;
}
