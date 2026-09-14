import {
  Archive,
  ArrowUpRight,
  Gift,
  History,
  Image,
  Plus,
  ScanLine,
  Undo2,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { type Card, type Spend, expiryLabel, money, remaining } from './model';
import { friendlyError, setArchived } from './db';
import { ErrorMessage, go, Logo, PrivacyNote } from './ui';
import { SpendDialog } from './details';

export function openCheckout(id: string) {
  void document.documentElement.requestFullscreen?.().catch(() => {});
  go(`/checkout/${id}`);
}
export function Wallet({
  cards,
  spends,
  archived,
  add,
}: {
  cards: Card[];
  spends: Spend[];
  archived: boolean;
  add: () => void;
}) {
  const [spending, setSpending] = useState<Card>(),
    [error, setError] = useState('');
  const active = cards.filter((c) => !c.archived),
    archivedCards = cards.filter((c) => c.archived);
  const shown = (archived ? archivedCards : active).sort((a, b) => b.addedAt - a.addedAt);
  const total = active.reduce((sum, card) => sum + remaining(card, spends), 0);
  async function archive(card: Card) {
    try {
      await setArchived(card.id, !card.archived);
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  return (
    <main className="shell wallet-shell">
      <section className="balance-hero" aria-label="Active wallet balance">
        <div>
          <span className="balance-label">TOTAL BALANCE</span>
          <div className="hero-amount">
            {money(total)}
            <span>CAD</span>
          </div>
          <p>
            {active.length} active {active.length === 1 ? 'gift card' : 'gift cards'}
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="mini-card card-back">
            <Gift size={30} />
          </div>
          <div className="mini-card card-front">
            <span className="mini-chip" />
            <ArrowUpRight size={23} />
          </div>
          <span className="art-star">✳</span>
        </div>
      </section>
      <div className="wallet-section-heading">
        <h2>Your cards</h2>
        <span className="sort-label">Newest first</span>
      </div>
      <nav className="tabs" aria-label="Wallet tabs">
        <a href="#/wallet" aria-current={!archived ? 'page' : undefined}>
          Active <span>{active.length}</span>
        </a>
        <a href="#/archived" aria-current={archived ? 'page' : undefined}>
          Archived <span>{archivedCards.length}</span>
        </a>
      </nav>
      <ErrorMessage message={error} />
      {!shown.length ? (
        <section className="empty-wallet">
          <div className="empty-illustration" aria-hidden="true">
            <span className="empty-orbit" />
            <WalletCards size={48} strokeWidth={1.25} />
            <span className="small-spark">✳</span>
          </div>
          {archived && <p>No archived cards</p>}
          {!archived && (
            <button className="button primary" onClick={add}>
              <Plus size={18} />
              Add card
            </button>
          )}
        </section>
      ) : (
        <div className="card-grid">
          {shown.map((card) => {
            const balance = remaining(card, spends);
            return (
              <article className={`gift-card brand-${card.retailer.toLowerCase()}`} key={card.id}>
                <button
                  className="gift-card-main"
                  onClick={() => openCheckout(card.id)}
                  aria-label={`Open ${card.retailer} barcode, ${money(balance)} remaining`}
                >
                  <div className="gift-card-heading">
                    <Logo retailer={card.retailer} />
                    <div>
                      <h3>{card.retailer}</h3>
                      <span>GIFT CARD</span>
                    </div>
                    <span className="card-scan-icon">
                      <ScanLine size={21} />
                    </span>
                  </div>
                  <div className="card-balance">
                    <strong>{money(balance)}</strong>
                    <span>
                      remaining <span className="currency">CAD</span>
                    </span>
                  </div>
                  <div className="card-meta">
                    <span>{money(card.originalCents)} original</span>
                    <span>{expiryLabel(card.expiry)}</span>
                  </div>
                  <div className="balance-track">
                    <span
                      style={{
                        width: `${card.originalCents ? Math.min(100, (balance / card.originalCents) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </button>
                <div className="card-actions">
                  <button
                    onClick={() => setSpending(card)}
                    aria-label={`Record spending for ${card.retailer}`}
                  >
                    <Plus size={16} />
                    <span>Spend</span>
                  </button>
                  <button
                    onClick={() => go(`/card/${card.id}`)}
                    aria-label={`Details and history for ${card.retailer}`}
                  >
                    <History size={16} />
                    <span>Details</span>
                  </button>
                  <button
                    onClick={() => go(`/image/${card.id}?from=${archived ? 'archived' : 'wallet'}`)}
                    aria-label={`View original ${card.retailer} screenshot`}
                  >
                    <Image size={16} />
                    <span>Image</span>
                  </button>
                  <button
                    onClick={() => void archive(card)}
                    aria-label={`${card.archived ? 'Restore' : 'Archive'} ${card.retailer}`}
                  >
                    {card.archived ? <Undo2 size={16} /> : <Archive size={16} />}
                    <span>{card.archived ? 'Restore' : 'Archive'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <PrivacyNote />
      <button className="fab" onClick={add} aria-label="Add gift card">
        <Plus size={27} />
      </button>
      {spending && (
        <SpendDialog card={spending} spends={spends} close={() => setSpending(undefined)} />
      )}
    </main>
  );
}
