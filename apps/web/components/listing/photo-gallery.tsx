'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  photos: string[];
  alt: string;
};

export function PhotoGallery({ photos, alt }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const open = useCallback((i: number) => setOpenIndex(i), []);
  const close = useCallback(() => setOpenIndex(null), []);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-sm border border-dashed border-line-2 bg-bg-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
        Sense fotografies
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => open(0)}
          className="group relative aspect-[16/9] w-full overflow-hidden rounded-sm border border-line-1 bg-bg-2"
          aria-label={`Ampliar foto · ${alt}`}
        >
          <Image
            src={photos[0]!}
            alt={`Foto principal de ${alt}`}
            fill
            sizes="(min-width: 1024px) 720px, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            priority
          />
          <ZoomBadge />
        </button>
        {openIndex !== null && (
          <Lightbox
            photos={photos}
            startIndex={openIndex}
            alt={alt}
            onClose={close}
          />
        )}
      </>
    );
  }

  const extraCount = Math.max(0, photos.length - 5);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => open(0)}
        className="group relative aspect-[16/9] w-full overflow-hidden rounded-sm border border-line-1 bg-bg-2"
        aria-label={`Ampliar foto · ${alt}`}
      >
        <Image
          src={photos[0]!}
          alt={`Foto principal de ${alt}`}
          fill
          sizes="(min-width: 1024px) 720px, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          priority
        />
        <ZoomBadge />
      </button>
      <div className="grid grid-cols-4 gap-2">
        {photos.slice(1, 5).map((src, i) => {
          const photoIdx = i + 1;
          const isLastVisible = i === 3 && extraCount > 0;
          return (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => open(photoIdx)}
              className="group relative aspect-[4/3] overflow-hidden rounded-sm border border-line-1 bg-bg-2"
              aria-label={
                isLastVisible
                  ? `Veure totes les ${photos.length} fotos`
                  : `Ampliar foto ${photoIdx + 1}`
              }
            >
              <Image
                src={src}
                alt={`Foto ${photoIdx + 1} de ${alt}`}
                fill
                sizes="180px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
              {isLastVisible && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg-0/70 font-mono text-[12px] uppercase tracking-[0.16em] text-cyan">
                  +{extraCount} més
                </div>
              )}
            </button>
          );
        })}
      </div>
      {openIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={openIndex}
          alt={alt}
          onClose={close}
        />
      )}
    </div>
  );
}

function ZoomBadge() {
  return (
    <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 border border-line-2 bg-bg-0/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <ZoomIcon />
      Ampliar
    </span>
  );
}

type LightboxProps = {
  photos: string[];
  startIndex: number;
  alt: string;
  onClose: () => void;
};

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;

function Lightbox({ photos, startIndex, alt, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % photos.length);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photos.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + photos.length) % photos.length);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photos.length]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => {
          const nz = Math.max(ZOOM_MIN, z - ZOOM_STEP);
          if (nz === 1) setPan({ x: 0, y: 0 });
          return nz;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose, resetView]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const delta = -e.deltaY * 0.0025;
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta * (z + 0.5)));
      if (nz === 1) setPan({ x: 0, y: 0 });
      return nz;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const src = photos[index]!;
  const zoomed = zoom > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualitzador de fotografies"
      className="fixed inset-0 z-50 flex flex-col bg-bg-0/95 backdrop-blur-sm"
    >
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-line-1 px-4 py-3">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          <span className="tabular-nums text-ink-1">
            {index + 1} / {photos.length}
          </span>
          <span aria-hidden>·</span>
          <span className="hidden sm:inline">{alt}</span>
        </div>
        <div className="flex items-center gap-2">
          <ToolButton
            label="Allunyar"
            onClick={() => {
              setZoom((z) => {
                const nz = Math.max(ZOOM_MIN, z - ZOOM_STEP);
                if (nz === 1) setPan({ x: 0, y: 0 });
                return nz;
              });
            }}
            disabled={zoom <= ZOOM_MIN}
          >
            −
          </ToolButton>
          <span className="min-w-[40px] text-center font-mono text-[11px] tabular-nums text-ink-2">
            {Math.round(zoom * 100)}%
          </span>
          <ToolButton
            label="Apropar"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
            disabled={zoom >= ZOOM_MAX}
          >
            +
          </ToolButton>
          <ToolButton label="Restablir" onClick={resetView} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}>
            <ResetIcon />
          </ToolButton>
          <ToolButton label="Tancar (Esc)" onClick={onClose}>
            <CloseIcon />
          </ToolButton>
        </div>
      </header>

      {/* Stage */}
      <div
        className="relative flex-1 overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: zoomed ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          onClick={(e) => {
            // Click on backdrop closes only when not zoomed (to avoid closing while panning)
            if (e.target === e.currentTarget && !zoomed) onClose();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Foto ${index + 1} de ${alt}`}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-150 ease-out"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              willChange: 'transform',
            }}
            onDoubleClick={() => {
              if (zoom === 1) setZoom(2);
              else resetView();
            }}
          />
        </div>

        {/* Prev / next */}
        {photos.length > 1 && (
          <>
            <NavButton side="left" onClick={prev} label="Anterior" />
            <NavButton side="right" onClick={next} label="Següent" />
          </>
        )}
      </div>

      {/* Thumbstrip */}
      {photos.length > 1 && (
        <div className="shrink-0 overflow-x-auto border-t border-line-1 bg-bg-1 px-3 py-2">
          <div className="flex gap-2">
            {photos.map((src, i) => {
              const active = i === index;
              return (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    resetView();
                  }}
                  aria-current={active ? 'true' : undefined}
                  className={
                    'relative h-14 w-20 shrink-0 overflow-hidden rounded-sm border transition-colors ' +
                    (active
                      ? 'border-cyan'
                      : 'border-line-2 opacity-60 hover:border-line-1 hover:opacity-100')
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className="inline-flex h-8 min-w-[32px] items-center justify-center border border-line-2 bg-bg-1 px-2 font-mono text-[12px] text-ink-1 hover:border-cyan-dim hover:text-cyan disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-2 disabled:hover:text-ink-1"
    >
      {children}
    </button>
  );
}

function NavButton({
  side,
  onClick,
  label,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center border border-line-2 bg-bg-1/70 text-ink-1 backdrop-blur-sm transition-colors hover:border-cyan-dim hover:text-cyan ' +
        (side === 'left' ? 'left-3' : 'right-3')
      }
    >
      {side === 'left' ? <ChevronLeft /> : <ChevronRight />}
    </button>
  );
}

function ZoomIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="6" cy="6" r="4" />
      <path d="m9 9 3.5 3.5M4 6h4M6 4v4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="m3 3 10 10M13 3 3 13" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M3 8a5 5 0 0 1 9-3" />
      <path d="M12 3v3h-3" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m10 3-5 5 5 5" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 3 5 5-5 5" />
    </svg>
  );
}
