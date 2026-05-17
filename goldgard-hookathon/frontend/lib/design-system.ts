/**
 * Viking Golden Robotic-Gothic Design System
 * 
 * A comprehensive design system for the Goldgard frontend featuring:
 * - Seven-color palette (Forge Black, Iron Grey, Aged Gold, Pale Gold, Ember Red, Runic Green, Cold Steel)
 * - Four typefaces (Cinzel display, Cormorant Garamond subhead, Inter body, JetBrains Mono data)
 * - Component motifs (Rune Stones, Leverage Rune, Forged Lines, Beacons, Knotwork dividers)
 */

/* ============================================================
   COLOR PALETTE
   ============================================================ */

export const COLORS = {
  forge: {
    black: '#0a0a0a',
  },
  iron: {
    grey: '#2a2a2a',
  },
  aged: {
    gold: '#c9a961',
  },
  pale: {
    gold: '#e8d5a8',
  },
  ember: {
    red: '#8b3a3a',
  },
  runic: {
    green: '#3a5a4a',
  },
  cold: {
    steel: '#5a7a8a',
  },
} as const;

/* ============================================================
   TYPOGRAPHY SCALE
   ============================================================ */

export const TYPOGRAPHY = {
  display: {
    xl: 'text-display-xl',
    lg: 'text-display-lg',
    base: 'text-display',
  },
  subhead: 'text-subhead',
  body: 'text-body',
  data: 'text-data',
} as const;

/* ============================================================
   COMPONENT MOTIFS
   ============================================================ */

export const COMPONENT_MOTIFS = {
  // Rune Stones - Stat Cards
  runeStone: 'rune-stone',
  runeStoneContent: 'rune-stone-content',
  
  // Leverage Rune - Primary Action Buttons
  leverageRune: 'leverage-rune',
  
  // Forged Lines - Chart/Line Decorations
  forgedLines: 'forged-lines',
  
  // Beacons - Status Indicators
  beacon: 'beacon',
  beaconDot: 'beacon-dot',
  beaconLabel: 'beacon-label',
  
  // Beacon Status Variants
  beaconStatus: {
    active: 'status-active',
    warning: 'status-warning',
    error: 'status-error',
    neutral: 'status-neutral',
  },
  
  // Knotwork Dividers
  knotworkDivider: 'knotwork-divider',
  knotworkDividerCenter: 'knotwork-divider-center',
  knotworkPattern: 'knotwork-pattern',
} as const;

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/**
 * Combines multiple class names with Tailwind utilities
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Creates a rune stone card component classes
 */
export function runeStoneClasses(additionalClasses?: string): string {
  return cn(COMPONENT_MOTIFS.runeStone, additionalClasses);
}

/**
 * Creates leverage rune button classes
 */
export function leverageRuneClasses(additionalClasses?: string): string {
  return cn(COMPONENT_MOTIFS.leverageRune, additionalClasses);
}

/**
 * Creates beacon status indicator classes
 */
export function beaconClasses(
  status: keyof typeof COMPONENT_MOTIFS.beaconStatus,
  additionalClasses?: string
): string {
  return cn(
    COMPONENT_MOTIFS.beacon,
    `${COMPONENT_MOTIFS.beaconDot} ${COMPONENT_MOTIFS.beaconStatus[status]}`,
    additionalClasses
  );
}

/**
 * Creates typography classes
 */
export function typographyClasses(
  variant: 'display-xl' | 'display-lg' | 'display' | 'subhead' | 'body' | 'data',
  additionalClasses?: string
): string {
  const typeMap = {
    'display-xl': TYPOGRAPHY.display.xl,
    'display-lg': TYPOGRAPHY.display.lg,
    'display': TYPOGRAPHY.display.base,
    'subhead': TYPOGRAPHY.subhead,
    'body': TYPOGRAPHY.body,
    'data': TYPOGRAPHY.data,
  };
  
  return cn(typeMap[variant], additionalClasses);
}

/**
 * Palette swatches for reference
 */
export const PALETTE_SWATCHES = [
  { name: 'Forge Black', color: COLORS.forge.black },
  { name: 'Iron Grey', color: COLORS.iron.grey },
  { name: 'Aged Gold', color: COLORS.aged.gold },
  { name: 'Pale Gold', color: COLORS.pale.gold },
  { name: 'Ember Red', color: COLORS.ember.red },
  { name: 'Runic Green', color: COLORS.runic.green },
  { name: 'Cold Steel', color: COLORS.cold.steel },
] as const;
