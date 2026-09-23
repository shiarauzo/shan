# Shan pitch

Target: 4:40, leaving 20 seconds of buffer.

## 1. Video opening — 0:00–0:25

[video plays — let it breathe]

500,000 designers already animate for the web. They know what they want.
The problem is the tool standing between the idea and the frame.

## 2. The prompt interface — 0:25–0:45

[pause on the slide]

This is what most AI products look like: a prompt bar, a few suggestions,
nowhere to go but type. The result arrives in a chat reply.

Shan is different.

## 3. Motion complexity — 0:45–1:05

Six hours. That's how long it took a contractor to recreate one simple
Intercom web animation in Rive. Shan gets motion direction to a live animated
change in the page, in the session you're already in.

## 4. Meet Shan — 1:05–1:25

Shan turns motion direction into production-ready web animation.
Select any element on the live page, draw the motion, and a model names
the intent. The source changes live — keep or discard.

## 5. Feature 1: Select — 1:25–1:55

Point at the page. Click any rendered element in the running app.
Shan finds it in the DOM. No HTML inspection, no hunting component names.
The page is the interface.

## 6. Feature 2: Draw + model reading — 1:55–3:15

This is the live demo. Load the sample orbit or draw a rough circle.
Play the literal path — every wobble preserved.
Now read it with Token Factory. Qwen 3 30B returns a named motion spec:
orbit, 2400 ms, ease-in-out. Intent, not path.

## 7. Feature 3: Source patch — 3:15–3:55

This is the part every other tool skips. Shan turns the motion spec
into a source-code diff. Review in the browser, keep it, or discard it.
Chat ends in a reply. This changes your file.

## 8. Close — 3:55–4:15

[let the phrase land]

What are you waiting for? Bring your app to life.

---

## Criterion coverage

- Product value and functionality, 25%: slides 4–7
- Measurable model advantage, 20%: slide 6 (literal path vs. named spec, live)
- Business potential, 20%: slides 1–3 establish the market
- Architecture and Token Factory, 20%: slide 6 (Qwen 3 30B on Nebius, live)
- Demo clarity, 10%: slide 6 live interaction
- Responsible design, 5%: slide 6 — only coordinates go to the model
