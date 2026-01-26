Absolutely. Here’s the **concrete, “nothing left out” final plan**, combining:

* your original backlog (the canonical list)
* decisions made since (extension fully removed; routing deferred as soft solution)
* issues found during refactor (Replace All Images breaks rect↔tile mappings; import versioning consideration; hot-reload idea parked but included)
* anything we’ve already completed (so it’s not accidentally re-done)

This is designed so we can work through it **in strict succession**, with clear dependencies.

---

# Final Plan — Supercheap Auto Catalogue Link Builder

## 0) Completed foundation work

These are **done** and should not be re-opened unless regressions appear.

### 0.1 Complexity reduction & stability (Phases A–E + E6)

* Extracted UI components: header, tile list panel/view, tile details, tile builder, matches preview, dev panel, dataset menu/dialogs.
* Extracted logic into hooks/services:

  * `useProjectDataset`, `useTileMatches`, `useTileSelection`, `useTileBuilder`
  * `useTileDraftState`, `useGlobalShortcuts`, `useCatalogueActions`
  * `projectFilesService`, `previewService`
* Fixed TS implicit-any compile issues created by extraction.
* Removed Chrome extension path entirely; app is now **vanilla-only**.

✅ Outcome: CatalogueBuilderPage is now an orchestrator, safe to iterate on.

### 0.2 Phase 1 quick wins (from original list)

* Remove extension installed/not installed UI callout → **done via removal**
* Hide “Facet Columns Detected” callout → **dev-only debug panel**
* Default mode when no PLUs detected (avoid PLU-mode dead-end) → **done**

---

# 1) Core workflow correctness & safety

These are “must be correct” because they can destroy work or block testing.

## 1.1 Replace All Images semantics (new issue found)

**Problem:** Replace All Images currently breaks rect↔tile mappings (tiles show “Missing”).

**Required implementation:**

* Replace All Images must preserve tile identity + rect mappings when filenames/keys match.
* Must detect:

  * existing tiles (match by stable `tileKey`/filename normalised) → update blob only
  * new images not previously present → create new tiles (Missing until matched)
* Must NOT overwrite link builder state or status/notes.
* Must flag tiles whose image changed:

  * show a non-destructive indicator like “Image updated — re-extract recommended”
  * re-extraction must remain explicit (never mass overwrite silently)

**Plus required extras (also must be done):**

* Per-tile “Replace image” action:

  * preserve mapping + state
  * optional prompt to re-extract tile only
* Add new tiles from a subset of images (not only “replace all”):

  * simple workflow: “Add Images” to create new tiles

## 1.2 Import/Export schema versioning (new requirement)

Import currently works for testing but must be made robust.

**Required implementation:**

* Add `schemaVersion` to export payload.
* Implement `migrateImport(version)`:

  * fill defaults for new fields
  * ignore unknown fields
  * keep older exports usable indefinitely
* Add a non-scary error message if import mismatches.

## 1.3 Preview & linking “vanilla” hardening

Extension is gone; fallback is primary. Make this the best path.

**Required implementation:**

* Ensure Open Preview reuses the same window/tab reliably (where possible).
* Ensure Link via Preview fallback flow is robust and obvious:

  * clear UI state when “awaiting manual link”
  * prevent accidental overwrites if user pastes wrong URL
  * success confirmation/indicator

**Included future idea (must have a slot):**

* “Warm Preview / hot reload” toggle (parked)

  * debounced, commit-triggered (blur/enter/apply), not keystrokes
  * revisit after confidence/auditing reduces previews

---

# 2) Structural clarity & “Projects” UX

Routing is **not** happening right now, but the UX must still feel like Projects → Builder.

## 2.1 Soft Projects separation (routing deferred but UX fixed)

**Required implementation:**

* Add a Projects index view (cards list) accessible anytime.
* Add “Back to Projects” from Builder.
* Allow switching projects from Projects view, not hidden behind empty-state.
* Keep detection/builder as views inside a project, but don’t require real routing yet.

## 2.2 Full routing (deferred, still required later)

**Required implementation (later):**

* Real routes:

  * `/projects`
  * `/project/:id/builder`
  * `/project/:id/detect`
* Ensure deep links work and state loads deterministically.

---

# 3) Trust, validation & reducing previews

This is the “replace previews with confidence” pillar.

## 3.1 UI auditing & data-driven callouts (must be systematic)

**Required implementation:**

* Central “audit rules engine” that evaluates each tile and outputs:

  * warnings (soft)
  * errors (action needed)
  * confidence signals
* Must include:

  * % off mismatch between tile detection and dataset
  * PLU not in dataset
  * facet yields zero matches
  * tile has no mapping to rect
  * tile has no link output
  * suspicious range offers / multi-% scenarios
* Must surface:

  * per-tile callouts in Tile Details
  * optional summary counts in tile list

## 3.2 Status system overhaul (flow-based)

**Required implementation:**

* Status becomes a guided flow, not a passive dropdown.
* Must integrate with auditing:

  * “Needs Review” if warnings exist
  * “Blocked” if errors exist
  * “Validated” when checks pass
* Must support batch workflows:

  * “Mark validated” for safe tiles
  * “Show next issue” navigation

## 3.3 Confidence/matrix model for range offers

**Required implementation:**

* Use extracted PDF text + detected words to suggest facet refinements:

  * highlight likely Article Types
  * show rationale (“matched words: …”)
  * no silent auto-apply
* A confidence score that pairs with auditing:

  * e.g. “High confidence link (brand+facet match + clean % match)”

---

# 4) Non-offer tile recognition & alternate workflows

These tiles should not be forced through promo dataset logic.

## 4.1 Non-offer classification (must be robust)

**Required implementation:**
Rules-based classification of tiles like:

* T&Cs
* Club rewards
* Services
* Trade site
* spend/get credit
* “shop by brand” tiles that aren’t promo-product lists

**Outputs:**

* classification label
* recommended link template (where applicable)
* different validation rules
* different default status flow

## 4.2 Live Linker (still required, but depends on clarity/auditing)

**Required implementation:**

* Make Live Link mode fully functional within vanilla workflow.
* Capture → parse → apply to builder state reliably.
* Must not become “another half-mode”.

---

# 5) Tile list overhaul (power-user scaling)

This is high-pain/high-visibility and needed for 300+ tiles.

## 5.1 Naming improvements

**Required implementation:**

* Convert filenames like `wk30au-p02-box02-small` to `Page 2 Box 2` for list display.
* Keep original filename visible somewhere (tooltip/details).

## 5.2 Search + filtering + sorting

**Required implementation:**

* Search by: page/box, filename, brand, PLU, % off, status, link mode, audit flags.
* Filters:

  * Missing rect mapping
  * Has warnings/errors
  * Status
  * Link type/mode
* Must be performant (virtualize if needed).

## 5.3 Fixed height + scroll + usability

**Required implementation:**

* Tile list becomes fixed-height scrollable panel (avoid giant page).
* Sticky list toolbar (search/filter always visible).

---

# 6) Offer parsing accuracy improvements

These are correctness improvements and fold into auditing.

## 6.1 Multi-% detection robustness

**Required implementation:**

* Detect multiple discount values in one tile
* Ensure comparisons/validation logic remains sane
* Surface callouts when ambiguous

## 6.2 Title/brand extraction incremental improvements

**Required implementation:**

* Improve brand extraction (multi-brand tiles)
* Avoid false positives
* Don’t break deterministic behaviour

---

# 7) Dataset coverage gaps

This is the expansion bucket.

## 7.1 Everyday price tiles not in promo dataset

**Required implementation (later):**

* Decide strategy:

  * secondary dataset for whole website
  * “unverified” workflow + warnings
  * limited search by PLU (if you have full export)
* Must integrate with auditing/status.

---

# 8) Preview performance & optional “Warm Preview” mode

You asked to park it; it still belongs in the plan.

## 8.1 Incremental preview improvements

**Required implementation:**

* Reduce unnecessary preview launches via confidence/auditing.
* Improve window reuse reliability.

## 8.2 Warm Preview toggle (parked)

**Required implementation (later):**

* Debounced navigation to latest computed preview URL
* Trigger on commit-like events (blur/apply/enter)
* Clear UX indicator and easy disable

---

## Execution order (the “successive” path)

This is the order we will implement in, without skipping items:

1. **1.1 Replace All Images semantics + per-tile replace + add tiles**
2. **1.2 Import/Export schema versioning**
3. **1.3 Vanilla preview/linking hardening**
4. **2.1 Soft Projects separation**
5. **3.1 Auditing engine + callouts**
6. **3.2 Status flow overhaul**
7. **4.1 Non-offer classification**
8. **5.1–5.3 Tile list overhaul**
9. **3.3 Confidence/matrix recommendations**
10. **6.1–6.2 Parsing accuracy (multi-% etc.)**
11. **4.2 Live Linker fully wired**
12. **7.1 Everyday-price dataset strategy**
13. **2.2 Full routing**
14. **8.1 Preview performance**
15. **8.2 Warm Preview toggle**

Everything from the original list **and** everything found since has a slot.

---

## Where we are starting now

Per the plan, the next concrete dev work is:

### Step 1: Replace All Images semantics (preserve mappings)

…and because this is currently breaking your ability to test without rematching, it’s the right first item.

When you’re ready, I’ll generate the Codex prompts for **1.1** in a tight, low-risk sequence:

* instrument current mapping keys
* implement stable key matching (tileKey)
* preserve rect mappings + state
* add “new images create new tiles”
* per-tile replace

Results:
- PDF Detection Config - 14minutes (7 Mins per person/2)



1st Live Catalogue Test Notes -
- Need better recognition fo which Rect is which for matching
- Need to remove image drag on Match tiles
- In-UI Hotkey/Hotclick helpers
- Previous page button doesn't work
- Duplicated 'No Dataset loaded for this project' component in builder/preview
- Need a delete single tile function
- Need an 'indicate no link' function
- Remove mismatch % still includes items that are No % - needs review
- Doesn't appear that Brand is pre-filling into Brand facet
- We can likely improve the PLU conversion link process by auto-excluding any item that is already linked in another offer
- Consider possibility that the exclusion COULD auto select Article Type, instead of being JUST for refining a PLU link
- Need a system that prompts to switch to PLU link mode once Exclusions begin to apply as Facet link will no longer be valid choice
- Dual Brand Detection is not feeding into Article Type selection correctly - Example: wk30au-p25-box03-wide
Calibre + SCA Glass Repellant
Only detects ATs for Calibre, first brand
- Need to be able to handle situations where only Article type is needed - example:
wk30au-p29-box01-wide
20% Off - LICENSED FLOOR MATS & MUDFLAPS Excludes clearance.
To identify the brands included in this offer, a fast flow would be - see all under Article Type, Floor Mats/Mudflaps, refine from there. Cannot do this because Article Type is gated behind Brand facet
- Auto article detect example: SCA Boot Mats - Brand is SCA, Article Type is Boot Mats. Good candidate for test
- wk30au-p31-box01-big was pre-filled with a link, but the Image itself does not contain any PLUs. No change was made to this link before reaching it. Could this indicate a 'leak' of data between projects (as this offer has been linked in other Project tests)
- As linking goes further down the list, it seems images pulled from the SCA website are taking longer to load. Unsure of cause - but we may want to consider 'pre-loading' in a way that balances overall performance, versus avoiding 'dead time' waiting to see the image for a comparison to tile image
- Typing article types are retained after closure of the dropdown. This requires backspacing to then see the 'full list'. Small issue but tripped up on it a couple of times
- Autofilling Catalog excludes change to Brand Path dropdown as one is gated behind the other; need to adjust so both are accessible (Clear option OR simply have the last-selected be the one used, auto-clearing the other selection (more ideal))
- wk30au-p39-box01-wide
25% off Big Brand Suspension Solutions
Good example of offer that is in SPO inclusions but EXCLUDED from the Catalogue out now page; would be linked via Suspension subcat. Either need a way to handle via the Builder or this would be a Live Link candidate
Everyday Price and NEW - Not in Adpack data
This detects the PLU successfully, and displays the image successfully due to cross-site PLU link structure. It would be possible to pull Brand and rough Name from the URL as well; eg https://staging.supercheapauto.com.au/p/penrite-penrite-10-tenths-racing-15-engine-oil---15w-50-5-litre/723897.html - Brand comes first - then a Normalised version of the Name from the URL slug
- Potential for Data Grab Bookmarklet to be used and brought back into the ap to 'supplement' data file