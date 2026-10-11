const pending = new Map();

export function handoffPlayback(playback) {
  const token = crypto.randomUUID();
  pending.set(token, playback);
  while (pending.size > 10) pending.delete(pending.keys().next().value);
  return token;
}

export function takePlaybackHandoff(token) {
  const playback = pending.get(token);
  pending.delete(token);
  return playback;
}

export function readPlaybackHandoff(token) {
  return pending.get(token);
}
