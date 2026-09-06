# Vietnamese Gospel Outreach Ministry New England - Design Context

## Project
Community website for a Vietnamese-American Christian & Missionary Alliance 
church of ~100 members in Saugus, MA. Bilingual English/Vietnamese. 
Primary users are existing members of all ages, not new visitors. This is a 
community hub, not a marketing website.

## Vibe
Warm + Contemporary Energy. Tight-knit family that's alive and moving. 
Somewhere between North Point Community Church's warmth and a well-designed 
independent coffee shop that feels like home. Confident, not flashy. 
Warm, not rustic. First 3-second feeling: modern, trustworthy, warm - 
I feel welcomed and I know exactly where to go.

## Color System
The palette is the VGOMNE logo, verbatim: a rose-to-magenta gradient emblem 
over a lavender watercolor wash. Five brand values; every neutral is one of 
them mixed with white or near-black, so ink, gray, dividers and shadows all 
belong to the same family. Strategy is **committed**, not restrained: the 
brand owns real surface area (headings, nav, closing band), it is not a 10% 
accent on a white page.

- Primary (Deep magenta): #8E1D5F - buttons, links, section headings, active nav, focus rings, badges. 8.4:1 with white text
- Primary hover (Dark magenta): #850050 - hover state of every solid magenta fill
- Rose: #DE718E - gradient stops, hero glow, the one italic phrase on the dark hero, hover on panels. Only 3.06:1 on white: never small white text, never body text on white
- Mid magenta: #A6366D - event badges, event dates, secondary UI
- Lavender: #BEB5FA - the logo wash. Full strength for feature blocks and rules (ink text only); at 35% (#E8E5FD) for the nav bar, empty states, event date blocks, quote panels; at 10% (#F9F8FF) as the page field; at 60% (#D6D1FC) for hairline borders
- Page field: #F9F8FF - lavender 10% over white. Never pure white as the page
- Card surface: #FFFFFF - post cards only. White is a card color, not the page
- Prose on the field (Deep plum): #451532 - magenta 40% into near-black, a visible plum. Page titles, About/Connect copy
- Prose on cards and metadata (Mauve): #6C4160 - card bodies, dates, captions, labels. Nothing on a white card is close to black
- Hero band (Plum ink): #2C1323 - the darkest value, hero and its video scrim only
- Closing band: #8E1D5F with white text - the page ends on the brand

Contrast rules that fall out of this: plum ink and muted pass AA on the field 
and on 35% lavender; on full lavender only ink is allowed; magenta headings 
pass on the field (8:1) and on 35% lavender (6.9:1). Rose is 5.7:1 on plum, 
which is why the hero's brand text is rose, not magenta (2.1:1).

## Typography
Two families for the whole site. Both MUST ship a Vietnamese subset on 
Google Fonts, or tone marks fall back to another font mid-word. (Junge, 
which an earlier draft of this file suggested, has no Vietnamese subset and 
cannot be used. Gentium Plus and Nunito do, and remain acceptable fallbacks.)

Soft curves everywhere - the owner's standing preference. Two rounded families, both with a Vietnamese subset, both already part of the church's material. Three earlier pairings were rejected: Lora + Inter and Bricolage Grotesque + Be Vietnam Pro as the look of every AI-built app, Josefin Sans + Gentium Plus as too sharp.

- Headings and display: **Baloo 2** 500-800 - every heading, the hero line, date numerals, and the calendar masthead (one voice across the site and the calendar). Rounded and bouncy like the hand-made paper calendars. No italic: emphasis is color or weight
- Prose and UI: **Nunito** (variable, with italic) - card bodies, page copy, rich text, nav, buttons, badges, labels, inputs
- Never Inter, Roboto, Lora, Playfair, DM Sans, Space Grotesk, Bricolage Grotesque, Be Vietnam Pro, Josefin Sans, Gentium Plus, any grotesque, any sharp geometric, any book serif

## Type Scale
Six roles, defined once as utilities in `frontend/app/globals.css` 
(`.t-display .t-title .t-section .t-card .t-body .t-meta`). Each 
step is at least 1.25x the one below it so every page has a dominant element.

- Hero display: clamp(38px, 6vw, 68px), Baloo 2 800, line-height 1.05. One rose phrase (color, not italic), once per page
- Page h1: clamp(32px, 4vw, 44px), Baloo 2 800, deep plum
- Section h2: clamp(24px, 2.6vw, 33px), Baloo 2 700, **magenta**, sitting on a lavender ribbon that bleeds to the container's left edge and rounds on the right (the bulletin band). Not a heading with a hairline under it
- Card and row titles: 20px, Baloo 2 700; magenta on cards
- Date numerals on event rows: ~26px, Baloo 2 800, deep plum on a 35% lavender block
- Prose: 17px, Nunito 400, line-height 1.7; deep plum on the field, mauve on cards
- Labels / badges / metadata: 12px, Nunito 800, uppercase, letter-spacing 0.1em, mauve
- Nav links: 15px, Nunito 700, deep plum on the lavender bar, fully rounded pills; active is a solid magenta pill. The bar holds the brand, five links, the switcher, Connect and the account controls; social icons only from xl; nothing wraps

## Layout
- One job per page. Home = hero + announcements + upcoming events (as rows) + recent photos + past events.
- Glanceable: full page understood in one look, no scrolling required to grasp structure
- Generous negative space. Space separates sections, not background color changes - except the two brand bands that frame the page (plum hero at the top, magenta closing band at the bottom)
- Max width: 760px single-column, 960px two-column
- One language per page. English pages are entirely English, Vietnamese pages entirely Vietnamese; every public string is a message key and the nav switcher is the only bridge. Never mix the two in one line or under one heading
- Cards are for posts: white body with a 35% lavender header strip (badge + dates), magenta title, mauve body - three brand tones per card and nothing close to black. Prose pages (About, Connect) are flat sections on the field with a magenta heading and the brand rule; empty states are a 35% lavender panel, never a dashed box
- Card borders: 1px lavender at 60% opacity. Cards rest on a two-layer magenta-tinted shadow (`0 1px 2px rgba(142,29,95,.06), 0 8px 24px -8px rgba(142,29,95,.16)`) and rise 3px into a larger one on hover (`0 2px 4px rgba(142,29,95,.08), 0 18px 40px -10px rgba(142,29,95,.24)`). Panels and section blocks stay flat, so elevation still means "this is a discrete object"
- Border radius: 14px cards, 8px buttons, 10px date blocks, 20px badge pills - not uniform everywhere
- The arch (rounded-t-full on a 3:4 frame) is the site's one non-rectangle shape, used only for the homepage photo strip
- Feeds enter with a 70ms stagger (`.stagger-children`); disabled under reduced motion

## Hero Spec
- Background: #2C1323 (plum ink). Optional admin-uploaded video sits under a 60% plum scrim
- Left-aligned content column (max 40rem) inside the 6xl page width; radial rose glow top-right at 24% so text and glow balance asymmetrically. Nothing centered
- Bottom gradient rule: linear-gradient(90deg, transparent, #DE718E, #8E1D5F, transparent) at 60% opacity, 3px tall - the logo's own gradient order, rose first
- No photography unless the admin uploads a hero video. Type does the work
- Content order: eyebrow label (uppercase rose, "VGOMNE · Saugus, MA") → Bricolage display line in the page's language with the one italic rose phrase → one-sentence description at 85% white → service time and address line (only once the Connect page has real values) → two buttons (primary: magenta fill, secondary: ghost white border)
- All copy comes from `messages/{en,vi}.json` under `Home`; nothing is hardcoded in the page

## Hard Avoids
- No navy blue anywhere - old palette, fully removed. No terracotta, sage, gold or cream either - the palette before this one
- No pure #000000 or #FFFFFF as the page background; white is for cards
- No gray borders or gray text - every neutral is tinted toward magenta
- No black or near-black text anywhere except the hero band; prose is deep plum on the field and mauve on cards
- No sharp terminals: every typeface on the site has soft, rounded curves
- No muted text on full-strength lavender, and no rose text smaller than headline size on white
- No more than one accent hue at equal visual weight per page; section headings are magenta everywhere, not one color per section
- No shadows on anything that is not a card - alerts, section blocks, panels and inline panels stay flat
- No gradients except the brand rule (hero foot, section headers, closing-band edge) and the hero glow
- No side-stripe borders (border-left > 1px) as a colored accent on cards or panels
- No section background color changes to separate content - use space; the only bands are the hero and the closing band
- No blue on any interactive element - failure if it appears
- No icon grids (3-4 boxes in a row with icon + text)
- No hero → three-column grid → testimonial → CTA strip layout
- No cards wrapping everything - use rules and whitespace when containment isn't needed
- No Inter, Roboto, Lora, Playfair, DM Sans, Space Grotesk, Bricolage Grotesque or Be Vietnam Pro - ever; no grotesque as a display face
- Nothing that would be at home in a generic web app: if a type or surface choice cannot be traced to the logo, the paper calendar or the printed bulletin, it is wrong
- No font without a Vietnamese subset
- No hover states that turn blue or gray
- No decorative blobs, gradient meshes, or floating shapes
- No emoji as UI icons (the 📅 is gone); emoji are content, in reactions and the editor only

## Anti-Generic Directive
The final result must not look like a template, an AI-generated site, or any 
other church/nonprofit website. A designer should not be able to identify which 
tool produced it. Intentional asymmetry over centering everything. One dominant 
element per section, everything else defers. Border radius applied with intention, 
not uniformity. Before finalizing any section ask: "Would a Vietnamese-American 
evangelical community of 100 people who share life together recognize themselves 
in this design, or could it belong to any organization on the internet?" If the 
answer is the latter, redesign it. The goal is a design that could only be this church.
