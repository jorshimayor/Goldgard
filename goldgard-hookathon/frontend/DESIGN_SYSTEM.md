# Viking Golden Robotic-Gothic Design System

## Overview

The Goldgard frontend uses the "Viking Golden Robotic-Gothic" design system, a comprehensive aesthetic framework combining Norse visual heritage with sophisticated robotics. This guide provides complete documentation for implementing the design system throughout the application.

## Color Palette

### The Seven Colors

| Color | Hex | CSS Variable | Usage |
|-------|-----|--------------|-------|
| **Forge Black** | `#0a0a0a` | `--forge-black` | Primary background, text depth |
| **Iron Grey** | `#2a2a2a` | `--iron-grey` | Secondary backgrounds, borders |
| **Aged Gold** | `#c9a961` | `--aged-gold` | Primary accent, highlights |
| **Pale Gold** | `#e8d5a8` | `--pale-gold` | Secondary accent, lighter highlights |
| **Ember Red** | `#8b3a3a` | `--ember-red` | Error states, critical indicators |
| **Runic Green** | `#3a5a4a` | `--runic-green` | Success states, active indicators |
| **Cold Steel** | `#5a7a8a` | `--cold-steel` | Info states, neutral indicators |

### Tailwind Color Utilities

Use these classes throughout your components:

```tsx
// Tailwind color classes
<div className="bg-forge-black text-pale-gold">
<button className="border-aged-gold hover:bg-cold-steel">
<span className="text-ember-red">Error State</span>
<span className="text-runic-green">Active State</span>
```

## Typography System

### Four Typefaces

| Font | Type | Usage | Tailwind Class |
|------|------|-------|-----------------|
| **Cinzel** | Display | Headlines, titles, dramatic text | `font-display` |
| **Cormorant Garamond** | Subheadline | Section headers, subheadings | `font-subhead` |
| **Inter** | Body | Body copy, form text, UI labels | `font-body` |
| **JetBrains Mono** | Data | Code, numbers, technical data | `font-data` |

### Typography Components

Import from `@/components/DesignComponents`:

```tsx
import { Display, Subhead, Body, Data } from '@/components/DesignComponents';

// Display headings
<Display variant="xl">Main Title</Display>
<Display variant="lg" as="h2">Section Title</Display>
<Display variant="base" as="h3">Small Title</Display>

// Subheading
<Subhead>Important Subtitle</Subhead>

// Body text
<Body>This is regular body text for content.</Body>

// Data/Technical text
<Data as="code">const variable = value;</Data>
```

### CSS Classes

```tsx
<h1 className="text-display-xl">Large Display</h1>
<h2 className="text-display-lg">Medium Display</h2>
<h3 className="text-display">Small Display</h3>
<h4 className="text-subhead">Subheading</h4>
<p className="text-body">Body text content</p>
<span className="text-data">Technical data</span>
```

## Component Motifs

### 1. Rune Stones (Stat Cards)

Stat cards with ancient runic aesthetic and shimmer animation.

**CSS Class**: `rune-stone`

```tsx
import { RuneStone } from '@/components/DesignComponents';

<RuneStone>
  <div className="text-display">$12,500</div>
  <p className="text-body text-gg-muted">Total Value Locked</p>
</RuneStone>
```

Or with raw CSS:

```tsx
<div className="rune-stone">
  <div className="rune-stone-content">
    <div className="text-display">$12,500</div>
    <p className="text-body">Total Value Locked</p>
  </div>
</div>
```

**Features**:
- Aged Gold border with gradient background
- Shimmer animation on hover
- Glow effect
- Responsive padding and spacing

### 2. Leverage Rune (Primary Buttons)

Action buttons with prominent styled appearance and interactive shine effect.

**CSS Class**: `leverage-rune`

```tsx
import { LeverageRune } from '@/components/DesignComponents';

<LeverageRune onClick={handleAction}>
  Execute Action
</LeverageRune>
```

Or with HTML:

```tsx
<button className="leverage-rune">
  Execute Action
</button>
```

**Features**:
- Cinzel display font, uppercase text
- Aged Gold gradient background
- Letter spacing for dramatic effect
- Shine animation on hover
- Smooth spring-like lift effect

### 3. Forged Lines (Chart Decorators)

Elegant line separators with accent dots at endpoints.

**CSS Class**: `forged-lines`

```tsx
import { ForgedLines } from '@/components/DesignComponents';

<ForgedLines />
```

Or with raw CSS:

```tsx
<div className="forged-lines" />
```

**Features**:
- Linear gradient from Aged Gold to Cold Steel
- Glowing dots at both ends
- Used for visual separation in charts and data displays
- Connects visual elements

### 4. Beacons (Status Indicators)

Pulsing status indicators for system health, warnings, errors, and neutral states.

**CSS Classes**: `beacon`, `beacon-dot`, `beacon-label`

```tsx
import { Beacon } from '@/components/DesignComponents';

<Beacon status="active" label="Live" />
<Beacon status="warning" label="Caution" />
<Beacon status="error" label="Error" />
<Beacon status="neutral" label="Inactive" />
```

Or with raw HTML:

```tsx
<div className="beacon">
  <div className="beacon-dot status-active" />
  <span className="beacon-label">Live</span>
</div>
```

**Status Variants**:
- `status-active` - Runic Green (success/live)
- `status-warning` - Aged Gold (warning/caution)
- `status-error` - Ember Red (error/critical)
- `status-neutral` - Cold Steel (inactive/neutral)

**Features**:
- Continuous pulse animation
- Glow effect around dot
- Color-coded by status
- JetBrains Mono label font

### 5. Knotwork Dividers

Decorative section dividers with optional central label, inspired by Norse knotwork patterns.

**CSS Classes**: `knotwork-divider`, `knotwork-divider-center`, `knotwork-pattern`

```tsx
import { KnotworkDivider } from '@/components/DesignComponents';

<KnotworkDivider label="Section Break" />
<KnotworkDivider />
```

Or with raw HTML:

```tsx
<div className="knotwork-divider">
  <div className="knotwork-divider-center">Section Label</div>
</div>
```

**Features**:
- Gradient lines extending from center
- Diamond symbols around label
- Can be used with or without label
- Applies to full width container

## Layout Patterns

### Rune Stone Grid

Create responsive grids of stat cards:

```tsx
import { KnotworkGrid, RuneStone } from '@/components/DesignComponents';

<KnotworkGrid columns={3}>
  <RuneStone>
    <div className="text-display">Value</div>
  </RuneStone>
  <RuneStone>
    <div className="text-display">Value</div>
  </RuneStone>
  <RuneStone>
    <div className="text-display">Value</div>
  </RuneStone>
</KnotworkGrid>
```

The `KnotworkGrid` component:
- Adds knotwork pattern background
- Responsive columns (1, 2, 3, or 4)
- Proper spacing and gap handling
- Automatically adjusts for mobile/tablet/desktop

### Background Patterns

Apply ancient patterns to containers:

```tsx
<div className="knotwork-pattern">
  {/* Content */}
</div>
```

## Design Utilities

### From `@/lib/design-system.ts`

```tsx
import {
  COLORS,
  TYPOGRAPHY,
  COMPONENT_MOTIFS,
  runeStoneClasses,
  leverageRuneClasses,
  beaconClasses,
  typographyClasses,
} from '@/lib/design-system';

// Access color values directly
const goldColor = COLORS.aged.gold;

// Get Tailwind classes
const cardClass = runeStoneClasses('mt-4 p-6');
const buttonClass = leverageRuneClasses('w-full');
const indicatorClass = beaconClasses('active', 'mb-2');

// Typography class builder
const titleClass = typographyClasses('display-lg', 'mb-4');
```

## Implementation Examples

### Complete Stat Card Section

```tsx
import { Display, Subhead, Body, RuneStone, KnotworkGrid, KnotworkDivider } from '@/components/DesignComponents';

export function StatsSection() {
  return (
    <div className="py-8">
      <KnotworkDivider label="Statistics" />
      
      <Display variant="lg" className="mt-8 mb-6">Your Metrics</Display>
      
      <KnotworkGrid columns={3}>
        <RuneStone>
          <div className="text-display">2,500</div>
          <Subhead className="text-sm mt-2">Active Positions</Subhead>
          <Body className="text-gg-muted text-sm">Across all pools</Body>
        </RuneStone>
        
        <RuneStone>
          <div className="text-display text-pale-gold">$125K</div>
          <Subhead className="text-sm mt-2">Total Locked</Subhead>
          <Body className="text-gg-muted text-sm">In safety module</Body>
        </RuneStone>
        
        <RuneStone>
          <div className="text-display text-runic-green">+12.5%</div>
          <Subhead className="text-sm mt-2">Yield APY</Subhead>
          <Body className="text-gg-muted text-sm">Current rate</Body>
        </RuneStone>
      </KnotworkGrid>
    </div>
  );
}
```

### Complete Button Section

```tsx
import { LeverageRune, ForgedLines } from '@/components/DesignComponents';

export function ActionButtons() {
  return (
    <div>
      <ForgedLines />
      
      <div className="flex gap-4 mt-6">
        <LeverageRune onClick={handlePrimary} className="flex-1">
          Primary Action
        </LeverageRune>
        
        <button className="leverage-rune flex-1 opacity-75">
          Secondary Action
        </button>
      </div>
    </div>
  );
}
```

### Status Dashboard

```tsx
import { Beacon, Display, Data } from '@/components/DesignComponents';

export function SystemStatus() {
  return (
    <div className="space-y-4">
      <Beacon status="active" label="API Connected" />
      <Beacon status="active" label="Smart Contracts Live" />
      <Beacon status="warning" label="Network Congestion" />
      <Beacon status="neutral" label="Maintenance Scheduled" />
    </div>
  );
}
```

## Animation Classes

The design system includes built-in animations:

| Animation | Duration | Use Case |
|-----------|----------|----------|
| `animate-float` | 3s | Floating elements |
| `animate-pulse-glow` | 2s | Glowing highlights |
| `animate-gradient-shift` | 3s | Animated gradients |
| `animate-rune-shimmer` | 3s | Rune stone cards |
| `animate-beacon-pulse` | 2s | Status indicators |

```tsx
<div className="animate-pulse-glow">Glowing element</div>
<div className="animate-rune-shimmer">Shimmer effect</div>
```

## Responsive Design

All components are fully responsive:

```tsx
// Mobile-first approach
<div className="text-display-lg lg:text-display-xl">
  Responsive Title
</div>

<KnotworkGrid columns={1} className="sm:grid-cols-2 lg:grid-cols-4">
  {/* Grid adapts to screen size */}
</KnotworkGrid>
```

## Accessibility

### Color Contrast
- Text on Forge Black: Pale Gold (AAA compliant)
- Buttons: High contrast for visibility
- Beacon indicators: Supplemented with labels

### Semantic HTML
- Always use proper heading hierarchy (h1, h2, h3, etc.)
- Use `<button>` elements for interactive controls
- Include `aria-labels` for status indicators

```tsx
<Beacon status="active" label="System Online" />
<LeverageRune aria-label="Execute transaction">
  Execute
</LeverageRune>
```

## CSS Variables Reference

All colors and fonts are available as CSS variables:

```css
/* Colors */
--forge-black
--iron-grey
--aged-gold
--pale-gold
--ember-red
--runic-green
--cold-steel

/* Typography */
--font-display    /* Cinzel */
--font-subhead    /* Cormorant Garamond */
--font-body       /* Inter */
--font-data       /* JetBrains Mono */

/* Legacy mappings */
--gg-gold, --gg-gold-2, --gg-blood, etc.
```

## Best Practices

1. **Use Component Library First**: Prefer imported React components from `DesignComponents.tsx`
2. **Maintain Color Hierarchy**: Use Aged Gold for primary focus, others for support
3. **Typography Consistency**: Follow the 4-font system for text hierarchy
4. **Animation Restraint**: Use animations sparingly for important interactions
5. **Dark Mode**: The entire system is built for dark theme — maintain contrast
6. **Spacing**: Use Tailwind's spacing scale (gap, p-, m-) consistently
7. **Responsive**: Test designs on mobile, tablet, and desktop

## Troubleshooting

### Fonts not loading
Ensure the layout.tsx file includes all font imports and font variables are properly set.

### Colors looking wrong
Check that CSS variables are defined in globals.css and Tailwind config extends them properly.

### Animations not working
Verify `@keyframes` are defined in globals.css and animation names match in tailwind.config.ts.

### Component styling broken
Make sure you're importing from `@/components/DesignComponents` (with @ alias) or correct relative path.

---

**Last Updated**: 2026-05-17
**Design System**: Viking Golden Robotic-Gothic v1.0
