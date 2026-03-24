## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, mcp
- **Framework**: SvelteKit (Svelte 5 with runes)
- **Entry point**: `src/routes/+page.svelte` — single-page site, all markup and styles in one file

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

## Design Rules

- Only use colors from the commented color palette in `src/routes/+page.svelte` for any UI work.
- `filter: saturate(1.5)` is applied to the body — all colors appear more vivid than their hex values suggest. Account for this when picking colors.
- A tileable rock texture (`/images/tile.webp`) is overlaid on all content sections via `::after` pseudo-elements at low opacity with `mix-blend-mode: overlay`. New sections need to be added to the texture selector list in the `<style>` block.
- Rock strata SVG dividers separate sections. Each strata's `background` must match the section above it, and its polygon `fill` colors must transition into the section below.

## Page Structure (top to bottom)

1. **Hero** (`.hero-wrap` inside `.top-bg`, bg `#4b4840`) — hero image with `#BEEST` title overlay, typewriter subtitle, and a jagged rock-edge SVG strata at the bottom
2. **Sticker CTA** (`.sticker-cta` inside `.top-bg`) — sticker image, RSVP text, RSVP box with email input
3. **Gear divider** — row of rotating SVG gears (inner circle fill must match parent bg)
4. **Rock strata** `#4b4840` → `#786e5c`
5. **"What is this?"** (`.what-is-this`, bg `#786e5c`)
6. **Rock strata** `#786e5c` → `#56494a`
7. **Strandbeest diagram** (`.sticker-bg`, bg `#56494a`) — animated GIF with scroll-triggered callout annotations
8. **Gear divider** (inner circle fill `#56494a`)
9. **Rock strata** `#56494a` → `#635a4e`
10. **Info section** (`.info-bg`, bg `#635a4e`) — two-column "Am I Eligible?" / "I can't make it"
11. **Rock strata** `#635a4e` → `#47453f`
12. **Carousel** (`.carousel-section`, bg `#47453f`) — two counter-rotating shop item carousels
13. **"Is Hack Club for real?"** (`.hackclub-section`, bg `#47453f`) — two-column text + cycling photo stack
14. **Rock strata** `#47453f` → `#6c6659`
15. **Bottom RSVP** (`.bottom-rsvp`, bg `#6c6659`)
16. **Rock strata** `#6c6659` → `#000`
17. **Footer** (`.site-footer`, bg `#000`)

## Key Patterns

- **Decorative pipes**: Absolutely positioned inside `.page-wrap` (which wraps sections 1–13). Percentage-based `top` values spread them down the full page height.
- **Gear dividers**: 11 SVG gears with alternating rotation driven by `scrollY`. Inner circle `fill` must match the parent section's background color.
- **Scroll-driven animations**: `scrollY` state drives gear rotation, callout annotations (via `IntersectionObserver` + scroll progress), and hero text fade-out.
- **Typewriter effect**: Subtitle types out on mount with random timing variation and pauses at commas.
- **Photo stack**: Cycles through images in `/images/frames/` every 3 seconds with caption.

## Static Assets

- `/images/hero.webp` — hero illustration
- `/images/sticker.png` — beest sticker
- `/images/beest.gif` — strandbeest animation
- `/images/tile.webp` — tileable rock texture (converted from tile.png)
- `/images/frames/*.png` — Hack Club event photos (used in cycling photo stack)
- `/images/shop/*.webp` — shop/prize item images
