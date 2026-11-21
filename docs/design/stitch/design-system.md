---
name: ConstructStock
colors:
  surface: '#fbf8fc'
  surface-dim: '#dcd9dd'
  surface-bright: '#fbf8fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2f7'
  surface-container: '#f0edf1'
  surface-container-high: '#eae7eb'
  surface-container-highest: '#e4e1e6'
  on-surface: '#1b1b1e'
  on-surface-variant: '#414942'
  inverse-surface: '#303033'
  inverse-on-surface: '#f3f0f4'
  outline: '#717971'
  outline-variant: '#c1c9c0'
  surface-tint: '#3b684a'
  primary: '#144227'
  on-primary: '#ffffff'
  primary-container: '#2d5a3d'
  on-primary-container: '#9ed0ab'
  inverse-primary: '#a1d2ad'
  secondary: '#58605c'
  on-secondary: '#ffffff'
  secondary-container: '#d7dfda'
  on-secondary-container: '#5b635f'
  tertiary: '#5c2b33'
  on-tertiary: '#ffffff'
  tertiary-container: '#774149'
  on-tertiary-container: '#f9b1b9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#bceec8'
  primary-fixed-dim: '#a1d2ad'
  on-primary-fixed: '#00210f'
  on-primary-fixed-variant: '#224f33'
  secondary-fixed: '#dce4df'
  secondary-fixed-dim: '#c0c8c4'
  on-secondary-fixed: '#161d1a'
  on-secondary-fixed-variant: '#414845'
  tertiary-fixed: '#ffd9dd'
  tertiary-fixed-dim: '#fcb3bc'
  on-tertiary-fixed: '#360d15'
  on-tertiary-fixed-variant: '#6b373f'
  background: '#fbf8fc'
  on-background: '#1b1b1e'
  surface-variant: '#e4e1e6'
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md-mobile:
    fontFamily: Manrope
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
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
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
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
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a modern, trustworthy, and warm B2B SaaS aesthetic tailored for construction material inventory and waste management. Designed for site managers, procurement officers, and sustainability leads, the interface replaces industrial cliché—such as hazard stripes, harsh yellows, and cluttered spreadsheets—with calm architectural precision.

The visual language blends **Minimalism** with **Corporate / Modern** structure, grounded by subtle architectural blueprint and grid-line accents. Generous whitespace, crisp white cards resting on warm off-white canvases, and muted forest-green accents evoke operational clarity, environmental stewardship, and financial reliability. Every element is engineered to reduce cognitive load during high-stakes material tracking and waste-diversion reporting.

## Colors

The palette is strictly **light-first**, anchored by warm, tactile neutrals and a grounded forest-green accent that signals sustainability and operational control without visual fatigue.

- **Backgrounds & Surfaces:** Use `#FAF9F6` as the primary application canvas and `#F4F3EF` for secondary structural regions, sidebars, and recessed table headers. Crisp `#FFFFFF` is reserved for elevated cards, modals, and primary data containers.
- **Text & Ink:** Primary headings and high-emphasis data use deep charcoal (`#18181B`), while secondary body copy, metadata, and axis labels use `#27272A` or muted warm grey.
- **Primary & Secondary Accents:** Muted forest green (`#2D5A3D`) drives primary actions, active navigation states, and key sustainability metrics, with `#234730` reserved for hover and pressed states. Soft sage (`#E8F0EB`) provides subtle tonal fills for active badges, selected rows, and positive status indicators.
- **Borders & Grid Lines:** Subtle warm grey (`#E4E4E0`) defines 1px structural dividers, card outlines, and faint architectural blueprint grid accents.
- **Guardrails:** Avoid bright yellows, pinks, red-heavy palettes, hazard stripes, and decorative gradients. Semantic alerts should remain understated and desaturated.

## Typography

The typographic hierarchy pairs **Manrope** for display and section headings with **Inter** for dense operational data, tables, and form controls.

- **Headlines:** Manrope's geometric warmth and slightly tight tracking (`-0.02em` at large sizes) give dashboard titles and KPI summaries an architectural, editorial poise. On mobile viewports, `headline-lg` and `headline-md` step down to `headline-lg-mobile` (`28px`) and `headline-md-mobile` (`22px`) to preserve breathing room.
- **Body & Data:** Inter provides high legibility at `14px` (`body-md`) for inventory tables, material manifests, and waste-diversion logs. Use tabular numerals (`font-variant-numeric: tabular-nums`) across all weight, volume, and cost columns so figures align cleanly.
- **Labels:** Uppercase or semi-bold `label-sm` (`11px`, `0.04em` tracking) is reserved for table column headers, blueprint-style coordinate tags, and status badges.

## Layout & Spacing

This design system uses a **12-column fluid grid** with generous whitespace to prevent operational dashboards from feeling cramped.

- **Grid & Rhythm:** On desktop (`>= 1024px`), content aligns to a 12-column fluid grid with `1.5rem` (`24px`) gutters and `2rem` (`32px`) outer canvas margins. Cards and summary widgets typically span 3, 4, 6, or 12 columns.
- **Responsive Adaptation:**
  - **Tablet (`768px – 1023px`):** Reflows to an 8-column grid with `1.25rem` gutters and `1.5rem` margins. Multi-column metric rows stack into 2x2 grids.
  - **Mobile (`< 768px`):** Collapses to a 4-column grid with `1rem` gutters and `1rem` margins. Data tables transition to stacked summary cards.
- **Architectural Accents:** Subtle `1px` warm grey (`#E4E4E0`) grid lines may be used sparingly behind hero metric bands or empty states to reinforce the blueprint metaphor without competing with foreground content.

## Elevation & Depth

Visual hierarchy relies on **tonal layers** and **low-contrast outlines** rather than heavy drop shadows.

- **Tonal Layering:** Depth is primarily established by placing crisp `#FFFFFF` cards onto `#FAF9F6` and `#F4F3EF` background tiers.
- **Soft 1px Borders:** Every card, input field, and data container is framed by a `1px solid #E4E4E0` border, creating crisp, architectural separation.
- **Minimal Subtle Shadows:** Shadows are used sparingly for floating elements such as dropdown menus, popovers, and sticky action bars. Keep shadows ultra-diffused and neutral (e.g., `0 4px 12px rgba(24, 24, 27, 0.04)`), avoiding dark or high-contrast blurs.

## Shapes

The shape language uses a **Soft (`1`)** roundedness scale, balancing approachable modern SaaS ergonomics with architectural precision.

- **Standard Controls (`0.25rem` / `4px`):** Buttons, text inputs, checkboxes, and compact badges use `0.25rem` corners to feel crisp and structured.
- **Cards & Containers (`0.5rem` / `8px`):** Dashboard cards, data tables, and modals use `rounded-lg` (`0.5rem`) to soften large rectangular surfaces without looking playful or overly pill-shaped.
- **Pills & Status Tags:** Inline status chips and filter pills may use full-pill rounding only when distinguishing them from rectangular action buttons.

## Components

- **Buttons:** Primary buttons use `#2D5A3D` fills with `#FFFFFF` text, transitioning to `#234730` on hover. Secondary buttons use `#FFFFFF` backgrounds with `1px solid #E4E4E0` borders and `#18181B` text. Ghost buttons use `#2D5A3D` text with `#E8F0EB` hover fills.
- **Chips & Status Badges:** Material status and waste-diversion tags use `#E8F0EB` backgrounds with `#2D5A3D` text for positive/diverted states, and `#F4F3EF` with `#27272A` text for neutral/in-transit states.
- **Lists & Inventory Tables:** Rows sit on `#FFFFFF` with `1px solid #E4E4E0` horizontal dividers. Table headers use `#F4F3EF` backgrounds and `label-sm` typography. Hovering a row applies a subtle `#FAF9F6` tint.
- **Checkboxes & Radio Buttons:** Unchecked controls feature `1px solid #E4E4E0` borders on `#FFFFFF`. Checked states fill with `#2D5A3D` and crisp `#FFFFFF` indicators.
- **Input Fields:** Inputs use `#FFFFFF` backgrounds, `1px solid #E4E4E0` borders, and `0.25rem` (`4px`) corners. Focus states transition the border to `#2D5A3D` with a subtle `2px` `#E8F0EB` outer ring.
- **Cards:** Standard cards use `#FFFFFF` surfaces, `1px solid #E4E4E0` borders, `0.5rem` (`8px`) corner radius, and `1.5rem` (`space-lg`) internal padding.
- **Domain-Specific Components:** Include **Material Manifest Drawers** (slide-over panels with `#FAF9F6` headers for inspecting batch weights and supplier certificates) and **Waste Diversion Progress Bars** (flat `#E8F0EB` tracks with `#2D5A3D` fills and tabular percentage readouts).