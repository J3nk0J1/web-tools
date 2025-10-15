# Web Tools Package Review

## 1. Project overview
- **Offline-first dashboard** (`index.html`) provides quick access to each tool with a consistent Material-inspired theme and global warning banner.
- Styling lives in a single global stylesheet (`css/styles.css`), with components (app bar, cards, panels, form controls) reused across tools.
- `js/app.js` handles shared behavior (theme toggling and ripple effect) that is imported by each tool page.
- Individual tools are located in `tools/<tool-name>/` directories, each with its own HTML entry point and JavaScript module.

## 2. Dashboard assessment (`index.html`)
- Strengths:
  - Uses semantic landmarks (`header`, `main`, `section`, `article`) and accessible card markup with focus outlines.
  - Clear warning notice and consistent navigation affordances.
- Improvement opportunities:
  - Consider splitting long inline comments into template data (e.g., JSON) to make adding new tools easier.
  - Cards rely on keyboard focus but are not activated via Enter/Space—wrapping the whole card in a link could improve usability.

## 3. Shared styling (`css/styles.css`)
- Comprehensive light/dark theme variables and Material-inspired components provide cohesive UX.
- CSS uses `color-mix` and other modern features—ensure graceful fallbacks or document browser support (older browsers may ignore these declarations).
- Utility classes (e.g., `.layout-2col`) are duplicated inline within tool pages; consider centralizing responsive layout helpers.

## 4. Shared behavior (`js/app.js`)
- Immediately-invoked module encapsulates theme persistence and ripple effects.
- Ripple calculation uses `clientX/clientY` and removes nodes via `setTimeout`; consider throttling to avoid DOM accumulation on rapid clicks.
- Suggest exposing theme API (e.g., `window.setTheme`) to allow future tools to synchronize theme changes programmatically.

## 5. Image Resizer tool
- Feature highlights:
  - Drag-and-drop upload, preset sizes, hover-zoom comparison, and format selection with JPEG transparency handling.
  - Uses canvas downscaling with iterative halving to maintain quality.
- Improvement opportunities:
  - `drawZoomAt` mutates the original preview canvas, meaning the “original” view no longer shows the source pixels after zoom; caching the untouched original in a separate canvas would avoid re-rendering artifacts.
  - When `keepAspect` is checked, changing only width or height should adjust the other dimension automatically; currently both inputs can diverge.
  - Provide error messaging within the UI instead of `alert()` to maintain consistent styling.
  - `renderAll` awaits `canvasToBlob` for every input change—consider debouncing or estimating size without generating a blob on each keystroke for performance on large images.

## 6. Metadata Scrubber tool
- Feature highlights:
  - Client-side EXIF/GPS parser for JPEG and PNG text chunk inspection—no network requests required.
  - Canvas re-encoding produces a clean copy and displays size/type badges for both original and scrubbed images.
- Improvement opportunities:
  - Expand EXIF tag coverage (e.g., lens model, exposure bias) and add support for HEIC/WebP metadata blocks.
  - Surface parsing errors inline for compressed PNG text chunks and offer a toggle to keep selected safe fields.
  - Provide progress feedback while large files are processed to reassure users the scrubber is still working.

## 7. Cross-cutting recommendations
- **Project structure**: introduce a build step (e.g., simple static site generator or Eleventy) to generate tool cards from metadata and minimize manual duplication.
- **Testing**: add automated regression tests (e.g., Playwright for UI smoke tests, Vitest/Jest for pure JS utilities).
- **Accessibility**: audit focus order within tool panels—some `div` containers use `tabindex="0"` without keyboard activation semantics.
- **Documentation**: include `README.md` with instructions for running locally (e.g., `npx serve`) and high-level overview of each tool.

## 8. Suggested new tools for the package
1. **PDF Compressor & Splitter**
   - Offline client-side PDF.js based tool to reduce file size via image recompression, split/merge documents, and remove pages.
   - Complements the image workflow and helps staff handle large documents without server access.
2. **Checksum & Integrity Verifier**
   - Offline tool that calculates SHA-256/MD5 hashes for files and compares against provided checksums before distribution.
   - Supports batch processing and copy-to-clipboard summaries for audit trails.
3. **CSV Cleaner & Analyzer**
   - Browser-based CSV validator with type inference, duplicate detection, and quick summary statistics.
   - Useful for preparing datasets before import into internal systems.
4. **Text Redaction Tool**
   - Allows marking sensitive sections in text/PDF exports and produces sanitized copies, supporting compliance workflows.
5. **Timezone & Meeting Planner**
   - Interactive timeline helping teams coordinate across regions (drag handles to compare working hours), leveraging the existing responsive layout components.

## 9. Next steps
- Prioritize shared infrastructure improvements (metadata-driven dashboard, documentation) to make future tools easier to add.
- Prototype the CSV Cleaner tool first—it shares much UI with existing panels and provides broad utility across departments.
- Establish contribution guidelines so future additions maintain consistent UX and accessibility standards.
