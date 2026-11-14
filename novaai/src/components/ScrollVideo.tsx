import { useEffect, useRef, useState } from 'react';

export const HERO_VIDEO_URL = 'https://meez.design/web/media/prompt-media/v/256a995befea43be.mp4';
const POSTER_URL = '/hero-poster.jpg';

const MAX_FRAMES = 90;
const FRAMES_PER_SECOND = 12;
const MIN_FRAMES = 24;
const MAX_FRAME_WIDTH = 960;
const LERP = 0.12;

type Drawable = CanvasImageSource & { width: number; height: number };

function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (!sw || !sh || !cw || !ch) return;
  const scale = Math.max(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

function waitFor(el: HTMLMediaElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`video error while waiting for ${event}`));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener('error', fail);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', fail, { once: true });
  });
}

async function extractFrames(url: string, isCancelled: () => boolean): Promise<ImageBitmap[]> {
  const off = document.createElement('video');
  off.crossOrigin = 'anonymous';
  off.muted = true;
  off.playsInline = true;
  off.preload = 'auto';
  off.src = url;
  await waitFor(off, 'loadeddata');

  const duration = off.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('invalid duration');

  const count = Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.floor(duration * FRAMES_PER_SECOND)));
  const width = Math.min(MAX_FRAME_WIDTH, off.videoWidth);
  const height = Math.round((off.videoHeight / off.videoWidth) * width);
  const end = Math.max(0, duration - 0.05);

  const frames: ImageBitmap[] = [];
  for (let i = 0; i < count; i++) {
    if (isCancelled()) break;
    off.currentTime = (i / (count - 1)) * end;
    await waitFor(off, 'seeked');
    frames.push(await createImageBitmap(off, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }));
  }
  off.removeAttribute('src');
  off.load();
  return frames;
}

export default function ScrollVideo({ src = HERO_VIDEO_URL }: { src?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageBitmap[]>([]);
  const [hasFrame, setHasFrame] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  // Frame cache: start after the visible video has decoded data, plus a 300ms yield.
  useEffect(() => {
    if (!hasFrame) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      extractFrames(src, () => cancelled)
        .then((frames) => {
          if (cancelled || frames.length < 2) {
            frames.forEach((f) => f.close());
            return;
          }
          framesRef.current = frames;
          setCacheReady(true);
        })
        .catch(() => {
          /* CORS or decode failure: stay on the seek fallback */
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasFrame, src]);

  useEffect(
    () => () => {
      framesRef.current.forEach((f) => f.close());
      framesRef.current = [];
    },
    [],
  );

  // Scroll → smoothed progress → draw / seek.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let smoothed = 0;
    let lastIndex = -1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      lastIndex = -1;
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      smoothed += (target - smoothed) * LERP;

      const frames = framesRef.current;
      if (frames.length > 1) {
        const index = Math.round(smoothed * (frames.length - 1));
        if (index !== lastIndex) {
          const frame = frames[index] as Drawable;
          drawCover(ctx, frame, frame.width, frame.height);
          lastIndex = index;
        }
      } else if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        const time = smoothed * (video.duration - 0.05);
        if (!video.seeking && Math.abs(video.currentTime - time) > 0.04) {
          video.currentTime = time;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const showVideo = hasFrame && !cacheReady;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]" aria-hidden="true">
      {!posterFailed && (
        <img
          src={POSTER_URL}
          alt=""
          onError={() => setPosterFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            hasFrame || cacheReady ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setHasFrame(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          showVideo ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          cacheReady ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
