# 🎨 Design System: RAG Asisten Pembaca Dokumen

## Overview

The Asisten Pembaca Dokumen interface is designed with **"Intelligent Clarity."** It acts as a quiet, hyper-focused reading room that prioritizes text legibility and document analysis. The base canvas is a **cool, clean slate** (`{colors.canvas}` — #f8fafc) providing a crisp contrast to the pure white sidebar and chat bubbles. 

The primary brand voltage is **Intelligence Indigo** (`{colors.primary}` — #4338ca), used strictly for primary actions (Upload, Send) and system highlights. To distinguish between application UI and document content, the system employs a dual-typeface strategy: a clean Sans-serif for the interface, and a highly legible Serif for AI-generated document summaries and direct quotes.

The system's strongest visual signature is the **Citation Palette**: four distinct, muted pastel pills (Ruby for PDF, Azure for DOCX, Emerald for XLSX, Amber for PPTX) that ground the AI's responses in factual reality, ensuring the user always knows exactly where the information came from.

**Key Characteristics:**
- Cool slate canvas (#f8fafc) paired with pure white (#ffffff) content surfaces.
- Single CTA color: `{colors.primary}` (Indigo #4338ca) for absolute clarity.
- Dual-typography: Sans-serif (UI/Navigation) and Serif (Long-form reading/AI responses).
- File-type citation pastels: 4 dedicated tokens for source tracking (`[Sumber: ...]`).
- Generous line-heights and whitespace to prevent cognitive overload during reading.
- Soft elevation (drop shadows) strictly reserved for the active chat input and floating AI bubbles.

## Colors

### Brand & Accent
- **Intelligence Indigo** (`{colors.primary}` — #4338ca): Primary CTAs, send button, active states.
- **Indigo Active** (`{colors.primary-active}` — #3730a3): Press/Hover state.

### Surface
- **Canvas** (`{colors.canvas}` — #f8fafc): The main background floor (chat area).
- **Surface Sidebar** (`{colors.surface-sidebar}` — #ffffff): Pure white left panel for file management.
- **Surface User Bubble** (`{colors.surface-user}` — #e0e7ff): Very light indigo for user messages.
- **Surface AI Bubble** (`{colors.surface-ai}` — #ffffff): Pure white for AI responses.

### Hairlines (Borders)
- **Hairline** (`{colors.hairline}` — #e2e8f0): Default 1px divider (sidebar right border, header bottom).
- **Hairline Soft** (`{colors.hairline-soft}` — #f1f5f9): Internal list dividers.

### Text
- **Ink** (`{colors.ink}` — #0f172a): Primary reading text, headers. Deep slate.
- **Body** (`{colors.body}` — #334155): Default running-text inside chat bubbles.
- **Muted** (`{colors.muted}` — #64748b): Sub-titles, placeholder text, file sizes.
- **On Primary** (`{colors.on-primary}` — #ffffff): White text on Indigo buttons.

### Citation & File Tokens (The Trust Signature)
- **PDF Pill** (`{colors.cite-pdf}` — #fee2e2): Pastel ruby background, `#991b1b` text.
- **DOCX Pill** (`{colors.cite-docx}` — #e0f2fe): Pastel azure background, `#075985` text.
- **XLSX Pill** (`{colors.cite-xlsx}` — #dcfce7): Pastel emerald background, `#166534` text.
- **PPTX Pill** (`{colors.cite-pptx}` — #ffedd5): Pastel amber background, `#9a3412` text.

### Semantic
- **Success** (`{colors.semantic-success}` — #10b981): File upload complete.
- **Error** (`{colors.semantic-error}` — #ef4444): Zlib extraction failure or API timeout.

## Typography

### Font Family
**Inter** (or `system-ui`) is the primary Sans-serif for all UI elements (buttons, sidebar, headers).
**Merriweather** (or `Georgia`, `ui-serif`) is the secondary Serif family strictly reserved for the AI's long-form answers and quoted document contexts.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display-lg}` | 24px | 700 | 1.2 | App Header Title |
| `{typography.title-md}` | 16px | 600 | 1.4 | Sidebar section titles |
| `{typography.body-ui}` | 14px | 400 | 1.5 | Sidebar file names, buttons |
| `{typography.body-chat}` | 15px | 400 | 1.7 | AI Serif text (high legibility) |
| `{typography.body-user}` | 15px | 500 | 1.5 | User Sans-serif text |
| `{typography.caption}` | 12px | 400 | 1.4 | Timestamps, empty states |
| `{typography.citation}` | 11px | 600 | 1.2 | `[Sumber: file.pdf]` pill text |

### Principles
- **Readability is king.** The AI response (`{typography.body-chat}`) uses a 1.7 line height to prevent eye strain when reading long legal documents or academic journals.
- **Clear distinction.** User asks in Sans-serif, AI answers in Serif. This mimics a human asking a system to "read a book."

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.base}` 16px · `{spacing.md}` 24px · `{spacing.lg}` 32px · `{spacing.xl}` 48px.

### Grid & Container
- **Sidebar:** Fixed 320px width on desktop.
- **Main Chat:** Fluid width, but chat bubbles are capped at `max-width: 800px` to maintain optimal line lengths for reading.
- **Input Area:** Fixed at the bottom, centered relative to the main chat area.

## Elevation & Depth

The system uses a flat approach for layout panes, but introduces soft shadows (`box-shadow`) to emphasize interaction layers.

| Level | Treatment | Use |
|---|---|---|
| Flat | `{colors.canvas}` | Background page floor |
| Flat Outline | 1px `{colors.hairline}` | Sidebar, inactive text inputs |
| Soft Float | `shadow-sm` (0 1px 2px rgba(0,0,0,0.05)) | AI Chat Bubbles, uploaded file cards |
| Action Float | `shadow-md` (0 4px 6px rgba(0,0,0,0.1)) | The main chat input bar at the bottom |

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.sm}` | 4px | Internal file icons, scrollbars |
| `{rounded.md}` | 8px | Upload zones, CTA buttons |
| `{rounded.lg}` | 12px | Chat input bar |
| `{rounded.xl}` | 16px | User & AI Chat Bubbles |
| `{rounded.pill}` | 9999px | Citation sources `[Sumber: ...]` |

## Components

### Chat Interface

**`bubble-user`** — Background `{colors.surface-user}`, text `{colors.ink}`, type `{typography.body-user}` (Sans), rounded `{rounded.xl}` with a sharper bottom-right corner. Aligned right.

**`bubble-ai`** — Background `{colors.surface-ai}`, text `{colors.ink}`, type `{typography.body-chat}` (Serif), rounded `{rounded.xl}` with a sharper bottom-left corner. Aligned left. Has `shadow-sm`.

**`chat-input-bar`** — Background `{colors.surface-sidebar}`, rounded `{rounded.lg}`, `shadow-md`, padding 12px × 16px. Contains the text input and the Indigo send button.

### Citations (The Core Feature)

**`citation-pill`** — Inline tag embedded at the end of AI sentences. Varies by file extension. Padding 2px × 8px, type `{typography.citation}`. Example: If PDF, uses `{colors.cite-pdf}`. 

### Sidebar & File Management

**`upload-zone`** — Dashed 2px `{colors.hairline}` border, background transparent, rounded `{rounded.md}`. Hover state fills with `{colors.canvas}`.

**`file-list-item`** — Flex container. Background `{colors.surface-sidebar}`, 1px `{colors.hairline-soft}` border bottom. Contains file icon, truncated file name `{typography.body-ui}`, and a delete (❌) button on hover.

**`button-primary`** — Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.body-ui}` (Weight 600), rounded `{rounded.md}`, padding 10px × 16px.

## Do's and Don'ts

### Do
- Constrain AI chat bubbles to ~800px wide. Text stretching across a 1080p monitor is unreadable.
- Always render `[Sumber: nama_file.ext]` as a distinct, colored pill to build trust.
- Ensure the Chat Input Bar stays fixed at the bottom of the screen while the chat list scrolls behind it.
- Keep the sidebar pure white to contrast with the slightly cool chat canvas.

### Don't
- Don't use Serif fonts for the UI (buttons, file names). Keep Serif strictly for the document's content/AI response.
- Don't use bright, neon colors for citations. They should be pastel so they don't distract from the reading experience.
- Don't clutter the AI bubbles with complex markdown unless requested (e.g., tables are okay, but avoid heavy blockquotes within blockquotes).

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Sidebar disappears behind a hamburger menu (off-canvas drawer). Chat input loses side margins. |
| Desktop| >= 768px | Sidebar is permanently fixed on the left (320px). |

### Iteration Guide

1. Build the layout skeleton first (Sidebar + Main Chat flexbox).
2. Establish the Typography scale before styling the chat bubbles. The AI's Serif font sizing is the most critical metric.
3. Map the citation pills dynamically in React based on the `.ext` of the string returned by FastAPI.
4. Add auto-scroll to bottom logic when the AI is streaming its response.

## Known Gaps

- Streaming animation state (loading dots) before the first token arrives from Gemini.
- Handling of very long file names in the sidebar (requires CSS text-truncation/ellipsis).
- Dark mode inversion is currently out of scope (requires mapping a new set of slate/indigo tokens).