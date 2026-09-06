---
name: Vietnamese Gospel Outreach Ministry New England
description: Type-led community hub for a Vietnamese-American Alliance church in Saugus, MA, in the magenta and lavender of the VGOMNE logo.
colors:
  background: "#f9f8ff"
  foreground: "#451532"
  primary: "#8e1d5f"
  primary-light: "#850050"
  secondary: "#de718e"
  accent: "#a6366d"
  accent-light: "#de718e"
  panel: "#e8e5fd"
  panel-strong: "#beb5fa"
  surface: "#ffffff"
  muted: "#6c4160"
  border: "#d6d1fc"
  hero-bg: "#2c1323"
  hero-text: "#ffffff"
rounded:
  button: "8px"
  card: "14px"
spacing:
  page-gutter: "16px"
  section-gap-lg: "96px"
  content-max: "760px"
typography:
  display:
    fontFamily: "Baloo 2, system-ui, sans-serif"
    fontSize: "clamp(2.375rem, 6vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Baloo 2, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.6vw, 2.0625rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.1em"
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
    textColor: "{colors.hero-text}"
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

**Creative North Star: "Sunday Bloom"**

This system is built for members glancing at phones and laptops at home after work, or catching up on Sunday between services. The palette is the VGOMNE logo verbatim: a rose-to-magenta gradient emblem over a lavender watercolor wash. That wash is the page field, faint; deep magenta is the single confident voice for headings and action; mid magenta is the second voice for events; lavender at 35% is every panel. Two brand bands frame the page: the plum hero at the top and the magenta closing band at the bottom, so the scroll has a shape. Typography does the identity work with soft curves everywhere: **Baloo 2**, the rounded face the calendar masthead already used to bounce like the hand-made paper calendars, carries every heading; **Nunito**, rounded and friendly, carries prose and UI. Nothing on the site has a sharp terminal. Nothing should read as a generic nonprofit template, SaaS pricing page, or navy "church web" cliché.

Depth is earned with **space and type**, not background color bands between sections. Cards are for **distinct post content** only; they **rest on a soft magenta-tinted shadow** and **rise a few pixels on hover**, so a card always reads as a discrete object sitting on the lavender field. Prose pages are flat.

**Key Characteristics:**

- Lavender-washed field (`#f9f8ff`); deep plum prose (`#451532`) on the field and mauve prose on cards; nothing on the site is black. Deep magenta (`#8e1d5f`) for section headings and all primary interactive emphasis.
- One language per page: every visible string comes from the active locale's message bundle; the nav switcher is the only bridge between English and Vietnamese.
- Hero is left-aligned and type-led: radial rose glow, rose-to-magenta rule at the foot, one italic rose phrase.
- **Cards float, everything else is flat**: cards carry a resting shadow and lift on hover; panels, alerts, and section blocks never cast one.
- **System prefers-color-scheme: dark** keeps the same structure on a plum-charcoal field, never blue-gray chrome.

## Colors

The palette is **the VGOMNE logo, and nothing else**. Five brand values; every neutral is one of them mixed with white or near-black, so ink, gray, dividers and shadows all belong to the same family. The strategy is **committed**: the brand owns headings, the nav bar and the closing band, it is not a 10% accent on a white page.

### Primary

- **Deep Magenta** (`#8e1d5f`): Section headings, links, buttons, focus rings, skip-link background, announcement badges, active nav pill, the closing band. The accent the eye should find first when scanning for "what can I do?" 8.4:1 with white text, 8.0:1 as text on the field.
- **Dark Magenta** (`#850050`, token `--primary-light`): Hover state for every solid magenta fill. 9.9:1 with white text.

### Secondary

- **Mid Magenta** (`#a6366d`, token `--accent`): Event badges, event dates, admin nav accent. 6.2:1 on white in both directions. Not interchangeable with primary for CTAs.

### Tertiary

- **Rose** (`#de718e`, token `--secondary` / `--accent-light`): Gradient stops, the hero glow, the one italic phrase on the dark hero (5.7:1 on plum), hover on panels. Only **3.06:1** against white, so it never carries small white text and is never body-scale text on white.

### Lavender ladder

- **Field** (`#f9f8ff`, token `--background`): Lavender 10% over white. The page. Never pure white.
- **Panel** (`#e8e5fd`, token `--panel`): Lavender 35%. The nav bar, empty states, event date blocks, quote panels, load-error notices. Ink reads 13.9:1 on it, muted 6.7:1, magenta 6.9:1.
- **Border** (`#d6d1fc`, token `--border`): Lavender 60%. Hairline borders and dividers; cards use it at 60% opacity again.
- **Lavender** (`#beb5fa`, token `--panel-strong`): The logo wash at full strength. Feature blocks, the April calendar header, the callout tint. **Ink text only**: muted is 4.4:1 and magenta 4.5:1 on it.

### Neutral

- **Surface** (`#ffffff`): Post cards. White is a card color now, not the page.
- **Deep Plum** (`#451532`, token `--foreground`): Magenta 40% into near-black. Page titles and prose on the field. Deliberately a visible plum, not a near-black: 14:1 on the field.
- **Mauve** (`#6c4160`, token `--muted`): Magenta 35% into a mid gray. Dates, captions, labels, the metadata row, **and the body of a card** (8.2:1 on white) so no card is dark-on-white.
- **Plum Ink** (`#2c1323`, token `--hero-bg`): the darkest value, used only for the hero band and its video scrim.

### Hero and closing band

- **Hero band** (`#2c1323`, token `--hero-bg`): The plum ink, darker than the prose color. A video, when an admin uploads one, sits under a 60% plum scrim.
- **Hero text** (`#ffffff`, token `--hero-text`).
- **Closing band**: `--primary` with white text; social icons white at 80%.

### Dark mode

`prefers-color-scheme: dark` keeps the same structure on a plum-charcoal field (`#17101a`, surface `#221722`, panel `#2d1f33`, ink `#f6eef4`, muted `#c9a9bf`) and swaps the brand roles: deep magenta is 2.2:1 on that field, so `--primary` and `--accent` become rose (6.1:1) and solid fills darken to mid magenta on hover.

### Named Rules

**The One Magenta Rule.** Deep magenta is the only hue that may signal "click here" or primary navigation emphasis, and every section heading is magenta. If a control reads as interactive, it must not be navy, gray, or cold blue.

**The Rose Is Quiet Rule.** `#de718e` may ornament lines, glows, gradients, hover states and the hero's one italic phrase; it does not run small white-on-rose text or body text on white.

**The Lavender Is Never Text Rule.** `#beb5fa` and its tints are surfaces and lines, never a foreground.

**The No Black Rule.** Nothing on the site is black or near-black except the hero band. Prose on the field is deep plum; prose on a white card is mauve. Neutral gray paragraphs were the single biggest reason the old site read as lifeless; near-black ones read as template.

## Typography

**Heading and display font:** Baloo 2 (Google Fonts) 500 / 600 / 700 / 800, token `--font-heading`; `font-serif` and `font-marker` are aliases for it. Every heading, the hero display line, date numerals, and the calendar masthead. No italic: emphasis in a heading is color or weight, never a slanted glyph.
**Prose and UI font:** Nunito (variable, with italic), token `--font-sans`; `font-body` and `font-display` are aliases for it. Card bodies, page copy, rich text, nav, buttons, badges, labels, forms.
**Mono:** Geist Mono (hex codes, rare).

Both families ship a Vietnamese subset; that is a hard constraint, not a preference.

**Why these two.** The owner asked for soft curves. The site already owned the two roundest well-hinted Vietnamese faces on Google Fonts: Baloo 2, chosen earlier for the calendar so the month headline bounces like the hand-made paper calendars, and Nunito, suggested in PRODUCT.md. Promoting Baloo 2 to every heading makes the calendar and the rest of the site one voice. Three earlier pairings were rejected by the owner: Lora + Inter and Bricolage Grotesque + Be Vietnam Pro as the look every AI-built app has, Josefin Sans + Gentium Plus as too sharp. Do not reach for a grotesque, a crisp geometric, or a book serif again.

**Character:** Rounded, bouncy headings at heavy weight; a soft, open sans for everything you read or tap. Baloo 2 is wide with a big x-height, so headings sit a step smaller than a grotesque would and tighten slightly.

### Roles

Six roles, defined once in `frontend/app/globals.css` inside Tailwind's `components` layer, so a plain color utility (`text-white` on the closing band, `text-secondary` on the hero, `text-muted` on a card body) can still override a role's default color. Pages compose them instead of re-typing size strings. Each step is at least 1.25x the one below it.

| Utility | Face | Size | Weight / leading / tracking | Color |
|---|---|---|---|---|
| `.t-display` | Josefin | `clamp(2.5rem, 6.5vw, 4.5rem)` | 700 / 1.05 / 0 | white on the hero, one italic rose phrase |
| `.t-title` | Josefin | `clamp(2.125rem, 4.2vw, 2.875rem)` | 700 / 1.1 / 0.005em | deep plum |
| `.t-section` | Josefin | `clamp(1.625rem, 2.8vw, 2.125rem)` | 700 / 1.15 / 0.01em | **magenta**, on the section ribbon |
| `.t-card` | Josefin | `1.3125rem` | 700 / 1.25 | magenta on cards, deep plum on rows |
| `.t-body` | Gentium Plus | `1.0625rem` | 400 / 1.65 | deep plum on the field, mauve on cards |
| `.t-meta` | Nunito | `0.75rem` | 700 / uppercase / 0.1em | mauve |

Event-row date numerals: `font-heading` at ~1.65rem, 700, deep plum, on a panel block. `.rich-content` (post bodies, page blocks) is Gentium Plus at the same size and leading as `.t-body`.

### Section ribbon

`.section-ribbon` puts a section heading on a lavender band that starts at the container's left edge (it bleeds by the page gutter: 1rem, 1.5rem from `sm`, 2rem from `lg`) and rounds off on the right. It replaces the heading-plus-hairline shape. Used by `SectionHeader` for every `h2`.

### Named Rules

**The Heading Face Owns Headlines Rule.** Any element that is a page title, section title, card title or date numeral uses `font-heading`. Prose uses `font-body`. UI chrome, buttons and labels stay `font-sans`.

**The Bulletin Rule.** If a type or surface choice would be at home in a generic web app, it is wrong here. Trace every choice to the logo, the paper calendar or the printed bulletin.

## Elevation

The system has exactly **two elevations: the card layer and the page**. Cards (`PostCard`, `EventRow`, gallery album tiles, photo-strip frames, admin panels) always cast a shadow. Everything else - panels, empty states, alerts, section blocks - stays **flat**. Page transitions use a short **opacity + translateY** fade, and feeds enter with a 70ms stagger (`.stagger-children`).

Every level is **two shadows, not one**: a tight contact shadow that anchors the card to the page, plus a wide ambient shadow that gives it height. A single blur reads like a sticker. Both layers are tinted with the magenta hue (`142, 29, 95`) rather than black, so shadows stay in the palette against the lavender field.

### Shadow vocabulary

Canonical values live in `frontend/app/globals.css` as `--elevation-card` / `--elevation-card-hover`. Never hardcode a shadow string on a card.

| Token | Light | Dark | Used by |
|---|---|---|---|
| `--elevation-card` | `0 1px 2px rgba(142,29,95,.06), 0 8px 24px -8px rgba(142,29,95,.16)` | `0 1px 3px rgba(0,0,0,.38), 0 6px 18px -3px rgba(0,0,0,.52)` | Every card, at rest |
| `--elevation-card-hover` | `0 2px 4px rgba(142,29,95,.08), 0 18px 40px -10px rgba(142,29,95,.24)` | `0 2px 6px rgba(0,0,0,.42), 0 18px 40px -6px rgba(0,0,0,.68)` | Interactive cards, on `:hover` |

**The two levels must move together.** The effect is carried by the *gap* between rest and hover, not by either value alone. If you raise the resting shadow, raise the hover shadow by roughly the same ratio or the lift stops reading.

Dark mode does **not** reuse the magenta-tinted values: at 6-16% alpha they are invisible against a `#17101a` field, so it switches to near-black at much higher alpha.

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
- **Primary:** Magenta fill (`bg-primary`), white text, `hover:bg-primary-light`. Same on the hero, on the field and in the nav.
- **Ghost (on dark hero):** Transparent fill, `1px` white border at ~85% opacity, white text, hover adds **10%** white wash.
- **On the closing band:** White fill, magenta text, hover to panel.
- **Tinted (secondary actions):** Magenta text on `bg-primary/10` pill with a `bg-primary/20` hover wash.

### Chips / badges

- **Announcement:** Solid magenta, white uppercase `.t-meta`.
- **Event:** Solid mid magenta, white uppercase `.t-meta`.
- **Every other type:** Panel background, ink text. The label already says what it is; it does not need a hue of its own.

### Cards / containers

- **Corner style:** `14px` radius on `PostCard`, `EventRow`, empty states and the load-error notice; `10px` on the event date block.
- **Background:** `surface` (white) for the card body, with a `panel` header strip carrying the badge and dates; `panel` alone for empty states, quote panels and notices. Card titles are magenta and card bodies mauve: three brand tones per card and nothing close to black.
- **Border:** `1px` `border-border/60` on cards. Panels have no border.
- **Shadow strategy:** `.card-lift` (resting shadow + hover rise) on interactive cards, `.card-rest` (resting shadow only) on static panels. See Elevation.
- **Internal padding:** Generous horizontal padding on card chrome (`px-5`); vertical rhythm between meta row, title, body, media, actions.

### Section header

`components/ui/SectionHeader.tsx`: magenta `.t-section` heading on the `.section-ribbon` lavender band, optional "View all →" pill link. Used on the homepage and the list pages. Prose pages (About, Connect) keep the flatter heading-plus-`.brand-rule` shape inline, so the ribbon stays the mark of a feed section.

### Empty state

`components/ui/EmptyState.tsx`: panel background, `.t-card` line, optional muted hint. Never a dashed box.

### Navigation

- **Bar:** Sticky top, 64px, `bg-panel/95`, **no backdrop blur** (opaque lavender, not glass), `max-w-7xl`. Three zones: emblem plus wordmark (the home link), centered links, right cluster. Desktop layout from `lg`; below that, hamburger.
- **Links:** Fully rounded pills with real padding. Ink at rest; hover a magenta wash (`bg-primary/10`, `text-primary`); active a solid magenta pill with white text. "Home" is not a desktop link, the brand is.
- **Right cluster:** language switcher, social icons (`xl` and up only), the solid magenta Connect button, then Admin / Sign out or Sign in. Nothing wraps.
- **Mobile:** brand, switcher and hamburger only in the bar; the panel holds Home, every link, Connect, the account controls and a "Follow us" row with the social icons.

### Hero (signature)

- **Structure:** Relative section, overflow hidden, `hero-bg` fill, optional video under a 60% plum scrim, at least 70vh from `md`. Radial rose glow top-right at 24%. Content **left-aligned** in a 40rem column inside the 6xl page width: `.t-meta` eyebrow in rose → `.t-display` line with one italic rose phrase → description at 85% white → service line (only when the Connect page has real values) → two CTAs. Absolute **3px** rule along the bottom edge at **60%** opacity (rose to magenta), full width.
- **Copy:** every string comes from `messages/{en,vi}.json` under `Home`, in the active language only.

### Event row

`components/features/posts/EventRow.tsx`: 4rem panel date block (day numeral in `font-heading` 800, month `.t-meta`, or "TBD"), `.t-card` title, one muted line of body. The whole row is one link into `/events#post-{id}`. Upcoming events on the homepage use rows; the events page uses full cards.

### Photo strip

`components/features/gallery/RecentMoments.tsx`: newest gallery images in **arch-topped** frames (`rounded-t-full rounded-b-[14px]`, 3:4, three cycling widths), snap-scrolling sideways, each a `.card-lift` link to `/gallery`. The arch is the site's one non-rectangle shape and appears nowhere else.

### Closing band

`components/ui/SiteFooter.tsx`: `bg-primary`, rose-to-lavender rule at its top edge, `.t-section` invitation in white with its echo, the service line, a white "Plan a visit" button, social icons in white. The footer, the hero and the Connect page all read the service line through `lib/connect-summary.ts`.

## Do's and Don'ts

### Do:

- **Do** keep the page field **lavender-washed** (`#f9f8ff`) and body text **plum ink** (`#2c1323`).
- **Do** set every section heading in **magenta**, in the page's language only.
- **Do** use **Baloo 2** for every headline-level title and **Nunito** for prose, nav, forms, labels and buttons.
- **Do** reserve **rose** (`#de718e`) for gradient stops, the hero glow, the hero's italic phrase and hover states.
- **Do** separate major sections with **vertical space** (large `margin-top` between feeds), not alternating background colors; the only bands are the hero and the closing band.
- **Do** honor **reduced motion** by disabling the page-entry fade and the stagger when the user prefers reduced motion.

### Don't:

- **Don't** use **navy blue**, **terracotta**, **sage**, **gold** or **cream** anywhere; both retired palettes are fully removed.
- **Don't** use **pure `#ffffff`** as the page background; white is for cards.
- **Don't** set prose on the field in **muted**, and don't set prose on a card in **deep plum**: field prose is deep plum, card prose is mauve.
- **Don't** put **muted or rose text on full-strength lavender**, or small white text on rose.
- **Don't** use **cool gray** borders or text; every neutral is tinted toward magenta.
- **Don't** put **blue on any interactive element**; failure condition per PRODUCT.
- **Don't** add **section background color changes** just to separate blocks; use space.
- **Don't** use **gradients** except the brand rule (hero foot, section headers, closing-band edge) and the hero glow.
- **Don't** use **side-stripe borders** (`border-left` > 1px) as a colored accent on cards or panels.
- **Don't** use **glassmorphism** (decorative blur panels) as the default chrome; the nav is opaque lavender.
- **Don't** use **Inter, Roboto, Lora, Playfair, DM Sans, Space Grotesk, Bricolage Grotesque, Be Vietnam Pro, Josefin Sans or Gentium Plus**, any grotesque or sharp geometric as a display face, or any font without a Vietnamese subset. The owner wants soft curves.
- **Don't** wrap prose in **cards**; About and Connect are flat sections with a magenta heading and the brand rule.
- **Don't** ship layouts that look like a **generic church template**, **AI-generated nonprofit site**, or **SaaS hero → three icon cards → testimonial strip** (PRODUCT Anti-Generic Directive and Hard Avoids).
- **Don't** use **decorative blobs, gradient meshes, or floating shapes** behind content (PRODUCT).
