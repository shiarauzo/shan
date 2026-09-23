# Shan

This file is public. Do not include personal context, private goals, names of
people from the vault, health information, private decisions, or local vault
paths.

**Last updated:** 2026-09-23  
**Status:** active  
**Type:** monorepo

## Goal

Give a person a page of images they can point at and set in motion by drawing
with the cursor.

## Done when

- The landing is one page with a small set of images.
- A toolbox opens from a mark fixed to the bottom of the viewport.
- A chosen image can play a cursor stroke, and a model reading of that stroke when a key is set.

## Current state

The repository is a Turborepo with a publishable `shan` package and two UI-only Next.js examples: a marketing website and a private-account fintech website called Sable. The package provides the floating editor, DOM selection, drawing notes, direct animation, model-backed motion readings, element-aware code prompts, and keep/discard controls.

The fintech example also hosts an eight-slide, keyboard-navigable pitch at
`/pitch`. It includes an interactive motion demo with local playback and a
dedicated Token Factory endpoint.

## Next action

Set `NEBIUS_API_KEY` in Vercel, verify the model-backed reading, and rehearse
the 4:40 script.

## Links

- Repository: https://github.com/shiarauzo/shan
- Production: https://fintech-website-ashen.vercel.app/pitch
- Documentation:
