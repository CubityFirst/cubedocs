import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AudioVisualizerProps extends Omit<React.HTMLAttributes<HTMLCanvasElement>, "color"> {
  /** Ref to the <audio> element whose output will drive the visualization. */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** Number of bars to render. Default 128. */
  barCount?: number;
  /** Smoothing 0–1, higher = smoother but slower decay. Default 0.72. */
  smoothing?: number;
  /** FFT size, must be a power of 2 in [32, 32768]. Default 1024. */
  fftSize?: number;
  /** Fraction of FFT bins to sample, top-down trimmed. Default 0.75 (drops the
   *  uppermost quarter of the spectrum where most music has no energy). */
  maxBinRatio?: number;
  /** Tailwind class controls bar color via `currentColor` — defaults to text-primary. */
  className?: string;
}

// MediaElementSource can only be created once per <audio> element per page.
// Cache the wiring keyed by element so re-mounts of the visualizer can re-attach
// without throwing "HTMLMediaElement already connected" from createMediaElementSource.
type Wiring = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
};
const wiringByElement = new WeakMap<HTMLAudioElement, Wiring>();

function getOrCreateWiring(audio: HTMLAudioElement, fftSize: number, smoothing: number): Wiring | null {
  const cached = wiringByElement.get(audio);
  if (cached) {
    cached.analyser.fftSize = fftSize;
    cached.analyser.smoothingTimeConstant = smoothing;
    return cached;
  }
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothing;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const wiring = { ctx, source, analyser };
    wiringByElement.set(audio, wiring);
    return wiring;
  } catch {
    return null;
  }
}

export function AudioVisualizer({
  audioRef,
  barCount = 128,
  smoothing = 0.72,
  fftSize = 1024,
  maxBinRatio = 0.75,
  className,
  ...rest
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    let raf: number | null = null;
    let cachedColor = "currentColor";
    let dataArray: Uint8Array<ArrayBuffer> | null = null;

    function refreshColor() {
      if (!canvas) return;
      const c = getComputedStyle(canvas).color;
      if (c) cachedColor = c;
    }

    function syncSize(): { w: number; h: number } {
      if (!canvas) return { w: 0, h: 0 };
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const targetH = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      return { w: canvas.width, h: canvas.height };
    }

    function paintFlat() {
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      const { w, h } = syncSize();
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.fillStyle = cachedColor;
      const dpr = window.devicePixelRatio || 1;
      const gap = Math.max(1, Math.floor(dpr));
      const barWidth = Math.max(1, (w - gap * (barCount - 1)) / barCount);
      const midY = h / 2;
      const lineH = Math.max(1, Math.floor(dpr));
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        ctx2d.fillRect(x, midY - lineH / 2, barWidth, lineH);
      }
    }

    function draw() {
      const wiring = wiringByElement.get(audio!);
      if (!wiring || !canvas) {
        raf = null;
        return;
      }
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) {
        raf = null;
        return;
      }
      const analyser = wiring.analyser;
      const bins = analyser.frequencyBinCount;
      if (!dataArray || dataArray.length !== bins) {
        dataArray = new Uint8Array(new ArrayBuffer(bins));
      }
      analyser.getByteFrequencyData(dataArray);

      const { w, h } = syncSize();
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.fillStyle = cachedColor;

      const dpr = window.devicePixelRatio || 1;
      const gap = Math.max(1, Math.floor(dpr));
      const barWidth = Math.max(1, (w - gap * (barCount - 1)) / barCount);
      const midY = h / 2;
      const halfMax = (h / 2) * 0.95;
      const radius = Math.min(barWidth / 2, 3 * dpr);
      const useRound = typeof ctx2d.roundRect === "function";

      // Drop the upper portion of the spectrum (where music has near-zero
      // energy) and concentrate sampling on the lower bins. The power scale
      // then biases bars further toward the very low end.
      const usableBins = Math.max(1, Math.floor(bins * Math.min(1, Math.max(0.05, maxBinRatio))));
      // Mirror: low freqs at the center, higher freqs expanding outward to
      // both edges. distance-from-center → frequency index, with a strict
      // monotonic step so successive central bars never share a bin (which
      // would otherwise look like a fused, lockstep blob in the middle).
      const center = (barCount - 1) / 2;
      const maxDist = Math.max(1, center);
      const halfCount = Math.ceil(barCount / 2);
      const distOffset = barCount % 2 === 0 ? 0.5 : 0;
      const binByDist = new Int32Array(halfCount);
      let prevIdx = -1;
      for (let d = 0; d < halfCount; d++) {
        const t = (d + distOffset) / maxDist;
        const raw = Math.floor(Math.pow(t, 1.6) * usableBins);
        const next = Math.min(usableBins - 1, Math.max(raw, prevIdx + 1));
        binByDist[d] = next;
        prevIdx = next;
      }

      for (let i = 0; i < barCount; i++) {
        const d = Math.min(halfCount - 1, Math.floor(Math.abs(i - center)));
        const idx = binByDist[d];
        const amp = dataArray[idx] / 255;
        const halfBarH = Math.max(0.5, amp * halfMax);
        const x = i * (barWidth + gap);
        const y = midY - halfBarH;
        const barH = halfBarH * 2;
        ctx2d.beginPath();
        if (useRound) {
          ctx2d.roundRect(x, y, barWidth, barH, radius);
        } else {
          ctx2d.rect(x, y, barWidth, barH);
        }
        ctx2d.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    function start() {
      if (!audio) return;
      const wiring = getOrCreateWiring(audio, fftSize, smoothing);
      if (!wiring) return;
      if (wiring.ctx.state === "suspended") {
        wiring.ctx.resume().catch(() => {});
      }
      refreshColor();
      if (raf === null) raf = requestAnimationFrame(draw);
    }

    function stop() {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      paintFlat();
    }

    refreshColor();
    paintFlat();

    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);

    const ro = "ResizeObserver" in window ? new ResizeObserver(() => {
      if (raf === null) paintFlat();
    }) : null;
    ro?.observe(canvas);

    if (!audio.paused) start();

    return () => {
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
      ro?.disconnect();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      // Intentionally do NOT close the AudioContext or disconnect the source —
      // the wiring is keyed to the <audio> element and reused across remounts;
      // tearing it down would silence the audio if the parent re-renders.
    };
  }, [audioRef, barCount, smoothing, fftSize, maxBinRatio]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-16 w-full text-primary", className)}
      {...rest}
    />
  );
}
