import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Image, Maximize, Plus, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { db } from './db';
import { type Card, type Spend, money, remaining } from './model';
import { go, goBack, Logo, Pin, useBlob } from './ui';
import { SpendDialog } from './details';
import costcoCard from '../assets/costco.png';

function useWakeLock() {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    let active = true,
      pending = false,
      lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (!active || pending || lock || document.hidden || !navigator.wakeLock) return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (!active || document.hidden) {
          await next.release();
          return;
        }
        lock = next;
        setAwake(!next.released);
        next.addEventListener('release', () => {
          if (lock === next) lock = undefined;
          if (active) setAwake(false);
        });
      } catch {
        if (active) setAwake(false);
      } finally {
        pending = false;
      }
    };
    const visibility = () => {
      if (!document.hidden) void acquire();
      else {
        void lock?.release().catch(() => {});
        setAwake(false);
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
      void lock?.release().catch(() => {});
    };
  }, []);
  return awake;
}
export function Checkout({ card, spends }: { card: Card; spends: Spend[] }) {
  const stored = useLiveQuery(
    () => db.images.get(card.barcode.displayImageId),
    [card.barcode.displayImageId],
  );
  const url = useBlob(stored?.blob),
    awake = useWakeLock();
  const [spending, setSpending] = useState(false),
    [fullscreenMessage, setFullscreenMessage] = useState('');
  const back = card.archived ? '/archived' : '/wallet';
  const manualFullscreenExit = useRef(false),
    leaving = useRef(false);
  function close() {
    if (leaving.current || location.hash !== `#/checkout/${card.id}`) return;
    leaving.current = true;
    goBack(back);
  }
  useEffect(() => {
    // Put the wallet immediately behind checkout, including entry from details
    // or a direct/reloaded barcode URL. Preserve that entry on subsequent reloads.
    if (history.state?.from !== back) {
      const checkout = location.hash.slice(1);
      history.replaceState(null, '', `#${back}`);
      go(checkout);
    }
    leaving.current = false;
    let wasFullscreen = !!document.fullscreenElement;
    const changed = () => {
      const isFullscreen = !!document.fullscreenElement;
      // Android Back can exit fullscreen without traversing browser history.
      if (wasFullscreen && !isFullscreen && !manualFullscreenExit.current) close();
      wasFullscreen = isFullscreen;
      if (!isFullscreen) manualFullscreenExit.current = false;
    };
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [card.id, back]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement) {
        manualFullscreenExit.current = true;
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        setFullscreenMessage(
          'Fullscreen isn’t available here. The barcode still works in this view.',
        );
    } catch {
      manualFullscreenExit.current = false;
      setFullscreenMessage(
        'Fullscreen isn’t available here. The barcode still works in this view.',
      );
    }
  }
  return (
    <main className="checkout">
      <header className="checkout-top">
        <button className="icon-button" onClick={close} aria-label="Exit checkout">
          <ArrowLeft size={23} />
        </button>
        <div className="checkout-brand">
          <Logo retailer={card.retailer} />
          <div>
            <strong>{card.retailer}</strong>
            <span>{money(remaining(card, spends))} remaining</span>
          </div>
        </div>
        <button
          className="icon-button"
          onClick={() => void fullscreen()}
          aria-label="Toggle fullscreen"
        >
          <Maximize size={21} />
        </button>
      </header>
      <p className="brightness-note">
        <Sun size={17} />
        Turn up your screen brightness for scanning.
      </p>
      {fullscreenMessage && (
        <p className="fullscreen-note" role="status">
          {fullscreenMessage}
        </p>
      )}
      {card.retailer.trim().toLowerCase() === 'costco' && (
        <img
          className="checkout-card-art"
          src={costcoCard}
          alt="Costco Shop Card"
          width={243}
          height={153}
        />
      )}
      <div className="barcode-stage" aria-label="Payment barcode">
        <div className="barcode-fit">
          {url ? (
            <img src={url} alt={`${card.retailer} payment barcode`} />
          ) : (
            <p>Loading barcode…</p>
          )}
        </div>
      </div>
      <div className="checkout-bottom">
        {card.barcode.text && <p className="barcode-number monospace">{card.barcode.text}</p>}
        <Pin pin={card.pin} />
        <div className="checkout-controls">
          <button
            className="button secondary"
            onClick={() => go(`/image/${card.id}?from=checkout`)}
          >
            <Image size={18} />
            Original image
          </button>
          <button className="button secondary" onClick={() => setSpending(true)}>
            <Plus size={18} />
            Add Spend
          </button>
        </div>
        <p className="awake-status">
          <span className={awake ? 'status-dot' : 'status-dot muted-dot'} />
          {awake ? 'Keeping your screen awake' : 'Tap your screen if it begins to dim'}
        </p>
      </div>
      {spending && <SpendDialog card={card} spends={spends} close={() => setSpending(false)} />}
    </main>
  );
}
export function ImageViewer({ card, from }: { card: Card; from: string }) {
  const original = useLiveQuery(() => db.images.get(card.originalImageId), [card.originalImageId]);
  const url = useBlob(original?.blob),
    [zoom, setZoom] = useState(1);
  const back = ['checkout', 'card'].includes(from)
    ? `/${from}/${card.id}`
    : from === 'archived'
      ? '/archived'
      : '/wallet';
  return (
    <main className="image-viewer">
      <header className="viewer-toolbar">
        <button className="icon-button" aria-label="Close image" onClick={() => goBack(back)}>
          <ArrowLeft size={22} />
        </button>
        <div>
          <strong>Original screenshot</strong>
          <span>{card.retailer} · unmodified</span>
        </div>
        <button
          className="icon-button"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
        >
          <ZoomOut size={21} />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          disabled={zoom >= 4}
          onClick={() => setZoom(Math.min(4, zoom + 0.5))}
        >
          <ZoomIn size={21} />
        </button>
      </header>
      <div className="viewer-canvas">
        {url ? (
          <img
            src={url}
            alt={`Original ${card.retailer} gift card screenshot`}
            style={{ width: `${zoom * 100}%` }}
          />
        ) : (
          <p>Loading original…</p>
        )}
      </div>
      <footer>
        <span>Pinch to zoom · scroll to explore</span>
        <button className="text-button" onClick={() => setZoom(1)}>
          Reset {Math.round(zoom * 100)}%
        </button>
      </footer>
    </main>
  );
}
