import { SEED_HLC } from './hlc';
import { SCHEMA_VERSION, type Category, type Snapshot } from './types';

/**
 * Categorie predefinite con id stabili: ogni dispositivo crea gli stessi record con lo
 * stesso timestamp "seed", quindi la prima sincronizzazione non produce duplicati né conflitti.
 */
const seed = (id: string, name: string, kind: Category['kind'], icon: string, color: string): Category => ({
  id: `cat-${id}`,
  name,
  kind,
  icon,
  color,
  builtin: true,
  archived: false,
  updatedAt: SEED_HLC,
});

export const DEFAULT_CATEGORIES: Category[] = [
  seed('alimentari', 'Alimentari', 'expense', '🛒', '#2f9e44'),
  seed('trasporti', 'Trasporti', 'expense', '🚌', '#1c7ed6'),
  seed('casa', 'Casa', 'expense', '🏠', '#e8590c'),
  seed('salute', 'Salute', 'expense', '💊', '#e03131'),
  seed('svago', 'Svago', 'expense', '🎬', '#9c36b5'),
  seed('utenze', 'Utenze', 'expense', '💡', '#f08c00'),
  seed('altro-spese', 'Altre spese', 'expense', '📦', '#868e96'),
  seed('stipendio', 'Stipendio', 'income', '💼', '#0b7285'),
  seed('altre-entrate', 'Altre entrate', 'income', '💰', '#5c940d'),
];

export function seedSnapshot(locale = 'it-IT'): Snapshot {
  return {
    schema: SCHEMA_VERSION,
    transactions: {},
    categories: Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, { ...c }])),
    budgets: {},
    recurring: {},
    settings: { currency: 'EUR', locale, updatedAt: SEED_HLC },
  };
}

/** Palette per le categorie create dall'utente. */
export const CATEGORY_COLORS = [
  '#2f9e44', '#1c7ed6', '#e8590c', '#e03131', '#9c36b5', '#f08c00',
  '#0b7285', '#5c940d', '#c2255c', '#5f3dc4', '#868e96',
];
