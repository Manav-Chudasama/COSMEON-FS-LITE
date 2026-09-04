# FS-Lite — Design Consistency Guide

## Theme

- **Font:** IBM Plex Mono for all text (monospace). This is set globally in `globals.css`.
- **Border Radius:** `0rem` (sharp corners everywhere — no rounded corners).
- **Color Palette:** Use only CSS variables defined in `globals.css`. Never hardcode colors.
  - Primary accent: `var(--primary)` (orange `oklch(0.6996 0.202 44.4414)`)
  - Background: `var(--background)`
  - Card: `var(--card)`
  - Muted text: `var(--muted-foreground)`
  - Border: `var(--border)`
  - Destructive: `var(--destructive)` (for errors, delete, sign-out hover)

## Typography

- Labels/headings inside components: `text-[10px]–text-xs`, `uppercase`, `tracking-widest`, `text-muted-foreground`
- Body copy: `text-xs` or `text-sm`
- Page section headings: `text-sm font-bold uppercase tracking-widest`
- Monospace numbers / codes: use `font-mono tracking-[...]`

## Layout Spacing

- Card/section padding: `p-8` (auth pages), `p-4` / `p-6` (dashboard widgets)
- Consistent gap between form fields: `space-y-4`
- Consistent label-to-input gap: `space-y-1.5`

## Components

- Always use Shadcn UI components (Button, Input, Label, Dialog, etc.)
- Never create custom form inputs from scratch
- Use `size="sm"` for dashboard-level buttons, `text-xs` for button text
- Icons: always `h-3.5 w-3.5` for small inline icons, `h-4 w-4` for sidebar/nav icons

## Auth Pages (`/login`, `/register`, `/forgot-password`, `/reset-password`)

- Layout: full-screen centered, dark grid background, FS-Lite brand mark at top
- Card: `border border-border bg-card p-8`, no shadow, 0rem radius
- Section heading: `text-sm font-bold uppercase tracking-widest`
- Sub-heading: `text-[11px] text-muted-foreground mt-1`
- Footer links: `text-[11px] text-muted-foreground`, primary links: `text-primary hover:underline`
- Loading state: show `<Loader2 className="h-3.5 w-3.5 animate-spin" />` in button
- Two-Step Verification Flow (Login & Register):
  - Step 1: Credentials / Details inputs
  - Step 2: 6-digit OTP entry with `font-mono text-sm font-bold tracking-[0.4em] text-center`
  - Resend action: button with cooldown or inline link
  - Back navigation: `← Back` button allows switching back to step 1

## Dashboard Sidebar

- User profile box: `border border-border p-3`, user icon circle in `bg-primary/10 text-primary`
- Name: `text-[11px] font-medium`, email: `text-[10px] text-muted-foreground`
- Sign out button: `text-muted-foreground hover:text-destructive`
- Theme toggle and sign out are in `SidebarFooter` with `space-y-3`

## Responsive Design

- All pages must be mobile-responsive
- Auth card: `max-w-sm w-full`
- Dashboard: uses sidebar collapse via `SidebarProvider` (already responsive)
- Table cells: use `max-w-[200px] sm:max-w-[350px]` with `truncate` for long filenames

## General Rules

1. Never use external colors or hardcoded hex values — always use CSS variables
2. Never use Tailwind arbitrary values for colors (e.g. `text-[#aaa]`)
3. All interactive elements must have hover/focus states
4. Micro-animations via `motion/react` where appropriate (already used in dashboard)
5. Toasts via `sonner` for success/error feedback (already wired globally)
