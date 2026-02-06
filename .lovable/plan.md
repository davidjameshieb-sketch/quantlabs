

# Landing Page Restructure: Fleet-First Layout

## What Changes

The landing page will be reorganized so visitors immediately see the **AI Trading Fleet** grid the moment they arrive -- no scrolling required. The current full-screen hero section will be condensed into a compact intro header that sits just below the navbar, followed immediately by the fleet grid and a prominent "Explore Free Dashboard" call-to-action underneath.

## New Visual Flow

```text
+--------------------------------------------------+
|  Navbar (fixed, 64px)                            |
+--------------------------------------------------+
|  Compact Hero Header                             |
|  - "AI-Powered Quantitative Trading Intelligence"|
|  - One-line subtitle                             |
|  - Trust badges (inline)                         |
+--------------------------------------------------+
|  AI Fleet Showcase Grid (10 agent cards)         |
|  - Immediately visible, no scroll needed         |
+--------------------------------------------------+
|  "Explore Free Dashboard" CTA Banner             |
|  - Large, highlighted button                     |
|  - "Preview Edge Access" secondary button        |
|  - Trust micro-copy below                        |
+--------------------------------------------------+
|  Demonstration Section                           |
|  Trust Flow Section                              |
|  ... (rest of page unchanged)                    |
+--------------------------------------------------+
```

## Technical Details

### 1. Restructure `HeroSection.tsx`

Transform from a full-screen (`min-h-screen`) centered hero into a compact header:
- Remove `min-h-screen` and vertical centering
- Add top padding to account for the fixed navbar (pt-24)
- Keep the headline, subtitle, and trust badges but reduce spacing significantly
- Remove the CTA buttons from the hero (they move below the fleet)
- Reduce heading sizes slightly for a tighter layout (e.g., `text-3xl md:text-5xl` instead of `text-4xl md:text-6xl lg:text-7xl`)
- Keep the EdgePreviewModal state and rendering

### 2. Update `AIFleetShowcase.tsx`

- Reduce top padding from `py-24` to `py-8` so the grid appears immediately below the compact hero
- Keep all existing card content, sparklines, and animations unchanged
- Add a prominent CTA block at the bottom of the section with:
  - "Explore Free Dashboard" primary button (large, glowing)
  - "Preview Edge Access" secondary outline button
  - Trust micro-copy underneath
- The EdgePreviewModal trigger will need to be handled -- either pass the `setPreviewOpen` callback as a prop or manage modal state within the showcase component

### 3. Update `Index.tsx`

- Section order stays the same: `HeroSection` then `AIFleetShowcase`
- No reordering needed since the hero is now compact and the fleet is immediately visible

### 4. CTA Relocation Strategy

Since the "Explore Free Dashboard" and "Preview Edge Access" buttons are moving from the hero into the bottom of the fleet showcase:
- The `EdgePreviewModal` state and component will move into `AIFleetShowcase.tsx`
- The hero section becomes a pure heading/intro without interactive buttons
- The fleet section gains a visually prominent CTA block after the card grid

### Files Modified

| File | Change |
|------|--------|
| `src/components/landing/HeroSection.tsx` | Compact layout: remove `min-h-screen`, tighten spacing, remove CTA buttons |
| `src/components/landing/AIFleetShowcase.tsx` | Reduce top padding, add CTA buttons + EdgePreviewModal below the grid |

