import { describe, expect, it } from 'vitest';
import { PassphraseCipher } from '../src/core/crypto';
import { stableStringify } from '../src/core/merge';
import { SyncEngine, ownFileName } from '../src/core/sync/engine';
import { MemoryRemote, SyncError } from '../src/core/sync/remote';
import { TEST_ITER, containsText, fakeClock, newLedger } from './helpers';

async function device(remote: MemoryRemote, passphrase = 'condivisa', now?: () => number) {
  const { ledger, storage } = await newLedger(now);
  const engine = new SyncEngine(ledger, remote, new PassphraseCipher(passphrase, TEST_ITER));
  return { ledger, storage, engine };
}
const add = (l: Awaited<ReturnType<typeof device>>['ledger'], amountCents: number, date = '2026-11-03') =>
  l.addTransaction({ type: 'expense', amountCents, categoryId: 'cat-alimentari', date });
const amounts = (l: Awaited<ReturnType<typeof device>>['ledger']) => l.transactions().map((t) => t.amountCents).sort((a, b) => a - b);

describe('sincronizzazione tra dispositivi', () => {
  it('propaga i movimenti da un dispositivo all’altro, cifrati', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote);
    const B = await device(remote);
    add(A.ledger, 1250);

    const r1 = await A.engine.sync();
    expect(r1.uploaded).toBe(true);
    const stored = remote.files.get(ownFileName(A.ledger.deviceId))!.data;
    expect(containsText(stored, '1250')).toBe(false);
    expect(containsText(stored, 'cat-alimentari')).toBe(false);

    const r2 = await B.engine.sync();
    expect(r2.downloaded).toBe(1);
    expect(amounts(B.ledger)).toEqual([1250]);
  });

  it('converge dopo modifiche concorrenti su entrambi i dispositivi', async () => {
    const clock = fakeClock();
    const remote = new MemoryRemote();
    const A = await device(remote, 'condivisa', clock.now);
    const B = await device(remote, 'condivisa', clock.now);
    const shared = add(A.ledger, 1000);
    await A.engine.sync();
    await B.engine.sync();

    // Offline in parallelo: A modifica l'importo, B cancella lo stesso movimento e ne aggiunge un altro.
    clock.advance();
    A.ledger.updateTransaction(shared.id, { amountCents: 2000 });
    add(A.ledger, 300);
    clock.advance();
    B.ledger.deleteTransaction(shared.id);
    add(B.ledger, 700);

    await A.engine.sync();
    await B.engine.sync();
    await A.engine.sync();
    await B.engine.sync();

    expect(amounts(A.ledger)).toEqual(amounts(B.ledger));
    expect(amounts(A.ledger)).toEqual([300, 700]); // la cancellazione, più recente, vince
    expect(stableStringify(A.ledger.getSnapshot())).toBe(stableStringify(B.ledger.getSnapshot()));
  });

  it('registra il conflitto (modifica contro cancellazione) e permette di ripristinare la versione scartata', async () => {
    const clock = fakeClock();
    const remote = new MemoryRemote();
    const A = await device(remote, 'condivisa', clock.now);
    const B = await device(remote, 'condivisa', clock.now);
    const t = add(A.ledger, 1000);
    await A.engine.sync();
    await B.engine.sync();

    clock.advance();
    A.ledger.updateTransaction(t.id, { amountCents: 4242 });
    clock.advance();
    B.ledger.deleteTransaction(t.id);
    await A.engine.sync();
    const rep = await B.engine.sync(); // B vede la modifica di A, ma la propria cancellazione è più recente
    expect(rep.newConflicts).toBe(1);
    expect(B.ledger.transactions()).toHaveLength(0);

    const log = B.ledger.getState().conflictLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ winner: 'local' });

    B.ledger.restoreConflict(0); // l'utente decide di tenere la versione di A
    expect(amounts(B.ledger)).toEqual([4242]);
    await B.engine.sync();
    await A.engine.sync();
    expect(amounts(A.ledger)).toEqual([4242]);
  });

  it('una seconda sincronizzazione senza novità non scarica né ricarica nulla', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote);
    const B = await device(remote);
    add(A.ledger, 500);
    await A.engine.sync();
    await B.engine.sync();
    const reads = remote.reads;
    const r = await B.engine.sync();
    expect(r).toMatchObject({ downloaded: 0, skipped: 1 });
    expect(remote.reads).toBe(reads); // il file di A non viene riscaricato
    // Nessuna modifica locale dopo l'ultimo caricamento: non si riscrive nemmeno il proprio file.
    const writes = remote.writes;
    const r2 = await B.engine.sync();
    expect(r2.uploaded).toBe(false);
    expect(remote.writes).toBe(writes);
  });

  it('con la passphrase sbagliata non legge e NON pubblica il proprio file', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'giusta');
    add(A.ledger, 1000);
    await A.engine.sync();

    const B = await device(remote, 'sbagliata');
    add(B.ledger, 5);
    const r = await B.engine.sync();
    expect(r.errors).toEqual([{ file: ownFileName(A.ledger.deviceId), reason: 'wrong-passphrase' }]);
    expect(r.uploaded).toBe(false);
    expect(remote.files.has(ownFileName(B.ledger.deviceId))).toBe(false);
    expect(amounts(B.ledger)).toEqual([5]); // i dati locali restano intatti
    expect(B.ledger.getState().dirty).toBe(true);
  });

  it('un file remoto corrotto viene segnalato senza bloccare gli altri dispositivi', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote);
    const C = await device(remote);
    add(A.ledger, 111);
    await A.engine.sync();
    await remote.write('snap-deadbeef.quattrino', new Uint8Array([9, 9, 9, 9]));
    const r = await C.engine.sync();
    expect(r.errors).toEqual([{ file: 'snap-deadbeef.quattrino', reason: 'corrupt' }]);
    expect(amounts(C.ledger)).toEqual([111]);
  });

  it('ignora file estranei nella cartella', async () => {
    const remote = new MemoryRemote();
    await remote.write('altro.txt', new Uint8Array([1]));
    const A = await device(remote);
    const r = await A.engine.sync();
    expect(r.errors).toEqual([]);
  });

  describe('modalità offline e guasti di rete', () => {
    it('offline: l’app continua a funzionare e la sync riuscirà più tardi senza perdere nulla', async () => {
      const remote = new MemoryRemote();
      const A = await device(remote);
      remote.failWith = new SyncError('offline', 'Rete non raggiungibile.');
      add(A.ledger, 100);
      add(A.ledger, 200);
      await expect(A.engine.sync()).rejects.toMatchObject({ kind: 'offline' });
      expect(amounts(A.ledger)).toEqual([100, 200]);
      expect(A.ledger.getState().dirty).toBe(true);

      remote.failWith = null;
      const r = await A.engine.sync();
      expect(r.uploaded).toBe(true);
      expect(A.ledger.getState().dirty).toBe(false);
      const B = await device(remote);
      await B.engine.sync();
      expect(amounts(B.ledger)).toEqual([100, 200]);
    });

    it('propaga l’errore di autenticazione per chiedere la riconnessione', async () => {
      const remote = new MemoryRemote();
      const A = await device(remote);
      remote.failWith = new SyncError('auth', 'scaduto');
      await expect(A.engine.sync()).rejects.toMatchObject({ kind: 'auth' });
    });

    it('chiamate concorrenti condividono una sola sincronizzazione', async () => {
      const remote = new MemoryRemote();
      const A = await device(remote);
      add(A.ledger, 1);
      const [r1, r2] = await Promise.all([A.engine.sync(), A.engine.sync()]);
      expect(r1).toBe(r2);
      expect(remote.writes).toBe(1);
    });

    it('una modifica fatta durante la sincronizzazione resta "da caricare"', async () => {
      const remote = new MemoryRemote();
      const A = await device(remote);
      add(A.ledger, 1);
      const origWrite = remote.write.bind(remote);
      remote.write = async (n, d) => {
        add(A.ledger, 2); // l'utente registra una spesa mentre il file sale
        return origWrite(n, d);
      };
      await A.engine.sync();
      expect(A.ledger.getState().dirty).toBe(true);
      remote.write = origWrite;
      await A.engine.sync();
      const B = await device(remote);
      await B.engine.sync();
      expect(amounts(B.ledger)).toEqual([1, 2]);
    });
  });

  describe('backup e reinstallazione', () => {
    it('un dispositivo nuovo (reinstallazione) ritrova tutti i dati dal cloud', async () => {
      const remote = new MemoryRemote();
      const old = await device(remote);
      add(old.ledger, 4200);
      old.ledger.setBudget('cat-alimentari', 30000);
      await old.engine.sync();

      const fresh = await device(remote); // nuovo deviceId, archivio vuoto
      await fresh.engine.sync();
      expect(amounts(fresh.ledger)).toEqual([4200]);
      expect(fresh.ledger.budgets()).toHaveLength(1);
    });

    it('il ripristino da backup vecchio si propaga agli altri dispositivi', async () => {
      const clock = fakeClock();
      const remote = new MemoryRemote();
      const A = await device(remote, 'condivisa', clock.now);
      const B = await device(remote, 'condivisa', clock.now);
      add(A.ledger, 100);
      const backup = structuredClone(A.ledger.getSnapshot());
      clock.advance();
      add(A.ledger, 999);
      await A.engine.sync();
      await B.engine.sync();
      expect(amounts(B.ledger)).toEqual([100, 999]);

      clock.advance();
      A.ledger.replaceAll(backup); // A torna allo stato del backup
      await A.engine.sync();
      await B.engine.sync();
      expect(amounts(A.ledger)).toEqual([100]);
      expect(amounts(B.ledger)).toEqual([100]); // senza ri-datazione la spesa 999 "risorgerebbe"
    });
  });
});
