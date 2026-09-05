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

## Streamed Action Modals (Rebuild & Deletion)

- **Architecture:** Use NDJSON streaming from API routes (`/progress`, `/delete-progress`) to drive real-time visual progress.
- **Confirmation:** Destructive actions (e.g. Purge File) must prompt for confirmation in a dedicated phase within the modal before triggering backend unlinking.
- **Stage Stepper:** Consistent 4-to-5 stage stepper:
  - Checkmark in `bg-emerald-500` (or `bg-destructive` for purge completion)
  - Active stage shows spinning ring (`border-2 border-primary border-t-transparent animate-spin`)
  - Pending stage shows dimmed circle (`border border-muted-foreground/30`)
- **Progress Bar & Feed:**
  - Progress bar shows real-time percentage and chunk ratio (`X% • X of Y chunks`)
  - Live feed enclosed in `ScrollArea` with `h-32 border bg-muted/30 p-2 font-mono text-[10px]`
  - Real-time events animated with `motion.div` and sliced to the latest 20 events.
- **Buttons:**
  - Standard action buttons use `size="sm" text-xs`.
  - Destructive triggers use `variant="destructive"` or `variant="outline"` with `text-destructive hover:bg-destructive/10 border-destructive/30`.

## File Sharing & Access Control Design Rules

- **Permission & Privacy Architecture:**
  - Collaborators strictly receive **Read & Download** permissions. Under no circumstances should non-owners have access to delete actions (in UI or backend).
  - Deletion triggers (`Trash2` buttons, Purge dialogs) must be hidden on both main files page and detail pages when `!isOwner`.
  - Collaborators viewing a file detail page see a badge: `Shared with You (Read Only)`.
  - **Access & Sharing Privacy:** Non-owners must NEVER see the list/count of other collaborators or the public stream link status and download stats. The Access & Sharing card for collaborators exclusively shows the Owner info and `Your Access: Read & Download Only`.
  - **Files Separation:** The main Files page (`/dashboard/files`) strictly lists files owned by the user. Files shared with the user reside exclusively in the **Shared with Me** page (`/dashboard/shared`).
- **Shared with Me Page (`/dashboard/shared`):**
  - Dedicated page accessible from sidebar under `Files`.
  - Clean monospace table with sharp corners (`rounded-none`, `border-border`).
  - Columns: File Name (with AES-256 badge), Owner, Size, Chunks, Read Only badge, Shared date, Actions.
  - Actions strictly limited to **Download** (via `FileRebuildModal`) and **Inspect** (link to `/dashboard/files/[fileId]`). No delete button is ever rendered.
  - Empty state matches orbital theme with `Share2` icon and informative copy.
- **File Share Modal (`FileShareModal`):**
  - Triggered from files table and file detail header via `Share2` icon button.
  - Dual-tab design using Shadcn `Tabs` with `rounded-none` borders:
    - **Collaborators Tab:** Quick email input form to grant access, list of collaborators with `Read & Download` badge and owner-only revoke button.
    - **Public Link Tab:** Toggle switch to activate/deactivate link, expiration selector (1h, 24h, 7d, Never) bi-directionally synchronized with server timestamps, copyable link field with one-click copy button, and real-time live download counter.
- **Public Share Portal (`/share/[token]`):**
  - External, unauthenticated portal for link recipients.
  - Branded header with `Satellite` mark and orbital theme.
  - Handles 404 (invalid), 403 (revoked), and 410 (expired) states with clear alert cards.
  - Reconstruct & Download button drives real-time NDJSON stream stepper, on-the-fly AES-256 decryption, and automated browser download.
  - Link Expiry displays readable relative time remaining (e.g. `~24h left`, `~45m left`) with full localized timestamp in tooltip.
  - Download count increments atomically on MongoDB and local in-memory cache upon download start/completion.

## Upload to Constellation Modal Behavior

- **State Persistence:**
  - The modal must never close automatically upon upload completion.
  - When the upload stream finishes (`stage === "complete"`), the UI remains on the completed stepper view showing:
    - All 4 completed stage checkmarks.
    - Green completion banner: `✓ Upload Complete — Constellation Synchronized`.
    - Live feed log showing the chunk distribution history.
- **Actions (`DialogFooter`):**
  - **Upload Another:** Resets state back to the pre-upload drop zone and allows uploading another file.
  - **Close:** Dismisses the modal and resets the state.
  - During active upload, modal dismissal is prevented and a disabled `Distributing Chunks...` indicator with `Loader2` is shown.

## General Rules

1. Never use external colors or hardcoded hex values — always use CSS variables
2. Never use Tailwind arbitrary values for colors (e.g. `text-[#aaa]`)
3. All interactive elements must have hover/focus states
4. Micro-animations via `motion/react` where appropriate (already used in dashboard)
5. Toasts via `sonner` for success/error feedback (already wired globally)

