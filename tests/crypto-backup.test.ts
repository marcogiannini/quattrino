import { describe, expect, it } from 'vitest';
import { BackupError, exportBackup, readBackup, transactionsToCsv } from '../src/core/backup';
import { CryptoError, PassphraseCipher, isEncryptedBlob, utf8 } from '../src/core/crypto';
import { seedSnapshot } from '../src/core/defaults';
import { Ledger } from '../src/core/ledger';
import { MemoryStorage } from '../src/storage/memory';
import { TEST_ITER, bytesEqual, containsText, fakeClock, newLedger } from './helpers';

describe('PassphraseCipher', () => {
  it('cifra e decifra', async () => {
    const c = new PassphraseCipher('frase segreta', TEST_ITER);
    const blob = await c.encrypt(utf8.enc('ciao ✓'));
    expect(isEncryptedBlob(blob)).toBe(true);
    expect(utf8.dec(await c.decrypt(blob))).toBe('ciao ✓');
  });

  it('non lascia il testo in chiaro nel blob e usa IV diversi a ogni cifratura', async () => {
    const c = new PassphraseCipher('p', TEST_ITER);
    const a = await c.encrypt(utf8.enc('Stipendio 2000 euro'));
    const b = await c.encrypt(utf8.enc('Stipendio 2000 euro'));
    expect(containsText(a, 'Stipendio')).toBe(false);
    expect(bytesEqual(a, b)).toBe(false);
  });

  it('un altro dispositivo con la stessa passphrase decifra (salt letto dall’intestazione)', async () => {
    const blob = await new PassphraseCipher('condivisa', TEST_ITER).encrypt(utf8.enc('dati'));
    expect(utf8.dec(await new PassphraseCipher('condivisa', TEST_ITER).decrypt(blob))).toBe('dati');
  });

  it('rifiuta la passphrase errata', async () => {
    const blob = await new PassphraseCipher('giusta', TEST_ITER).encrypt(utf8.enc('x'));
    await expect(new PassphraseCipher('sbagliata', TEST_ITER).decrypt(blob)).rejects.toMatchObject({
      code: 'auth-failed',
    });
  });

  it('rileva qualsiasi alterazione: ciphertext, intestazione, troncamento', async () => {
    const c = new PassphraseCipher('p', TEST_ITER);
    const blob = await c.encrypt(utf8.enc('importante'));
    const flip = (i: number) => {
      const b = blob.slice();
      b[i] = b[i]! ^ 0x01;
      return b;
    };
    await expect(c.decrypt(flip(blob.length - 1))).rejects.toBeInstanceOf(CryptoError); // tag
    await expect(c.decrypt(flip(40))).rejects.toBeInstanceOf(CryptoError); // ciphertext
    await expect(c.decrypt(flip(12))).rejects.toBeInstanceOf(CryptoError); // salt (AAD)
    await expect(c.decrypt(flip(36 - 1))).rejects.toBeInstanceOf(CryptoError); // IV
    await expect(c.decrypt(blob.slice(0, blob.length - 3))).rejects.toBeInstanceOf(CryptoError);
    await expect(c.decrypt(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: 'bad-format' });
  });

  it('rifiuta iterazioni ostili nell’intestazione (DoS) e passphrase vuote', async () => {
    const c = new PassphraseCipher('p', TEST_ITER);
    const blob = await c.encrypt(utf8.enc('x'));
    new DataView(blob.buffer).setUint32(4, 4_000_000_000, false);
    await expect(c.decrypt(blob)).rejects.toMatchObject({ code: 'bad-params' });
    expect(() => new PassphraseCipher('', TEST_ITER)).toThrow(CryptoError);
  });
});

describe('backup e ripristino', () => {
  async function filled() {
    const clock = fakeClock();
    const { ledger } = await newLedger(clock.now);
    ledger.addTransaction({ type: 'expense', amountCents: 1250, categoryId: 'cat-alimentari', date: '2026-11-03', note: 'pane' });
    ledger.addTransaction({ type: 'income', amountCents: 200000, categoryId: 'cat-stipendio', date: '2026-11-01' });
    const gone = ledger.addTransaction({ type: 'expense', amountCents: 99, categoryId: 'cat-casa', date: '2026-11-02' });
    ledger.deleteTransaction(gone.id);
    ledger.setBudget('cat-alimentari', 30000);
    return ledger;
  }

  it('esporta cifrato e rilegge; i movimenti cancellati non finiscono nel file', async () => {
    const ledger = await filled();
    const bytes = await exportBackup(ledger.getSnapshot(), { passphrase: 'pw', iterations: TEST_ITER });
    expect(isEncryptedBlob(bytes)).toBe(true);
    const snap = await readBackup(bytes, { passphrase: 'pw' });
    expect(Object.keys(snap.transactions)).toHaveLength(2);
    expect(Object.values(snap.budgets)).toHaveLength(1);
  });

  it('segnala passphrase mancante o errata', async () => {
    const ledger = await filled();
    const bytes = await exportBackup(ledger.getSnapshot(), { passphrase: 'pw', iterations: TEST_ITER });
    await expect(readBackup(bytes)).rejects.toMatchObject({ code: 'passphrase-required' });
    await expect(readBackup(bytes, { passphrase: 'no' })).rejects.toMatchObject({ code: 'wrong-passphrase' });
  });

  it('legge anche il backup in chiaro e rifiuta file estranei', async () => {
    const plain = await exportBackup(seedSnapshot());
    expect((await readBackup(plain)).settings.currency).toBe('EUR');
    await expect(readBackup(utf8.enc('{"foo":1}'))).rejects.toBeInstanceOf(BackupError);
    await expect(readBackup(utf8.enc('non json'))).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('ripristino sostitutivo: i dati diventano quelli del backup e la scelta si propaga', async () => {
    const ledger = await filled();
    const backup = await exportBackup(ledger.getSnapshot());
    ledger.addTransaction({ type: 'expense', amountCents: 5000, categoryId: 'cat-svago', date: '2026-11-10' });
    expect(ledger.transactions()).toHaveLength(3);

    ledger.replaceAll(await readBackup(backup));
    expect(ledger.transactions()).toHaveLength(2); // la spesa aggiunta dopo il backup è sparita
    expect(ledger.budgets()).toHaveLength(1);
    expect(ledger.getState().dirty).toBe(true);
  });

  it('ripristino per unione: conserva ciò che esiste già', async () => {
    const ledger = await filled();
    const backup = await readBackup(await exportBackup(ledger.getSnapshot()));
    ledger.addTransaction({ type: 'expense', amountCents: 5000, categoryId: 'cat-svago', date: '2026-11-10' });
    ledger.applyRemote(backup);
    expect(ledger.transactions()).toHaveLength(3);
  });

  it('ripristina su un dispositivo vuoto', async () => {
    const ledger = await filled();
    const backup = await readBackup(await exportBackup(ledger.getSnapshot(), { passphrase: 'pw', iterations: TEST_ITER }), { passphrase: 'pw' });
    const fresh = await Ledger.open(new MemoryStorage());
    fresh.replaceAll(backup);
    expect(fresh.transactions().map((t) => t.amountCents).sort()).toEqual([1250, 200000]);
  });
});

describe('CSV', () => {
  it('formatta per Excel italiano e neutralizza le formule', async () => {
    const { ledger } = await newLedger();
    ledger.addTransaction({ type: 'expense', amountCents: 1250, categoryId: 'cat-alimentari', date: '2026-11-03', note: '=HYPERLINK("http://x")' });
    ledger.addTransaction({ type: 'income', amountCents: 200000, categoryId: 'cat-stipendio', date: '2026-11-01', note: 'a;b "c"' });
    const csv = transactionsToCsv(ledger.transactions(), ledger.categories());
    expect(csv.startsWith('﻿Data;Tipo;Categoria;Importo;Nota\r\n')).toBe(true);
    expect(csv).toContain('2026-11-01;Entrata;Stipendio;2000,00;"a;b ""c"""');
    // La nota che inizia con "=" viene preceduta da apostrofo (nessuna formula eseguita); gli importi restano numeri.
    expect(csv).toContain('2026-11-03;Uscita;Alimentari;-12,50;"\'=HYPERLINK(""http://x"")"');
  });
});
