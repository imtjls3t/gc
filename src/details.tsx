import { useState, type FormEvent } from 'react';
import { Archive, Image, Pencil, Plus, ScanLine, Trash2, Undo2 } from 'lucide-react';
import {
  type Card,
  type Spend,
  expiryLabel,
  localDateTime,
  money,
  moneyInput,
  parseMoney,
  remaining,
  timestampLabel,
} from './model';
import { deleteSpend, editCard, friendlyError, saveSpend, setArchived } from './db';
import { CardForm, ErrorMessage, fieldsInitial, go, Logo, Modal, PageTop, Pin } from './ui';
import { openCheckout } from './Wallet';

export function SpendDialog({
  card,
  spends,
  entry,
  close,
}: {
  card: Card;
  spends: Spend[];
  entry?: Spend;
  close: () => void;
}) {
  const [amount, setAmount] = useState(entry ? moneyInput(entry.amountCents) : '');
  const [date, setDate] = useState(localDateTime(entry?.spentAt));
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Retain the exact original instant (including seconds / DST offset) if the date was not edited.
      const spentAt =
        entry && date === localDateTime(entry.spentAt) ? entry.spentAt : new Date(date).getTime();
      await saveSpend(card.id, parseMoney(amount), spentAt, entry?.id);
      close();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={entry ? 'Edit spending' : 'Record spending'}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="spend-card-summary">
        <Logo retailer={card.retailer} />
        <div>
          <strong>{card.retailer}</strong>
          <p>{money(remaining(card, spends))} remaining</p>
        </div>
      </div>
      <form onSubmit={submit} className="card-form">
        <label>
          Amount spent <span className="field-unit">CAD</span>
          <input
            required
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Spending date
          <input
            required
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <p className="field-help">
          Dates use your phone’s timezone. The balance updates when you save.
        </p>
        <ErrorMessage message={error} />
        <button className="button primary full" disabled={busy}>
          {busy ? 'Saving…' : entry ? 'Save spending changes' : 'Save spending'}
        </button>
      </form>
    </Modal>
  );
}
export function CardDetails({ card, spends }: { card: Card; spends: Spend[] }) {
  const [editing, setEditing] = useState(false),
    [spending, setSpending] = useState<Spend | 'new'>(),
    [deleting, setDeleting] = useState<Spend>();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [storageNotice, setStorageNotice] = useState(
    () => sessionStorage.getItem('pocket-storage-note') === '1',
  );
  const history = spends.filter((s) => s.cardId === card.id).sort((a, b) => b.spentAt - a.spentAt);
  async function archive() {
    try {
      await setArchived(card.id, !card.archived);
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteSpend(card.id, deleting.id);
      setDeleting(undefined);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell narrow">
      <PageTop title="Card details" back={card.archived ? '/archived' : '/wallet'}>
        <button className="icon-button" aria-label="Edit card" onClick={() => setEditing(true)}>
          <Pencil size={19} />
        </button>
      </PageTop>
      <section className="detail-summary">
        <Logo retailer={card.retailer} large />
        <h2>{card.retailer}</h2>
        {card.archived && <span className="badge">Archived</span>}
        <p className="detail-amount">{money(remaining(card, spends))}</p>
        <span className="muted">remaining · CAD</span>
        <div className="detail-balances">
          <div>
            <span>Original amount</span>
            <strong>{money(card.originalCents)}</strong>
          </div>
          <div>
            <span>Starting balance</span>
            <strong>{money(card.startingCents)}</strong>
          </div>
        </div>
        <p className="expiry">{expiryLabel(card.expiry)}</p>
        <Pin key={editing ? 'editing' : 'details'} pin={card.pin} />
      </section>
      {storageNotice && (
        <div className="notice">
          <p>
            This browser hasn’t granted persistent storage. Keep your source gift cards: clearing
            site data or losing this phone can erase the wallet.
          </p>
          <button
            className="text-button"
            onClick={() => {
              setStorageNotice(false);
              sessionStorage.removeItem('pocket-storage-note');
            }}
          >
            Got it
          </button>
        </div>
      )}
      <div className="detail-buttons">
        <button className="button primary" onClick={() => openCheckout(card.id)}>
          <ScanLine size={19} />
          Show barcode
        </button>
        <button className="button secondary" onClick={() => setSpending('new')}>
          <Plus size={19} />
          Record spending
        </button>
      </div>
      <button className="button image-link" onClick={() => go(`/image/${card.id}?from=card`)}>
        <Image size={19} />
        View original screenshot
      </button>
      <ErrorMessage message={error} />
      <section className="section-block history-section">
        <div className="section-heading">
          <h2>Spending history</h2>
          <span className="badge">{history.length}</span>
        </div>
        {!history.length ? (
          <div className="empty-history">
            <p>No spending recorded yet.</p>
            <span>Little treats will show up here.</span>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <div className="history-dot">
                  <ArrowIcon />
                </div>
                <div className="history-info">
                  <strong>−{money(entry.amountCents)}</strong>
                  <span>{timestampLabel(entry.spentAt)}</span>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Edit spending of ${money(entry.amountCents)}`}
                  onClick={() => setSpending(entry)}
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete spending of ${money(entry.amountCents)}`}
                  onClick={() => {
                    setError('');
                    setDeleting(entry);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="detail-footer">
        <p>Added {timestampLabel(card.addedAt)}</p>
        <button className="text-button" onClick={() => void archive()}>
          {card.archived ? <Undo2 size={17} /> : <Archive size={17} />}
          {card.archived ? 'Restore to active cards' : 'Archive card'}
        </button>
        <p className="field-help">
          {card.archived
            ? 'Your screenshot and history are preserved.'
            : 'Archive when you’re finished. You can restore it anytime.'}
        </p>
      </div>
      {editing && (
        <Modal title="Edit card details" close={() => setEditing(false)}>
          <CardForm
            initial={fieldsInitial(card)}
            submitLabel="Save card changes"
            onSave={async (fields) => {
              try {
                await editCard(card.id, fields);
                setEditing(false);
              } catch (err) {
                throw new Error(friendlyError(err));
              }
            }}
          />
        </Modal>
      )}
      {spending && (
        <SpendDialog
          card={card}
          spends={spends}
          entry={spending === 'new' ? undefined : spending}
          close={() => setSpending(undefined)}
        />
      )}
      {deleting && (
        <Modal
          title="Delete this spending entry?"
          close={() => {
            if (!busy) setDeleting(undefined);
          }}
        >
          <p>
            The {money(deleting.amountCents)} entry from {timestampLabel(deleting.spentAt)} will be
            removed and added back to your balance.
          </p>
          <ErrorMessage message={error} />
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => setDeleting(undefined)}
              disabled={busy}
            >
              Keep entry
            </button>
            <button className="button danger" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete entry'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}
