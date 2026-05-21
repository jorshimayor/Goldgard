/**
 * QUICK REFERENCE: Viking Golden Robotic-Gothic Design System
 * 
 * Copy-paste snippets for common use cases
 */

// ============================================================================
// 1. STAT CARD GRID (Most Common Pattern)
// ============================================================================

import {
  Beacon,
  Body,
  Data,
  Display,
  ForgedLines,
  KnotworkDivider,
  KnotworkGrid,
  LeverageRune,
  RuneStone,
  Subhead,
} from "@/components/DesignComponents";
import { COLORS, PALETTE_SWATCHES } from "@/lib/design-system";

export function StatCardExample() {
  return (
    <KnotworkGrid columns={3}>
      <RuneStone>
        <div className="text-display">$12.5K</div>
        <Subhead className="mt-2 text-sm">Total Value</Subhead>
        <Body className="text-gg-muted text-sm">Locked in contracts</Body>
      </RuneStone>
    </KnotworkGrid>
  );
}

// ============================================================================
// 2. HERO SECTION WITH BUTTONS
// ============================================================================

export function HeroSection() {
  return (
    <div className="py-16">
      <Display variant="xl" className="mb-4">
        Shield Your Yield
      </Display>
      <Body className="text-gg-muted mb-8 max-w-2xl">
        The first delta-neutral LST hedge using Uniswap v4 hooks.
      </Body>
      <div className="flex gap-4">
        <LeverageRune>Get Started</LeverageRune>
        <button className="leverage-rune opacity-60">Learn More</button>
      </div>
      <ForgedLines className="mt-12" />
    </div>
  );
}

// ============================================================================
// 3. STATUS DASHBOARD
// ============================================================================

export function StatusDashboard() {
  return (
    <div className="space-y-4">
      <Subhead>System Status</Subhead>
      <div className="space-y-3">
        <Beacon status="active" label="Smart Contracts" />
        <Beacon status="active" label="Oracle Feed" />
        <Beacon status="warning" label="Network Congestion" />
        <Beacon status="neutral" label="Maintenance Window" />
      </div>
      <Data as="div" className="text-xs mt-4">
        Last updated: {new Date().toLocaleTimeString()}
      </Data>
    </div>
  );
}

// ============================================================================
// 4. DATA TABLE SECTION
// ============================================================================

export function DataSection() {
  return (
    <div>
      <KnotworkDivider label="Pool Statistics" />
      <Subhead className="mt-8 mb-4">Active Pools</Subhead>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gg-border">
              <th className="text-left p-2 text-data">Pool</th>
              <th className="text-right p-2 text-data">TVL</th>
              <th className="text-right p-2 text-data">APY</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gg-border">
              <td className="p-2 text-body">ETH/USDC</td>
              <td className="text-right p-2 text-data font-bold">$2.5M</td>
              <td className="text-right p-2 text-data text-runic-green">12.5%</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <Body className="text-gg-muted text-sm mt-4">
        Data refreshes every minute
      </Body>
    </div>
  );
}

// ============================================================================
// 5. COLORED TEXT (Different Status Colors)
// ============================================================================

export function StatusText() {
  return (
    <div className="space-y-2">
      <div className="text-runic-green">✓ Success: Operation completed</div>
      <div className="text-aged-gold">⚠ Warning: Check gas prices</div>
      <div className="text-ember-red">✗ Error: Transaction failed</div>
      <div className="text-cold-steel">ℹ Info: New block produced</div>
    </div>
  );
}

// ============================================================================
// 6. FORM WITH STYLED INPUTS
// ============================================================================

export function FormExample() {
  return (
    <form className="space-y-4">
      <div>
        <label className="text-subhead block mb-2">Amount</label>
        <input
          type="number"
          className="w-full px-4 py-2 bg-gg-surface border border-gg-border rounded text-body focus:border-aged-gold focus:outline-none"
          placeholder="0.00"
        />
      </div>
      <LeverageRune type="submit" className="w-full">
        Submit
      </LeverageRune>
    </form>
  );
}

// ============================================================================
// 7. SIMPLE TEXT STYLING (No Components)
// ============================================================================

export function SimpleTextExample() {
  return (
    <div>
      {/* Cinzel Display Font */}
      <h1 className="font-display text-3xl font-bold text-aged-gold">
        Heading
      </h1>
      
      {/* Cormorant Garamond Subhead */}
      <h2 className="font-subhead text-xl text-pale-gold mt-4">
        Subheading
      </h2>
      
      {/* Inter Body Font */}
      <p className="font-body text-base text-foreground mt-4">
        Regular body text goes here with proper spacing.
      </p>
      
      {/* JetBrains Mono Data */}
      <code className="font-data text-sm text-cold-steel mt-4 block">
        const value = 12345.67;
      </code>
    </div>
  );
}

// ============================================================================
// 8. COLOR PALETTE REFERENCE (For debugging/development)
// ============================================================================

export function ColorPaletteReference() {
  return (
    <div className="flex gap-4">
      {PALETTE_SWATCHES.map(({ name, color }) => (
        <div key={name} className="flex flex-col items-center">
          <div
            className="w-16 h-16 rounded border border-gg-border"
            style={{ backgroundColor: color }}
          />
          <span className="text-data text-xs mt-2">{name}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 9. COMBINING COMPONENTS
// ============================================================================

export function CompleteExample() {
  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div>
        <KnotworkDivider label="Dashboard" />
        <Display variant="lg" className="mt-8">
          Welcome Back
        </Display>
      </div>

      {/* Status Section */}
      <div>
        <Subhead>System Status</Subhead>
        <div className="mt-4 space-y-2">
          <Beacon status="active" label="All Systems Operational" />
        </div>
      </div>

      {/* Stats Section */}
      <div>
        <ForgedLines />
        <Subhead className="mt-8 mb-4">Your Statistics</Subhead>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RuneStone>
            <Data as="div" className="block text-aged-gold text-2xl font-bold">
              $125K
            </Data>
            <Body className="text-sm text-gg-muted mt-2">
              Total Locked
            </Body>
          </RuneStone>
        </div>
      </div>

      {/* Action Section */}
      <LeverageRune onClick={() => alert('Action!')} className="w-full">
        Execute Action
      </LeverageRune>
    </div>
  );
}

// ============================================================================
// 10. TAILWIND CLASS QUICK REFERENCE
// ============================================================================

/*
COLORS (use with text-, bg-, border-, etc.)
─────────────────────────────────────────────
text-forge-black        | bg-forge-black        | border-forge-black
text-iron-grey          | bg-iron-grey          | border-iron-grey
text-aged-gold          | bg-aged-gold          | border-aged-gold
text-pale-gold          | bg-pale-gold          | border-pale-gold
text-ember-red          | bg-ember-red          | border-ember-red
text-runic-green        | bg-runic-green        | border-runic-green
text-cold-steel         | bg-cold-steel         | border-cold-steel

TYPOGRAPHY (use font- prefix)
──────────────────────────────
font-display            (Cinzel)
font-subhead            (Cormorant Garamond)
font-body               (Inter)
font-data               (JetBrains Mono)

TEXT STYLES (use class directly)
──────────────────────────────────
text-display-xl         (Largest display)
text-display-lg         (Large display)
text-display            (Small display)
text-subhead            (Subheading)
text-body               (Body text)
text-data               (Data/code)

MOTIF CLASSES (use class directly)
───────────────────────────────────
rune-stone              (Stat card)
leverage-rune           (Primary button)
forged-lines            (Line separator)
beacon                  (Status indicator)
beacon-dot              (Beacon color dot)
beacon-label            (Beacon text)
knotwork-divider        (Section divider)
knotwork-pattern        (Background pattern)

STATUS MODIFIERS (for beacons)
──────────────────────────────
status-active           (Green - Success)
status-warning          (Gold - Warning)
status-error            (Red - Error)
status-neutral          (Steel - Neutral)

ANIMATIONS
──────────
animate-float           (Floating motion)
animate-pulse-glow      (Glowing pulse)
animate-gradient-shift  (Gradient animation)
animate-rune-shimmer    (Rune card shimmer)
animate-beacon-pulse    (Beacon pulse)
*/

export default {
  StatCardExample,
  HeroSection,
  StatusDashboard,
  DataSection,
  StatusText,
  FormExample,
  SimpleTextExample,
  ColorPaletteReference,
  CompleteExample,
};
