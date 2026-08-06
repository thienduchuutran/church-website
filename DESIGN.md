---
name: Vietnamese Gospel Outreach Ministry New England
description: Warm, type-led community hub for a Vietnamese-American Alliance church in Saugus, MA.
colors:
  background: "#faf7f2"
  foreground: "#1c1a18"
  primary: "#c4663c"
  primary-light: "#d67a52"
  accent: "#4a7a5c"
  accent-light: "#5f9174"
  gold: "#c49a3c"
  surface: "#fffefb"
  muted: "#6b6560"
  border: "#eae5de"
  hero-bg: "#1C1210"
  hero-cream: "#f5f0eb"
rounded:
  button: "8px"
  card: "14px"
spacing:
  page-gutter: "16px"
  section-gap-lg: "96px"
  content-max: "760px"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2.25rem, 5.5vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.surface}"
  button-ghost-on-dark:
    backgroundColor: "transparent"
    textColor: "{colors.hero-cream}"
    rounded: "{rounded.button}"
    padding: "10px 20px"
  card-article:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "0"
---

# Design System: Vietnamese Gospel Outreach Ministry New England

## Overview

**Creative North Star: "The Hearth After Hours"**

This system is built for members glancing at phones and laptops at home after work, or catching up on Sunday between services: warm cream fields, terracotta as the single confident accent for action, and sage only where a second voice is needed (events, admin hints). Darkness lives in the **hero band only** (`#1C1210`), like a quiet coffee shop interior, not a full-site dark theme. Typography does the identity work: **Playfair** carries headlines and card titles; **Geist** carries UI, body, and labels. Nothing should read as a generic nonprofit template, SaaS pricing page, or navy "church web" cliché.

Depth is earned with **space and type**, not background color bands between sections. Cards are for **distinct post content** only; they **rest on a soft shadow** and **rise a few pixels on hover**, so a card always reads as a discrete object sitting on the cream field and confirms itself when you point at it.

**Key Characteristics:**

- Warm cream (`#faf7f2`) page field; ink (`#1c1a18`) body copy; terracotta (`#c4663c`) for all primary interactive emphasis.
- Hero is **type-only** (no photography): radial terracotta glow + thin terracotta-to-gold rule at the foot of the hero.
- **Cards float, everything else is flat**: cards carry a resting shadow and lift on hover; panels, alerts, and section blocks never cast one.
- **System prefers-color-scheme: dark** uses warm charcoal surfaces, never blue-gray chrome.

## Colors

The palette is **committed terracotta on warm neutral**: one saturated accent carries CTAs, links, and announcement badges; sage is a secondary voice for events and secondary UI; gold is reserved for decorative rules and similar accents, never for primary buttons.

### Primary

- **Ember Terracotta** (`#c4663c`): Links, buttons, focus rings, skip-link background, announcement post badges, active nav tint. The accent the eye should find first when scanning for "what can I do?"

### Secondary

- **Sage Leaf** (`#4a7a5c` / light hover `#5f9174`): Event badges, secondary emphasis (e.g. admin nav accent in light mode). Not interchangeable with primary for CTAs.

### Tertiary

- **Warm Gold** (`#c49a3c`): Decorative only: hero bottom gradient rule segment, calendar dots, divider accents per PRODUCT. **Never** primary button fill.

### Neutral

- **Cream Field** (`#faf7f2`): Default page background (`--background`).
- **Warm Paper** (`#fffefb`): Card and panel surfaces (`--surface`), slightly off pure white.
- **Ink** (`#1c1a18`): Primary text (`--foreground`).
- **Stone Muted** (`#6b6560`): Secondary text, de-emphasized nav (`--muted`).
- **Bisque Border** (`#eae5de`): Hairline borders on cards, dividers (`--border`).

### Hero-only

- **Coffee-Shell Dark** (`#1C1210`): Full-bleed hero background only.
- **Candle Cream** (`#f5f0eb`): Hero headline and ghost-button text on dark (not pure `#ffffff`).

### Named Rules

**The One Ember Rule.** Terracotta is the only hue that may signal "click here" or primary navigation emphasis. If a control reads as interactive, it must not be navy, gray, or cold blue.

**The Gold Is Silent Rule.** `#c49a3c` may ornament lines and marks; it does not run buttons, links, or chips.

## Typography

**Display font:** Playfair Display (Google Fonts), weights 400 / 600 / 700, with Georgia fallback.  
**Body / UI font:** Geist Sans (Next.js `next/font`), system-ui fallback.  
**Mono:** Geist Mono (code, rare).

**Character:** Editorial warmth in headings (Playfair, tight leading on display) paired with a clean, readable sans for everything operational. One italic moment in the hero display line only, in terracotta, per PRODUCT.

### Hierarchy

- **Display** (700, `clamp(2.25rem, 5.5vw, 4rem)`, line-height **1.06**, tracking **-0.025em**): Home hero `h1` and equivalent page heroes. Max one italic terracotta phrase inside the display line.
- **Headline** (600, `1.25rem`–`1.5rem` / `text-xl`–`text-2xl`, tight leading): Section `h2` on home and feed pages, section titles.
- **Title** (600, ~`1.125rem` / `text-lg`): Post card titles (`PostCard`), Playfair.
- **Body** (400, **16px minimum** on marketing surfaces, line-height **1.75**): Paragraphs, hero description, error alert body. Cap line length **~65ch** on wide hero descriptions.
- **Label** (600, ~`11px` uppercase, letter-spacing **0.08em**): Hero eyebrow, metadata labels, uppercase chips where used.

### Named Rules

**The Serif Owns Headlines Rule.** Any element that is a page title, section title, or card title uses `font-serif` (Playfair). UI chrome and buttons stay `font-sans` (Geist), and UI sans does not use weight 700 for body-scale copy.

## Elevation

The system has exactly **two elevations: the card layer and the page**. Cards (`PostCard`, gallery album tiles, admin panels) always cast a shadow. Everything else - dashed empty states, alerts, `bg-surface/50` section blocks - stays **border + warm surface** only. Page transitions use a short **opacity + translateY** fade (not layout-affecting properties).

Every level is **two shadows, not one**: a tight contact shadow that anchors the card to the page, plus a wide ambient shadow that gives it height. A single blur reads like a sticker. Both layers are tinted with the ink hue (`28, 20, 16`) rather than black, so shadows stay warm on the cream field.

### Shadow vocabulary

Canonical values live in `frontend/app/globals.css` as `--elevation-card` / `--elevation-card-hover`. Never hardcode a shadow string on a card.

| Token | Light | Dark | Used by |
|---|---|---|---|
| `--elevation-card` | `0 1px 3px rgba(28,20,16,.07), 0 6px 16px -3px rgba(28,20,16,.11)` | `0 1px 3px rgba(0,0,0,.38), 0 6px 18px -3px rgba(0,0,0,.52)` | Every card, at rest |
| `--elevation-card-hover` | `0 2px 5px rgba(28,20,16,.08), 0 16px 36px -6px rgba(28,20,16,.17)` | `0 2px 6px rgba(0,0,0,.42), 0 18px 40px -6px rgba(0,0,0,.68)` | Interactive cards, on `:hover` |

**The two levels must move together.** The effect is carried by the *gap* between rest and hover, not by either value alone. If you raise the resting shadow, raise the hover shadow by roughly the same ratio or the lift stops reading.

Dark mode does **not** reuse the ink-tinted values: at 5-13% alpha they are invisible against a `#141210` field, so it switches to near-black at much higher alpha.

### Card classes

Two utilities in `globals.css`, deliberately un-layered so they outrank any stray Tailwind `shadow-*`:

- **`.card-lift`** - interactive cards. Resting shadow, plus `translateY(-3px)` and the hover shadow on `:hover`. Gated behind `@media (hover: hover)` so a tap does not leave a card stuck raised on touch. Enter 200ms, settle 320ms, both on `cubic-bezier(0.22, 1, 0.36, 1)`. Under `prefers-reduced-motion` the shadow still changes but the travel and the tween are dropped.
- **`.card-rest`** - static panels. Resting shadow only, no hover response.

### Named Rules

**The Two-Layer Rule.** There are only two heights in this system: cards, and the page they sit on. Nothing nests a third. If a surface is not a card, it does not cast a shadow, and a card never contains another card.

**The Lift Confirms Rule.** Hover elevation is reserved for surfaces that actually do something when you click them. A panel that rises under the cursor but does nothing is a lie about its affordance - static panels use `.card-rest`.

## Components

### Buttons

- **Shape:** `8px` radius (`rounded-lg`), minimum hit target **44px** height on primary actions (`min-h-11`).
- **Primary (on dark hero):** Terracotta fill (`#c4663c`), warm paper text (`#fffefb`), `hover:brightness-110`, visible focus outline in cream.
- **Ghost (on dark hero):** Transparent fill, `1px` cream border at ~85% opacity, cream text, hover adds **10%** cream wash.
- **Primary (on light field):** Terracotta text on `bg-primary/10` pill (e.g. reload link in alerts, nav sign-in) with darker terracotta hover wash.

### Chips / badges

- **Announcement:** Terracotta-tinted background (`primary` at low alpha) + terracotta text.
- **Event:** Sage-tinted background (`accent` at low alpha) + sage text.
- **Default / unknown type:** Muted wash, no cold gray hex pair.

### Cards / containers

- **Corner style:** `14px` radius (`rounded-[14px]`) on `PostCard`, post feed empty state, and home error alert.
- **Background:** `surface` token.
- **Border:** `1px` `border-border` (warm bisque).
- **Shadow strategy:** `.card-lift` (resting shadow + hover rise) on interactive cards, `.card-rest` (resting shadow only) on static panels. See Elevation.
- **Internal padding:** Generous horizontal padding on card chrome (`px-5`); vertical rhythm between meta row, title, body, media, actions.

### Navigation

- **Bar:** Sticky top, `bg-background/95`, **no backdrop blur** (warm solid field, not glass).
- **Default links:** Muted text; hover uses light terracotta wash (`bg-primary/5`, `text-primary`).
- **Active route:** `bg-primary/10` + terracotta text.
- **Connect CTA:** Filled terracotta when active route; pill outline treatment when not.
- **Mobile:** Disclosure menu with `aria-expanded`, full-width list, same color logic.

### Hero (signature)

- **Structure:** Relative section, overflow hidden, `hero-bg` fill. Absolutely positioned radial glow (terracotta **20%** opacity, soft circle, top-right). Centered content stack: label → display → body → two CTAs. Absolute **3px** gradient rule along bottom edge at **40%** opacity (terracotta to gold), full width.

## Do's and Don'ts

### Do:

- **Do** keep page background **cream** (`#faf7f2`) and body text **warm ink** (`#1c1a18`).
- **Do** use **Playfair** for every headline-level title and **Geist** for nav, forms, and buttons.
- **Do** reserve **gold** for decorative lines and marks, not CTAs.
- **Do** separate major home sections with **vertical space** (large `margin-top` between feeds), not alternating background colors.
- **Do** honor **reduced motion** by disabling the page-entry fade when the user prefers reduced motion.

### Don't:

- **Don't** use **navy blue** anywhere; it is the retired palette (PRODUCT Hard Avoids).
- **Don't** use **pure `#000000` or `#ffffff`** as full-page backgrounds; tint neutrals toward warmth.
- **Don't** use **cool gray** borders; borders stay **warm bisque** (`#eae5de`).
- **Don't** put **blue on any interactive element**; failure condition per PRODUCT.
- **Don't** add **section background color changes** just to separate blocks; use space.
- **Don't** use **gradients** except the **hero radial glow** and **hero bottom rule** (PRODUCT).
- **Don't** use **glassmorphism** (decorative blur panels) as the default chrome; the nav is opaque warm field.
- **Don't** use **Inter, Roboto, or Space Grotesk** (PRODUCT).
- **Don't** ship layouts that look like a **generic church template**, **AI-generated nonprofit site**, or **SaaS hero → three icon cards → testimonial strip** (PRODUCT Anti-Generic Directive and Hard Avoids).
- **Don't** use **decorative blobs, gradient meshes, or floating shapes** behind content (PRODUCT).
