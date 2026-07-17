# Maneesha Mohan — Portfolio

A static portfolio website for Maneesha Mohan N (publication / multi-disciplinary
designer), built from the Figma design. Dark theme, chartreuse (`#f2ff00`) accent,
grotesque display type.

## Pages
- `index.html` — Home (hero, intro, portrait, socials)
- `about.html` — Bio, experience, education, certification, tools bar chart
- `projects.html` — Interactive carousel of 8 projects
- `project.html?id=<id>` — Project case-study detail (data-driven)
- `contact.html` — Contact details + legal notice

## Structure
- `css/style.css` — all styling (CSS variables, responsive)
- `js/data.js` — projects + profile content (single source of truth)
- `js/main.js` — nav state, carousel, detail rendering
- `assets/img/` — images extracted from the source Figma PDF

## Run locally
No build step. Serve the folder with any static server, e.g.:

```bash
python3 -m http.server 4599
# then open http://localhost:4599
```

## Editing content
Add or change a project by editing the `PROJECTS` array in `js/data.js`
(no HTML changes needed — the carousel and detail pages read from it).
Profile / contact details live in `PROFILE` in the same file and in the
respective HTML pages.

## Notes / placeholders
- Social links (LinkedIn / Behance) point to the platform home pages — swap in
  the real profile URLs.
- Some "Full Report" links use the company home page where the exact PDF URL
  wasn't confirmed (e.g. Maruti Suzuki, SBI).
