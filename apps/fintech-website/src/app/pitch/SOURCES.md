# Pitch sources

Source notes for the two quantitative slides. Figures are first-party or
directly recorded from first-party pages. No figures are invented.

---

## Slide 1 — Video opening (500,000+ designers)

### Claim: 500,000+ designers already animate for the web

**Primary source:**
Lottielab homepage, retrieved September 23, 2026
https://www.lottielab.com/

> "Trusted by 500,000+ designers, from the world's most innovative companies."

**Scope:** Lottielab platform registrations. The claim describes designers
who use Lottie animation tooling, not a universal count of all web animators.

---

## Slide 3 — Motion complexity metric (6 hours)

### Claim: Recreating one simple web animation took six hours

**Primary source:**
Intercom × Rive case study
https://rive.app/blog/intercom-s-product-animation-evolution-embracing-rive

The case study reports that a contractor reproduced a simpler Intercom
animation in Rive in six hours. It also reports that four additional
animations went live within 24 hours, compared with the usual week.

**Scope and caveats:**
This is a named Intercom case study, not an industry average or universal
minimum. The pitch presents the specific case without generalizing the figure.

---

## Slide 1 (superseded) — Vibe coding scale (60M+ projects)

### Claim: 60 million+ projects created on Lovable since November 2024

**Primary source:**
Lovable Series C announcement, August 12, 2026
https://lovable.dev/blog/series-c

> "Since Lovable's launch in November 2024, people have created more than
> 60 million projects, and Lovable-built apps see over 900 million visits
> every month."

**Supporting source:**
Lovable LinkedIn post, July 30, 2026
https://www.linkedin.com/posts/lovable-dev_a-few-numbers-from-our-community-50m-projects-activity-7488651350336110592-ANjp

> "50M projects created. 1M new projects every week."

The 50M figure (July 30) growing to 60M+ (August 12) is internally consistent.

### Claim: ~100 per minute

**Derivation:**
1,000,000 new projects / week
÷ 7 days
÷ 24 hours
÷ 60 minutes
= 99.2 per minute → stated as "about 100 every minute"

### Scope limitation

These figures describe the Lovable platform only. No universal cross-platform
total for vibe-coded projects exists from a first-party source as of
September 2026. The slide identifies the source as Lovable.

---

## Slide 2 — Animation tools gap (33M installs / week)

### Claim: 33 million weekly installs of framer-motion on npm

**Primary source:**
npmjs.com/package/framer-motion
Retrieved September 22, 2026
Recorded value: **33,620,514 weekly downloads**

### Scope and caveats

- This is an npm install count, not a count of unique developers or teams.
- Many downloads come from CI/CD pipelines and automated environments.
- `framer-motion` and `motion` share the same codebase (Framer Motion is now
  Motion). The `framer-motion` package depends on `motion` as a runtime
  dependency; counting both would double-count. The 33M figure uses the
  `framer-motion` package alone.
- The `motion` package records an additional ~15.4M weekly downloads
  (npmjs.com/package/motion, same date) representing projects that have
  migrated to the new package name.

---

## Motion model (internal, not on slides)

The motion intent reading model was updated from the retired
`meta-llama/Llama-3.3-70B-Instruct` to `Qwen/Qwen3-30B-A3B-Instruct-2507`.

**Verification:**
Nebius Token Factory model catalog
https://tokenfactory.nebius.com/model-catalog.md
Retrieved September 23, 2026

Catalog entry:
> Qwen3-30B-A3B-Instruct-2507 | Qwen | text2text | 30.5B params | 262K context
> eu-north1 | input: $0.10/M tokens, output: $0.30/M tokens
