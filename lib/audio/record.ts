/** whisper.cpp accepts nothing else. */
const TARGET_RATE = 16000;
const FRAME = 4096;

export interface Recorder {
  /** Live 0..1 level, for driving the orb while listening. */
  level(): number;
  /** Ends the recording and returns it as WAV. Null if nothing was captured. */
  stop(): Promise<Blob | null>;
  /** Ends the recording and discards it. */
  cancel(): void;
}

/**
 * Linear resample to 16kHz. Crude compared to a proper filter, and entirely
 * adequate: whisper works from a mel spectrogram, so the aliasing a better
 * filter would remove is not what it listens to.
 */
function resample(input: Float32Array, from: number): Float32Array {
  if (from === TARGET_RATE) return input;

  const ratio = from / TARGET_RATE;
  const output = new Float32Array(Math.floor(input.length / ratio));

  for (let i = 0; i < output.length; i++) {
    const at = i * ratio;
    const low = Math.floor(at);
    const high = Math.min(low + 1, input.length - 1);
    output[i] = input[low] + (input[high] - input[low]) * (at - low);
  }
  return output;
}

/** 16 bit PCM WAV. The header is 44 bytes and fully specified by the rate. */
function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(at + i, text.charCodeAt(i));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Captures the microphone as raw samples and encodes WAV on demand.
 *
 * Web Audio rather than MediaRecorder, because whisper.cpp rejects webm/opus
 * outright and browsers disagree on what MediaRecorder produces. Owning the
 * encoding removes both problems, and the raw samples are what voice activity
 * detection will need in Talk mode, so this is the capture path either way.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.5;

  const processor = ctx.createScriptProcessor(FRAME, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(analyser);
  analyser.connect(processor);
  // Required for the processor to run, but muted: routing the microphone to
  // the speakers would feed back.
  const silence = ctx.createGain();
  silence.gain.value = 0;
  processor.connect(silence);
  silence.connect(ctx.destination);

  const time = new Uint8Array(analyser.fftSize);

  const release = () => {
    processor.disconnect();
    processor.onaudioprocess = null;
    analyser.disconnect();
    source.disconnect();
    silence.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void ctx.close();
  };

  return {
    level() {
      analyser.getByteTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / time.length) * 4);
    },

    async stop() {
      const rate = ctx.sampleRate;
      release();

      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total === 0) return null;

      const joined = new Float32Array(total);
      let at = 0;
      for (const chunk of chunks) {
        joined.set(chunk, at);
        at += chunk.length;
      }

      return encodeWav(resample(joined, rate));
    },

    cancel: release,
  };
}