# FormFiller V1.0.1 Handover Report

**Date:** June 12, 2026
**Branch:** `main`
**Scope:** Merchant experience hardening: chat continuity and tone, disqualification recovery, exit-intent capture, and persistent session resume.

---

## 1. Summary of Changes

| # | Feature | Commit | Status |
|---|---------|--------|--------|
| 1 | Chat persists across steps + Step 2 confirm guidance | `34c4646` | Pushed |
| 2 | Disqualification recovery + exit-intent prompt | `fa0abda` | Pushed |
| 3 | Per-page chat guidance | `4ca681c` | Pushed |
| 4 | Personable chat tone, em dash removal, larger exit prompt | `1d9a604` | Pushed |
| 5 | Chat drawer stays mounted across sign transition | `f6f95b9` | Pushed |
| 6 | Session persistence / resume flow | (this commit) | Committed today |

---

## 2. Feature Details

### 2.1 Chat Persistence Across Steps + Step 2 Guidance (`34c4646`)

- The chat drawer no longer resets when the merchant advances steps.
- When a merchant who is already chatting reaches Step 2, the AI posts a personalized transition message acknowledging the business details that were found.
- **Files:** `packages/backend/src/services/chatAgent.service.ts`, `packages/frontend/src/components/form/ChatDrawer.tsx`

### 2.2 Disqualification Recovery + Exit-Intent Prompt (`fa0abda`)

**Disqualification recovery**
- Merchants disqualified for insufficient time-in-business can now correct their business start date and requalify.
- `disqualification.service.ts` exports clearable TIB reasons and `clearTimeInBusinessDisqualification`; `formSections.routes.ts` requalifies the application when a corrected start date passes the minimum check.
- The eligibility overlay gained two actions: **"Edit my information"** (returns to Step 2, Business Details) and **"Return to home page"** (tenant website URL).

**Exit-intent prompt**
- A one-time-per-session overlay ("Wait! Did you want to finish your application?") appears when the pointer leaves through the top of the viewport (toward the tab bar / close button) mid-application.
- Suppressed when there is no application yet, after finalization, or while disqualified.

**Files:** `disqualification.service.ts`, `formSections.routes.ts`, `MultiStepForm.tsx`, `disqualification.service.test.ts` (new coverage)

### 2.3 Per-Page Chat Guidance (`4ca681c`)

- The chat posts a static (non-AI, instant, free) guidance message for every page the merchant lands on while the chat is open: Steps 1-5 plus the post-sign bank-statements page.
- Each page is announced once per session; opening the chat mid-application announces the current page immediately.
- The Step 2 AI transition message takes precedence over the static one; never both.
- `submittedAt` is passed through `ChatWidget` so the bank-statements page (not a numbered step) gets its own message.
- **Files:** `ChatDrawer.tsx`, `ChatWidget.tsx`

### 2.4 Personable Tone, Em Dash Removal, Larger Exit Prompt (`1d9a604`)

**Tone**
- All per-page guidance rewritten to be encouraging: "Great start!", "You're doing great!", "Almost there!", "Home stretch!", "You did it!"
- AI system prompt updated to a warm, friendly, encouraging tone with examples; hard style rule added: the AI must never use em or en dashes.

**Em dash removal (platform-wide)**
- Removed from every user-facing string: chat messages and security note, exit-intent copy, bank statement upload headings, Step 2 EIN placeholder, signed PDF header and empty-value placeholder, settings integration copy, opt-out message, AI prompts and guardrails, SMTP/CRM error messages.
- Remaining em dashes exist only in code comments and server console logs (never user-visible).

**Exit prompt sizing**
- Width `max-w-md` to `max-w-2xl`, increased padding, title `text-3xl`/`text-4xl`, larger body and button text.

**Files:** backend `chatAgent.service.ts`, `chatGuardrails.service.ts`, `crm.service.ts`, `email.service.ts`, `pdf.service.ts`; frontend `BankStatementUpload.tsx`, `ChatDrawer.tsx`, `MultiStepForm.tsx`, `Step2ConfirmBusiness.tsx`, `IntegrationSection.tsx`

### 2.5 Chat Drawer Stable Across Sign Transition (`f6f95b9`)

- `MultiStepForm.tsx` was refactored from two separate return branches into a single return tree where the step form and the bank-statements view swap inside it.
- The `ChatWidget` keeps one stable mount position, so the drawer stays open with its transcript intact when the merchant signs and moves to the bank-statements screen.

### 2.6 Session Persistence / Resume Flow (this commit)

**Problem:** the backend saved progress, but the frontend held `applicationId` only in React memory. Closing the tab forced a restart from Step 1.

**Solution (all in `MultiStepForm.tsx`, no backend changes):**
- On application creation, the id is stored in localStorage under a tenant-scoped key: `formfiller_resume_application_<tenant-slug>`.
- On mount, the form checks that key and fetches the draft via the existing guest-accessible `GET /api/applications/:id`. A spinner ("Checking for a saved application...") shows while resolving.
- Full state rehydration: contact, business details, owners, financial, loan request, home-based answers, and the saved step (clamped 1-5).
- If the application is already signed, the merchant resumes directly on the bank-statements upload screen.
- The key is cleared on finalization, or when the stored application is finalized, disqualified, or not found.
- The `ChatWidget` is held back until restore resolves so guidance announces the correct resumed page.

**Tenant safety:** localStorage is per-origin and the key includes the tenant slug; every fetch carries the `x-tenant-slug` header, so backend tenant isolation returns 404 for foreign ids and the form starts fresh.

**Known gap (intentional):** SSN is encrypted server-side and never returned to the browser. It rehydrates empty and remains saved on the backend; the merchant re-enters it only if they revisit and re-submit Owner Details.

---

## 3. Validation Performed

- Backend build: passed
- Frontend build: passed (including final resume-flow build)
- Backend tests: passed (`disqualification.service.test.ts` including new requalification coverage, `chatGuardrails.service.test.ts`)
- Secret scan on staged changes before each commit: 0 hits
- Em dash sweep (`rg` over `packages/frontend/src` and `packages/backend/src`): no user-facing occurrences remain

## 4. No API / Postman Changes

No backend routes, request shapes, or response shapes changed today. `docs/formfiller.postman_collection.json` and `docs/formfiller.postman_environment.json` remain in sync.

## 5. Manual Verification Guide

1. **Resume:** fill through Step 3, close the tab, reopen `/apply`: you land on Step 3 with data intact.
2. **Signed resume:** sign on Step 5, close the tab, reopen: you land on the bank-statements screen.
3. **Chat follow-along:** open the chat on Step 1 and advance: one new assistant message per page, including post-sign.
4. **Sign transition:** keep the chat open and sign: the drawer stays open with its transcript.
5. **Disqualification recovery:** enter a too-recent business start date, click "Edit my information", correct the date: application requalifies.
6. **Exit intent:** mid-application, move the cursor toward the browser tab bar: the prompt appears once per session.
