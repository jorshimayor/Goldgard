/**
 * Viking Golden Robotic-Gothic Component Library
 * 
 * Ready-to-use React components for design motifs
 */

import React from 'react';

/* ============================================================
   RUNE STONE COMPONENT (Stat Card)
   ============================================================ */

interface RuneStoneProps {
  children: React.ReactNode;
  className?: string;
}

export const RuneStone: React.FC<RuneStoneProps> = ({ children, className = '' }) => (
  <div className={`rune-stone ${className}`}>
    <div className="rune-stone-content">{children}</div>
  </div>
);

/* ============================================================
   LEVERAGE RUNE COMPONENT (Primary Action Button)
   ============================================================ */

interface LeverageRuneProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

export const LeverageRune = React.forwardRef<HTMLButtonElement, LeverageRuneProps>(
  ({ children, className = '', ...props }, ref) => (
    <button ref={ref} className={`leverage-rune ${className}`} {...props}>
      {children}
    </button>
  )
);

LeverageRune.displayName = 'LeverageRune';

/* ============================================================
   FORGED LINES COMPONENT (Chart/Line Decoration)
   ============================================================ */

interface ForgedLinesProps {
  className?: string;
}

export const ForgedLines: React.FC<ForgedLinesProps> = ({ className = '' }) => (
  <div className={`forged-lines ${className}`} />
);

/* ============================================================
   BEACON COMPONENT (Status Indicator)
   ============================================================ */

interface BeaconProps {
  status: 'active' | 'warning' | 'error' | 'neutral';
  label?: React.ReactNode;
  className?: string;
}

export const Beacon: React.FC<BeaconProps & React.HTMLAttributes<HTMLDivElement>> = ({
  status,
  label,
  className = '',
  ...props
}) => (
  <div className={`beacon ${className}`} {...props}>
    <div className={`beacon-dot status-${status}`} />
    {label && <span className="beacon-label">{label}</span>}
  </div>
);

/* ============================================================
   KNOTWORK DIVIDER COMPONENT
   ============================================================ */

interface KnotworkDividerProps {
  label?: string;
  className?: string;
}

export const KnotworkDivider: React.FC<KnotworkDividerProps> = ({ label, className = '' }) => (
  <div className={`knotwork-divider ${className}`}>
    {label && <div className="knotwork-divider-center">{label}</div>}
  </div>
);

/* ============================================================
   TYPOGRAPHY COMPONENTS
   ============================================================ */

interface DisplayProps extends React.HTMLAttributes<HTMLHeadingElement> {
  variant?: 'xl' | 'lg' | 'base';
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
}

export const Display = React.forwardRef<HTMLHeadingElement, DisplayProps>(
  ({ variant = 'base', children, as = 'h1', className = '', ...props }, ref) => {
    const Comp = as;
    const variantClass = {
      xl: 'text-display-xl',
      lg: 'text-display-lg',
      base: 'text-display',
    }[variant];

    return (
      <Comp ref={ref} className={`${variantClass} ${className}`} {...props}>
        {children}
      </Comp>
    );
  }
);

Display.displayName = 'Display';

interface SubheadProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  children: React.ReactNode;
}

export const Subhead = React.forwardRef<HTMLHeadingElement, SubheadProps>(
  ({ as = 'h2', children, className = '', ...props }, ref) => {
    const Comp = as;
    return (
      <Comp ref={ref} className={`text-subhead ${className}`} {...props}>
        {children}
      </Comp>
    );
  }
);

Subhead.displayName = 'Subhead';

interface BodyProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export const Body = React.forwardRef<HTMLParagraphElement, BodyProps>(
  ({ children, className = '', ...props }, ref) => (
    <p ref={ref} className={`text-body ${className}`} {...props}>
      {children}
    </p>
  )
);

Body.displayName = 'Body';

interface DataProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  as?: 'span' | 'code' | 'div';
}

export const Data: React.FC<DataProps> = ({ children, as = 'span', className = '', ...props }) => {
  const Comp = as;
  return (
    <Comp className={`text-data ${className}`} {...props}>
      {children}
    </Comp>
  );
};

/* ============================================================
   GRID COMPONENT WITH KNOTWORK
   ============================================================ */

interface KnotworkGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
}

export const KnotworkGrid: React.FC<KnotworkGridProps> = ({
  children,
  columns = 2,
  className = '',
  ...props
}) => {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className={`grid ${colsClass} gap-6 knotwork-pattern ${className}`} {...props}>
      {children}
    </div>
  );
};
