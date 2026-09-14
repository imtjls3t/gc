import { useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, X, ShieldCheck } from 'lucide-react';
import { type CardFields, type Expiry, parseMoney, moneyInput } from './model';

export function go(path: string) {
  const from = location.hash.slice(1) || '/wallet';
  if (path === from) return;
  history.pushState({ from }, '', `#${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export function goBack(path: string) {
  if (history.state?.from === path) history.back();
  else go(path);
}
export function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/wallet');
  useEffect(() => {
    const update = () => {
      setRoute(location.hash.slice(1) || '/wallet');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}
export function useBlob(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url;
}
export function BlobImage({
  blob,
  alt,
  className = '',
}: {
  blob?: Blob;
  alt: string;
  className?: string;
}) {
  const url = useBlob(blob);
  return url ? (
    <img src={url} alt={alt} className={className} />
  ) : (
    <span className="image-placeholder" aria-label="Loading image" />
  );
}
export function Logo({ retailer, large = false }: { retailer: string; large?: boolean }) {
  const brand = retailer.trim().toLowerCase();
  return (
    <span
      className={`retailer-logo ${brand === 'starbucks' ? 'starbucks' : brand === 'costco' ? 'costco' : 'generic'} ${large ? 'large' : ''}`}
    >
      {['costco', 'starbucks'].includes(brand) ? (
        <img
          src={`${import.meta.env.BASE_URL}logos/${brand === 'costco' ? 'costco.png' : 'starbucks.svg'}`}
          alt={`${retailer} logo`}
        />
      ) : (
        <span aria-hidden="true">
          {retailer
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((s) => s[0])
            .join('')
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}
export function PageTop({
  title,
  back = '/wallet',
  children,
}: {
  title: string;
  back?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-top">
      <button className="icon-button" onClick={() => go(back)} aria-label="Back">
        <ArrowLeft size={22} />
      </button>
      <h1>{title}</h1>
      {children}
    </header>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="notice error" role="alert">
      {message}
    </p>
  ) : null;
}
export function PrivacyNote() {
  return (
    <p className="privacy-note">
      <ShieldCheck size={15} /> Saved only on this device
    </p>
  );
}

export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      aria-label={title}
    >
      <div className="dialog-body">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function usePinVisibility() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const hide = () => setShown(false);
    const visibility = () => {
      if (document.hidden) hide();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', hide);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', hide);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
  return [shown, setShown] as const;
}
export function Pin({ pin }: { pin?: string }) {
  const [shown, setShown] = usePinVisibility();
  if (!pin) return <p className="muted">No PIN recorded</p>;
  return (
    <div className="pin">
      <span>PIN</span>
      <strong className="monospace" aria-live="polite">
        {shown ? pin : '••••••'}
      </strong>
      <button className="text-button" onClick={() => setShown(!shown)} aria-pressed={shown}>
        {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        {shown ? 'Hide PIN' : 'Show PIN'}
      </button>
    </div>
  );
}
export interface FormInitial {
  retailer: string;
  original: string;
  starting: string;
  pin: string;
  expiry: Expiry;
}
export function fieldsInitial(fields: CardFields): FormInitial {
  return {
    retailer: fields.retailer,
    original: moneyInput(fields.originalCents),
    starting: moneyInput(fields.startingCents),
    pin: fields.pin || '',
    expiry: fields.expiry,
  };
}
export function CardForm({
  initial,
  submitLabel,
  onSave,
  children,
  disabled = false,
}: {
  initial: FormInitial;
  submitLabel: string;
  onSave: (fields: CardFields) => Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const formId = useId();
  const [retailer, setRetailer] = useState(initial.retailer);
  const [original, setOriginal] = useState(initial.original);
  const [starting, setStarting] = useState(initial.starting);
  const [pin, setPin] = useState(initial.pin);
  const [showPin, setShowPin] = usePinVisibility();
  const [expiryKind, setExpiryKind] = useState<Expiry['kind']>(initial.expiry.kind);
  const [expiryDate, setExpiryDate] = useState(
    initial.expiry.kind === 'date' ? initial.expiry.date : '',
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave({
        retailer,
        originalCents: parseMoney(original),
        startingCents: parseMoney(starting),
        pin: pin || undefined,
        expiry: expiryKind === 'date' ? { kind: 'date', date: expiryDate } : { kind: expiryKind },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="card-form" autoComplete="off">
      <label>
        Retailer
        <input
          required
          value={retailer}
          onChange={(e) => setRetailer(e.target.value)}
          placeholder="e.g. Costco"
          maxLength={100}
          list="retailers"
        />
      </label>
      <datalist id="retailers">
        <option value="Costco" />
        <option value="Starbucks" />
      </datalist>
      <div className="form-row">
        <label>
          Original amount <span className="field-unit">CAD</span>
          <input
            required
            inputMode="decimal"
            value={original}
            placeholder="0.00"
            onChange={(e) => {
              setOriginal(e.target.value);
              if (starting === original) setStarting(e.target.value);
            }}
          />
        </label>
        <label>
          Starting balance <span className="field-unit">CAD</span>
          <input
            required
            inputMode="decimal"
            value={starting}
            placeholder="0.00"
            onChange={(e) => setStarting(e.target.value)}
          />
        </label>
      </div>
      <p className="field-help">
        Already used some? Enter the balance when you added this card. Recorded spending is
        subtracted from here.
      </p>
      <div>
        <label htmlFor={`${formId}-pin`}>
          PIN <span className="field-unit">optional</span>
        </label>
        <div className="input-with-button">
          <input
            id={`${formId}-pin`}
            type={showPin ? 'text' : 'password'}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter a PIN, if needed"
            autoComplete="new-password"
            spellCheck={false}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={showPin ? 'Hide entered PIN' : 'Show entered PIN'}
            onClick={() => setShowPin(!showPin)}
          >
            {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor={`${formId}-expiry`}>Expiry</label>
        <select
          id={`${formId}-expiry`}
          value={expiryKind}
          onChange={(e) => setExpiryKind(e.target.value as Expiry['kind'])}
        >
          <option value="none">No expiry</option>
          <option value="date">A specific date</option>
          <option value="unknown">Not recorded / unknown</option>
        </select>
      </div>
      {expiryKind === 'date' && (
        <label>
          Expiry date
          <input
            type="date"
            required
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </label>
      )}
      {children}
      <ErrorMessage message={error} />
      <button className="button primary full" disabled={busy || disabled} type="submit">
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
