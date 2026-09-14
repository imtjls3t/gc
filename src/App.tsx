import { Component, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownToLine, Check, Info, ShieldCheck, WalletCards } from 'lucide-react';
import { db } from './db';
import { usePWA } from './pwa';
import { go, Modal, useRoute } from './ui';
import { Wallet } from './Wallet';
import { ImportCard } from './Import';
import { CardDetails } from './details';
import { Checkout, ImageViewer } from './Checkout';

export default function App() {
  // GitHub Pages cannot set a frame-ancestors response header. Refuse to mount
  // the wallet in frames so another page cannot overlay its sensitive controls.
  if (window.self !== window.top)
    return (
      <main className="shell">
        <p>Open Giftcards directly in your browser to use your wallet.</p>
      </main>
    );
  return (
    <StorageBoundary>
      <WalletApp />
    </StorageBoundary>
  );
}
function WalletApp() {
  const route = useRoute(),
    pwa = usePWA();
  const fileInput = useRef<HTMLInputElement>(null),
    [file, setFile] = useState<File>(),
    [importId, setImportId] = useState(0);
  const [info, setInfo] = useState(false),
    [installHelp, setInstallHelp] = useState(false),
    [updateConfirm, setUpdateConfirm] = useState(false);
  const wallet = useLiveQuery(async () => ({
    cards: await db.cards.toArray(),
    spends: await db.spends.toArray(),
  }));
  const [pathname, search = ''] = route.split('?'),
    [, screen = 'wallet', id] = pathname.split('/');
  const immersive = screen === 'checkout' || screen === 'image';
  const card = wallet?.cards.find((c) => c.id === id);
  const choose = () => fileInput.current?.click();
  return (
    <>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        ref={fileInput}
        className="file-input"
        aria-label="Choose gift card screenshot"
        onChange={(e) => {
          const next = e.target.files?.[0];
          if (next) {
            setFile(next);
            setImportId((n) => n + 1);
            go('/import');
          }
          e.target.value = '';
        }}
      />
      {!immersive && (
        <header className="app-header">
          <div className="header-inner">
            <a className="wordmark" href="#/wallet" aria-label="Giftcards home">
              <img src={`${import.meta.env.BASE_URL}icons/pocket.svg`} alt="" />
              Giftcards
            </a>
            <div className="header-actions">
              <span className={`offline-status ${pwa.ready ? 'is-ready' : ''}`} role="status">
                {pwa.ready ? <Check size={14} /> : <span className="status-dot muted-dot" />}
                {pwa.ready
                  ? 'Ready offline'
                  : !pwa.offlineSupported
                    ? 'Online only'
                    : pwa.failed
                      ? 'Offline setup failed'
                      : 'Preparing offline…'}
              </span>
              <button
                className="icon-button"
                onClick={() => setInfo(true)}
                aria-label="About your wallet"
              >
                <Info size={19} />
              </button>
              <button
                className="install-button"
                aria-label="Install Giftcards"
                onClick={() => {
                  if (pwa.canInstall) void pwa.install();
                  else setInstallHelp(true);
                }}
              >
                <ArrowDownToLine size={16} />
                <span>Install</span>
              </button>
            </div>
          </div>
        </header>
      )}
      {!immersive && pwa.update && (
        <div className="update-banner">
          <span>An update is available.</span>
          <button className="text-button" onClick={() => setUpdateConfirm(true)}>
            Update app
          </button>
        </div>
      )}
      {!wallet ? (
        <main className="loading-wallet" role="status">
          <span className="spinner" />
          <p>Opening your wallet…</p>
        </main>
      ) : screen === 'import' ? (
        <ImportCard key={importId} file={file} choose={choose} done={() => setFile(undefined)} />
      ) : ['card', 'checkout', 'image'].includes(screen) ? (
        card ? (
          screen === 'card' ? (
            <CardDetails key={id} card={card} spends={wallet.spends} />
          ) : screen === 'checkout' ? (
            <Checkout key={id} card={card} spends={wallet.spends} />
          ) : (
            <ImageViewer
              key={id}
              card={card}
              from={new URLSearchParams(search).get('from') || 'wallet'}
            />
          )
        ) : (
          <main className="shell empty-wallet">
            <h1>Card not found</h1>
            <p>This card isn’t in this browser’s wallet.</p>
            <button className="button primary" onClick={() => go('/wallet')}>
              Back to wallet
            </button>
          </main>
        )
      ) : (
        <Wallet
          cards={wallet.cards}
          spends={wallet.spends}
          archived={screen === 'archived'}
          add={choose}
        />
      )}
      {info && (
        <Modal title="A wallet that stays with you" close={() => setInfo(false)}>
          <div className="about-icon">
            <ShieldCheck size={30} />
          </div>
          <p>
            Giftcards keeps cards, PINs, screenshots, and spending in this browser on this device.
            There are no accounts, uploads, analytics, or retailer balance lookups.
          </p>
          <p>Balances use the spending you record. All amounts are in Canadian dollars.</p>
          <p>
            Clearing site data or losing your phone can erase your wallet. Keep your source gift
            cards somewhere safe. Persistent storage reduces the risk of automatic cleanup; your
            browser decides whether to grant it.
          </p>
          <p>
            {pwa.ready
              ? 'All app and recognition files are cached. You can import and use cards offline.'
              : !pwa.offlineSupported
                ? 'You can import cards and record spending at this address. Installation and offline use require HTTPS and a browser with service-worker support.'
                : 'Leave the app open with an internet connection until “Ready offline” appears. This includes the files needed to read screenshots.'}
          </p>
          {!pwa.ready && pwa.offlineSupported && (
            <button className="button secondary" onClick={() => void pwa.retry().catch(() => {})}>
              Retry offline setup
            </button>
          )}
          <p className="field-help">
            Retailer trademarks belong to their owners. Giftcards is not affiliated with Costco or
            Starbucks.
          </p>
        </Modal>
      )}
      {installHelp && (
        <Modal title="Make yourself at home" close={() => setInstallHelp(false)}>
          <div className="about-icon">
            <WalletCards size={31} />
          </div>
          {pwa.offlineSupported ? (
            <>
              <p>
                In Android Chrome, open the ⋮ menu and choose <strong>Add to Home screen</strong> or{' '}
                <strong>Install app</strong>.
              </p>
              <p>
                Once you see “Ready offline,” your wallet and screenshot recognition work without a
                connection.
              </p>
            </>
          ) : (
            <p>
              Installation and offline use require HTTPS and a browser with service-worker support.
              You can still import cards, view barcodes, and record spending here.
            </p>
          )}
          <button className="button primary full" onClick={() => setInstallHelp(false)}>
            Got it
          </button>
        </Modal>
      )}
      {updateConfirm && (
        <Modal title="Update Giftcards?" close={() => setUpdateConfirm(false)}>
          <p>
            Your saved cards and spending will stay. The app will reload, so finish or save any open
            changes before updating.
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setUpdateConfirm(false)}>
              Later
            </button>
            <button className="button primary" onClick={() => void pwa.acceptUpdate()}>
              Update and reload
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
class StorageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="shell empty-wallet">
        <h1>Your wallet couldn’t open.</h1>
        <p>Check your browser’s storage settings and available space, then try again.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
