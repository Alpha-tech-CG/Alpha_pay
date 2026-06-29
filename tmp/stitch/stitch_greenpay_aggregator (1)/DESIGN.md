---
name: Lumina Finance
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#5c5f60'
  on-secondary: '#ffffff'
  secondary-container: '#e1e3e4'
  on-secondary-container: '#626566'
  tertiary: '#555c6e'
  on-tertiary: '#ffffff'
  tertiary-container: '#6e7487'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#e1e3e4'
  secondary-fixed-dim: '#c5c7c8'
  on-secondary-fixed: '#191c1d'
  on-secondary-fixed-variant: '#454748'
  tertiary-fixed: '#dce2f7'
  tertiary-fixed-dim: '#c0c6db'
  on-tertiary-fixed: '#141b2b'
  on-tertiary-fixed-variant: '#404758'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 1rem
  gutter: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 1.5rem
---

## Brand & Style

The design system is engineered for a high-trust payment aggregator mobile experience. The brand personality is professional, secure, and effortless, aiming to evoke a sense of financial growth and absolute reliability. 

The aesthetic follows a **Refined Minimalism** approach. It prioritizes clarity and functional efficiency, utilizing significant white space to reduce cognitive load during complex financial tasks. Visual clutter is eliminated to ensure that transaction data and balance information remain the primary focus. The interface feels light and breathable, moving away from traditional "heavy" banking apps toward a more modern, tech-forward utility.

## Colors

The palette is anchored by **Emerald Green**, chosen specifically for its association with financial growth and "go" signals. We use a slightly deeper shade (#059669) for primary actions to ensure AAA accessibility on white backgrounds.

- **Primary:** Used for call-to-action buttons, active states, and success indicators.
- **Secondary (Surface):** A clean, nearly-white gray used for background fills and card grouping to prevent stark eye strain.
- **Tertiary (Text/Heading):** A deep charcoal for high-contrast typography.
- **Status Colors:** 
  - Success: Emerald Green (Primary)
  - Pending: Amber (#F59E0B)
  - Error: Rose (#E11D48)

## Typography

The design system utilizes **Inter** exclusively to leverage its exceptional legibility in data-heavy environments. The typographic scale is highly disciplined, using weight (SemiBold/Bold) rather than size to establish hierarchy in cramped mobile views.

Numbers and currency figures should always use the `body-lg` or `headline-md` tokens to ensure they are never missed. For secondary information, like timestamps in transaction lists, `label-md` with a neutral gray color is preferred.

## Layout & Spacing

This design system employs a **Fluid Mobile Grid** based on an 8px spacing system. 

- **Margins:** A standard 16px (1rem) margin is applied to the left and right of the screen.
- **Stacking:** Elements are vertically stacked using 8px (small), 16px (medium), and 24px (large) increments to create a clear logical grouping of financial data.
- **Safe Areas:** Interactive elements must maintain a minimum 44px touch target height, regardless of their visual size.

## Elevation & Depth

To maintain a "High-Trust" aesthetic, the design system avoids heavy shadows or complex gradients. Instead, it uses **Tonal Layers** and **Soft Ambient Shadows**.

- **Level 0 (Background):** Pure White (#FFFFFF) or Secondary Surface (#F9FAFB).
- **Level 1 (Cards):** Pure White background with a 1px border of #F3F4F6 and a very soft, diffused shadow (0px 4px 6px rgba(0,0,0,0.02)).
- **Level 2 (Modals/Popovers):** Higher contrast shadow (0px 10px 15px rgba(0,0,0,0.05)) to pull the element significantly forward.
- **Interactive State:** Buttons use a subtle inner glow or a 10% darken on press rather than an elevation change.

## Shapes

The shape language is consistently **Rounded**. This softens the "cold" nature of financial data, making the app feel more approachable and modern.

- **Buttons & Cards:** Use the `rounded-md` (0.5rem) token.
- **Status Badges:** Use the `rounded-xl` (1.5rem) or pill-shape to distinguish them from clickable buttons.
- **Input Fields:** 8px corner radius to match cards, creating a unified container language.

## Components

### Buttons
- **Primary:** Solid Emerald Green with White text. No gradient.
- **Secondary:** Ghost style with an Emerald Green 1px border or a light green tint background (#ECFDF5).

### Cards
Transaction and balance cards should have 16px internal padding. Avoid using borders unless the card sits on a pure white background; on #F9FAFB surfaces, use the soft elevation shadow only.

### Status Badges
Small, high-radius "pills". Use a 10% opacity background of the status color with 100% opacity text of the same color (e.g., Success: Light Green bg / Dark Green text).

### Transaction Lists
Use a "Clean Row" pattern: 
- Left: Icon or Merchant Logo in a 40px rounded circle.
- Center: Merchant name (Headline-md) over Category (Label-md).
- Right: Amount (Headline-md) over Date (Label-sm).

### Input Fields
Standardized height of 48px. Labels should be persistently visible above the field in `label-sm` style. Use a 2px Emerald Green border for the focus state.