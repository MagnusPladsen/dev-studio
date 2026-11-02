type AudioContextConstructor = new () => AudioContext;

interface AudioSessionWindow {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
  navigator: Navigator & { audioSession?: { type: string } };
}

let context: AudioContext | null = null;

function createContext(win: AudioSessionWindow): AudioContext {
  const Constructor = win.AudioContext ?? win.webkitAudioContext;
  if (!Constructor) throw new Error("Web Audio is not supported in this browser");
  return new Constructor();
}

/** iOS mutes Web Audio with the ring/silent switch unless the page asks for media playback. */
function requestPlaybackSession(win: AudioSessionWindow): void {
  const session = win.navigator.audioSession;
  if (session && session.type !== "playback") session.type = "playback";
}

/** Older iOS only unlocks a context once something has been started on it inside the gesture. */
function playSilence(audio: AudioContext): void {
  const source = audio.createBufferSource();
  source.buffer = audio.createBuffer(1, 1, audio.sampleRate);
  source.connect(audio.destination);
  source.start();
}

/**
 * The one AudioContext every tool plays through. Call it synchronously from a click or key handler:
 * iOS Safari only starts (or resumes after an interruption) audio inside a user gesture.
 */
export function getAudioContext(win: AudioSessionWindow = window as unknown as AudioSessionWindow): AudioContext {
  requestPlaybackSession(win);
  if (!context) {
    context = createContext(win);
    playSilence(context);
  }
  if (context.state !== "running") void context.resume();
  return context;
}
