import { useEffect, useRef, useState } from 'react';
import { Crop, ImagePlus, ScanLine, Check, ArrowRight } from 'lucide-react';
import { type BarcodeCandidate, type CardFields } from './model';
import { db, duplicateOf, DuplicateError, friendlyError, hashImage, saveCard } from './db';
import { scanBarcodes, scanText, validateImage } from './scanner';
import { recognizeText, type Recognition } from './recognition';
import { BlobImage, CardForm, ErrorMessage, go, Modal, PageTop, PrivacyNote, useBlob } from './ui';

function manualCandidate(crop: Blob): BarcodeCandidate {
  return {
    text: '',
    bytes: [],
    format: 'Original image',
    symbology: '',
    symbologyIdentifier: '',
    decoded: false,
    verified: false,
    crop,
  };
}
export function ImportCard({
  file,
  choose,
  done,
}: {
  file?: File;
  choose: () => void;
  done: () => void;
}) {
  const [progress, setProgress] = useState('Preparing screenshot…');
  const [recognition, setRecognition] = useState<Recognition>();
  const [codes, setCodes] = useState<BarcodeCandidate[]>([]),
    [selected, setSelected] = useState<number>();
  const [error, setError] = useState(''),
    [hash, setHash] = useState(''),
    [duplicate, setDuplicate] = useState(false),
    [allowDuplicate, setAllowDuplicate] = useState(false);
  const [cropping, setCropping] = useState(false),
    [cropBusy, setCropBusy] = useState(false);
  const [manualText, setManualText] = useState('');
  const [storageNotice, setStorageNotice] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    if (!file) return;
    const abort = new AbortController();
    controller.current = abort;
    async function scan() {
      try {
        await validateImage(file!);
        const imageHash = await hashImage(file!);
        if (abort.signal.aborted) return;
        setHash(imageHash);
        setProgress('Reading your screenshot on this device…');
        const [barcode, text] = await Promise.allSettled([
          scanBarcodes(file!, abort.signal),
          scanText(file!, abort.signal, setProgress),
        ]);
        if (abort.signal.aborted) return;
        const found = barcode.status === 'fulfilled' ? barcode.value : [];
        setCodes(found);
        if (found.length === 1) setSelected(0);
        const result = text.status === 'fulfilled' ? text.value : recognizeText('');
        if (text.status === 'rejected')
          result.warnings.unshift('Text recognition could not finish. Enter the details manually.');
        if (barcode.status === 'rejected')
          result.warnings.unshift(
            'Barcode recognition could not finish. Crop or use the original screenshot.',
          );
        setRecognition(result);
      } catch (err) {
        if (!abort.signal.aborted) setError(friendlyError(err));
      }
    }
    void scan();
    return () => abort.abort();
  }, [file]);
  useEffect(() => {
    if (selected === undefined || !hash) return;
    let cancelled = false;
    void db.cards
      .toArray()
      .then((cards) => {
        if (!cancelled) setDuplicate(cards.some((c) => duplicateOf(c, hash, codes[selected])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, hash, codes]);
  async function acceptCrop(blob: Blob, decode: boolean) {
    setCropBusy(true);
    setError('');
    try {
      const found = decode ? await scanBarcodes(blob, controller.current!.signal) : [];
      if (controller.current?.signal.aborted) return;
      if (decode && !found.length) {
        setError(
          'No barcode was read in that crop. Try a wider crop with clear margins, or choose “Use crop as-is”.',
        );
        return;
      }
      const next = found.length ? found : [manualCandidate(blob)];
      setCodes(next);
      setSelected(next.length === 1 ? 0 : undefined);
      setAllowDuplicate(false);
      setCropping(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCropBusy(false);
    }
  }
  async function save(fields: CardFields) {
    if (selected === undefined || !file || !hash)
      throw new Error('Choose the payment barcode or a screenshot crop.');
    try {
      const selectedCode = codes[selected];
      const card = await saveCard(
        fields,
        file,
        hash,
        selectedCode.decoded ? selectedCode : { ...selectedCode, text: manualText },
        allowDuplicate,
      );
      let persistent = false;
      try {
        persistent = (await navigator.storage?.persist?.()) || false;
      } catch {
        /* Card is already committed. */
      }
      if (!persistent) {
        try {
          sessionStorage.setItem('pocket-storage-note', '1');
        } catch {
          /* Optional notice storage must never undo a successful save. */
        }
      }
      done();
      go(`/card/${card.id}`);
    } catch (err) {
      if (err instanceof DuplicateError) {
        setDuplicate(true);
        throw err;
      }
      throw new Error(friendlyError(err));
    }
  }
  return (
    <main className="shell narrow">
      <PageTop title="Add a gift card" />
      {!file ? (
        <section className="empty-import">
          <div className="empty-icon">
            <ImagePlus size={34} />
          </div>
          <h2>A screenshot is all you need.</h2>
          <p>
            Choose your gift card screenshot. We’ll read the barcode and details right here on your
            phone.
          </p>
          <button className="button primary" onClick={choose}>
            <ImagePlus size={19} />
            Choose screenshot
          </button>
          <p className="field-help">PNG, JPEG, or WebP · up to 25 MB</p>
          <PrivacyNote />
        </section>
      ) : (
        <>
          <div className="import-preview">
            <BlobImage blob={file} alt="Your original gift card screenshot" />
            <div>
              <span className="eyebrow">YOUR SCREENSHOT</span>
              <strong>Let’s get it into your wallet.</strong>
              <p>The original stays with your card.</p>
            </div>
          </div>
          {!recognition && !error && (
            <div className="recognizing" role="status">
              <span className="spinner" />
              <h2>{progress}</h2>
              <p>This can take a moment on the first import.</p>
              <button
                className="text-button"
                onClick={() => {
                  controller.current?.abort();
                  controller.current = new AbortController();
                  setRecognition({
                    ...recognizeText(''),
                    warnings: [
                      'Recognition skipped. Enter the details and select a screenshot crop.',
                    ],
                  });
                }}
              >
                Enter details manually <ArrowRight size={16} />
              </button>
            </div>
          )}
          <ErrorMessage message={error} />
          {error && !recognition && (
            <button className="button secondary" onClick={choose}>
              Choose another screenshot
            </button>
          )}
          {recognition && (
            <>
              <section className="section-block">
                <span className="eyebrow">01 · PAYMENT BARCODE</span>
                <h2>{codes.length > 1 ? 'Choose the code to scan.' : 'Check your barcode.'}</h2>
                <p className="muted">
                  {codes.length > 1
                    ? 'More than one code was found. Select the payment barcode shown on your card.'
                    : 'Keep the whole barcode and its clear margins visible.'}
                </p>
                <div className="code-options">
                  {codes.map((code, i) => (
                    <button
                      type="button"
                      key={i}
                      className={`code-option ${selected === i ? 'selected' : ''}`}
                      aria-pressed={selected === i}
                      aria-label={`Select barcode ${i + 1}, ${code.format}`}
                      onClick={() => {
                        setSelected(i);
                        setAllowDuplicate(false);
                      }}
                    >
                      <BlobImage blob={code.rendered || code.crop} alt={`Barcode ${i + 1}`} />
                      <span className="code-caption">
                        <span>
                          {code.format}
                          <small className="monospace">
                            {code.text || 'Original screenshot crop'}
                          </small>
                        </span>
                        {selected === i && <Check size={20} />}
                      </span>
                    </button>
                  ))}
                </div>
                {!codes.length && (
                  <p className="notice">
                    No barcode detected. Crop around the payment barcode, or keep the full
                    screenshot for checkout.
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setError('');
                      setCropping(true);
                    }}
                  >
                    <Crop size={17} />
                    Crop screenshot
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setCodes([manualCandidate(file)]);
                      setSelected(0);
                    }}
                  >
                    Use full screenshot
                  </button>
                </div>
                {selected !== undefined && !codes[selected].decoded && (
                  <label className="manual-number">
                    Readable card number <span className="field-unit">optional</span>
                    <input
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <span className="field-help">
                      Shown as text at checkout. The original image is used for scanning.
                    </span>
                  </label>
                )}
              </section>
              <section className="section-block">
                <span className="eyebrow">02 · CARD DETAILS</span>
                <h2>A quick double-check.</h2>
                <p className="muted">Review every field against your screenshot before saving.</p>
                {!!recognition.warnings.length && (
                  <details className="review-notes">
                    <summary>{recognition.warnings.length} things to review</summary>
                    <ul>
                      {recognition.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <CardForm
                  initial={{
                    retailer: recognition.retailer,
                    original: recognition.amount,
                    starting: recognition.amount,
                    pin: recognition.pin,
                    expiry:
                      recognition.expiry.kind === 'unknown' ? { kind: 'none' } : recognition.expiry,
                  }}
                  submitLabel="Add to wallet"
                  onSave={save}
                  disabled={selected === undefined}
                >
                  {duplicate && (
                    <div className="notice">
                      <strong>This card may already be in your wallet.</strong>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={allowDuplicate}
                          onChange={(e) => setAllowDuplicate(e.target.checked)}
                        />
                        I want to save another copy
                      </label>
                    </div>
                  )}
                </CardForm>
              </section>
              <PrivacyNote />
              <button
                className="text-button privacy-explainer"
                onClick={() => setStorageNotice(true)}
              >
                About storage on your phone
              </button>
            </>
          )}
        </>
      )}
      {cropping && file && (
        <CropDialog
          image={file}
          busy={cropBusy}
          error={error}
          close={() => {
            if (!cropBusy) setCropping(false);
          }}
          accept={acceptCrop}
        />
      )}
      {storageNotice && (
        <Modal title="Your wallet stays here" close={() => setStorageNotice(false)}>
          <p>
            Your screenshots, PINs, and spending stay in this browser on this phone. There is no
            account or cloud copy.
          </p>
          <p>
            Clearing site data or losing your phone can erase the wallet. We request persistent
            storage after saving, but your browser decides whether to grant it.
          </p>
        </Modal>
      )}
    </main>
  );
}

function CropDialog({
  image,
  busy,
  error,
  close,
  accept,
}: {
  image: Blob;
  busy: boolean;
  error: string;
  close: () => void;
  accept: (blob: Blob, decode: boolean) => Promise<void>;
}) {
  const url = useBlob(image),
    ref = useRef<HTMLDivElement>(null),
    start = useRef<{ x: number; y: number } | undefined>(undefined);
  const [rect, setRect] = useState({ x: 5, y: 25, w: 90, h: 40 });
  const coords = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  async function crop(decode: boolean) {
    const bitmap = await createImageBitmap(image);
    const canvas = document.createElement('canvas');
    const x = Math.floor((bitmap.width * rect.x) / 100),
      y = Math.floor((bitmap.height * rect.y) / 100);
    canvas.width = Math.max(
      1,
      Math.min(bitmap.width - x, Math.round((bitmap.width * rect.w) / 100)),
    );
    canvas.height = Math.max(
      1,
      Math.min(bitmap.height - y, Math.round((bitmap.height * rect.h) / 100)),
    );
    canvas
      .getContext('2d')!
      .drawImage(bitmap, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not crop image.'))),
        'image/png',
      ),
    );
    await accept(blob, decode);
  }
  const [cropError, setCropError] = useState('');
  const run = (decode: boolean) => {
    setCropError('');
    void crop(decode).catch(() => setCropError('Could not crop this image. Try again.'));
  };
  return (
    <Modal title="Crop your barcode" close={close}>
      <p className="muted">
        Drag a box around the barcode. Include the clear space on every side, or adjust with the
        sliders.
      </p>
      <div
        ref={ref}
        className="crop-area"
        onPointerDown={(e) => {
          if (busy) return;
          start.current = coords(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const end = coords(e);
          setRect({
            x: Math.min(end.x, start.current.x),
            y: Math.min(end.y, start.current.y),
            w: Math.max(1, Math.abs(end.x - start.current.x)),
            h: Math.max(1, Math.abs(end.y - start.current.y)),
          });
        }}
        onPointerUp={() => {
          start.current = undefined;
        }}
        onPointerCancel={() => {
          start.current = undefined;
        }}
      >
        <img src={url} alt="Screenshot to crop" draggable={false} />
        <div
          className="crop-selection"
          style={{
            left: `${rect.x}%`,
            top: `${rect.y}%`,
            width: `${rect.w}%`,
            height: `${rect.h}%`,
          }}
        />
      </div>
      <div className="crop-sliders">
        {(['x', 'y', 'w', 'h'] as const).map((key, i) => (
          <label key={key}>
            {['Left', 'Top', 'Width', 'Height'][i]}
            <input
              type="range"
              min={i < 2 ? 0 : 1}
              max={
                key === 'x'
                  ? 100 - rect.w
                  : key === 'y'
                    ? 100 - rect.h
                    : key === 'w'
                      ? 100 - rect.x
                      : 100 - rect.y
              }
              value={rect[key]}
              disabled={busy}
              onChange={(e) => setRect({ ...rect, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <ErrorMessage message={cropError || error} />
      <div className="button-row">
        <button className="button primary" disabled={busy} onClick={() => run(true)}>
          <ScanLine size={18} />
          {busy ? 'Reading…' : 'Read this crop'}
        </button>
        <button className="button secondary" disabled={busy} onClick={() => run(false)}>
          Use crop as-is
        </button>
      </div>
    </Modal>
  );
}
