---
name: lowpoly-reel
description: Turns a short video script into a finished vertical reel (9:16, Instagram Reels + TikTok) animated in hand-coded low-poly 3D - a man at his desk at night, rain on the window, city lights, and a small orange AI companion that projects a hologram - with ElevenLabs voices, subtitles, sound design, brand end card and CTA. Use when the user gives a script and asks for a "low-poly reel", a "3D animated reel with the little Claude/AI character", a video "in the same style as the last one", or invokes /lowpoly-reel.
---

# lowpoly-reel

Pipeline that turns a dialogue script into a short 3D animated reel, fully code-driven:
Three.js scene rendered frame by frame in headless Chrome, sound design synthesized in Python, voices from ElevenLabs, assembly and loudness with ffmpeg. No AI-generated images or video.

Always read the project's `CLAUDE.md` first: brand colors, logo, CTA rules, output folders and safe zones defined there win over the defaults below.

## Look and feel (defaults)
- Faceted low-poly 3D (`flatShading`), blue night mood, big window on a city skyline, rain on the glass, warm lamp, light wooden desk.
- Main character: low-poly man, blue sweater, spiky brown hair, block eyes, mouth animated on his voice.
- The AI assistant: a small orange block creature (two vertical black eyes, little arms, four legs) sitting on the desk. It projects a holographic panel that shows the work being done (items turning green, "Done."). It hops each time it speaks.
- Subtitles: Inter 500, 48 px, white, sentence case, centered near the top (y = 400), soft shadow. Assistant lines are prefixed with its name (and its official logo if provided) in its color.
- End card: fade to the brand background, brand logo (or brand name), CTA per platform with the keyword in the accent color.
- Lighting serves the story: it dims during a moment of doubt (`dim`) and warms up when the assistant reassures (`warmK`).
- Sound: rain and ambience stay far below the voices (about 15 dB under dialogue), UI ticks when items turn green, a soft "pop" on each hop, a warm pad at the emotional turn, a soft hit on the logo.

## Requirements
Node 18+, Python 3 with `numpy` and `scipy`, ffmpeg on the PATH. The browser comes from `npm run setup` (chrome-headless-shell); `CHROME_PATH` can point to another Chrome or Chromium. For voices: an ElevenLabs account open in the user's Chrome (Claude in Chrome extension).

## Steps

### 1. Set up the working folder
Create a folder named after the video in snake_case (the name is reused for the output files) and copy everything from this skill's `template/` into it. Run `npm install` then `npm run setup` (downloads Google's chrome-headless-shell into `chs/`; `render.mjs` uses it first, it is far more reliable than the desktop Chrome). Optional assets:
- `assets/logo.png` or `assets/logo.jpg`: end-card logo, light on dark. Without it, `BRAND.name` is written as text.
- `assets/assistant-logo.svg`: the assistant's official logo, downloaded by the user from the brand's own site (never redrawn). Without it, a simple dot is used.

Edit `BRAND` and `ASSISTANT` at the top of `scene.js` (name, colors, CTA lines per platform). The template's timeline is the example video "Je sers a quoi, moi ?" (25 s): rewrite it, don't keep it.

### 2. Break the script down
Make a shot table: timecode, framing, character action, assistant action, hologram content, line. Framings that work: 3/4 medium shot (man + assistant + window), close-up of the hologram with the assistant below, wide shot of the room, extreme close-up on the eyes (face-relative shot), close-up of the assistant, final face shot for the smile.

### 3. Voices first (ElevenLabs)
Generate voices before animating: the timeline is set on their real durations. Generating spends the user's credits, so only do it when asked.
- Model Eleven v4, stability about 70 %, plain text with NO emotion tags (`[sighs]`, `[softly]`, `[quietly]`... make the read breathy and over-acted).
- Conversational voices work best; soft/calm narrator voices sound wrong. Some library voices need a paid plan: if an "Upgrade" dialog opens, close it and pick another voice.
- Each generation gives 2 takes; in History the older one of each pair is "Generation 1".
- If the History download button produces no file, pull the audio from the page player (snippet and `recv.mjs` in `references/notes.md`). Files: `voices/lui_1.mp3`, `voices/claude_1.mp3`, ...
- Measure speech start/end and pauses: `ffmpeg -i X.mp3 -af silencedetect=noise=-40dB:d=0.12 -f null -`

### 4. Write the timeline in `scene.js`
Blocks to rewrite (all in final-video seconds):
- `DURATION`; `WARP = [[0, 0], [DURATION, DURATION]]` (identity) when animating directly on the voices. `WARP` is only useful to stretch an existing animation onto new voices.
- `LINES` (subtitles, split into readable chunks), `MOUTH_GAPS` (pauses inside one of the man's lines), `BLINKS`.
- `SHOTS`: `[start, end, posA, targetA, posB, targetB, fov]`, or a face-relative shot `[start, end, null, null, null, null, fov, {dist, side, lift, aim}]`.
- `poseCharacter`: `kf()` keys for lean, pitch, yaw, roll, sad, smile, lazy, hand on cheek.
- `poseClawd` (the assistant): facing direction, `hops` (one per assistant line), working windows (arms busy), final joy hop.
- `frame()`: `dim`, `warmK`, `rainK` ramps; hologram modes and when items turn green; panel content in `drawPanel()`.
- `drawEnd()`: when the end card fades in.

### 5. Previews and framing
`node render.mjs preview 1.0 4.2 ...` writes `previews/t_*.jpg`; make a contact sheet (command in `references/notes.md`). Check every shot: hologram fully in frame, character not cut, nothing important in the platforms' UI zones. Iterate on `SHOTS`.

### 6. Sound
`sound.py`: event times (ticks, chimes, pops, pad, hit) and `RAIN_GAIN`. Fixed output gain, never peak normalization (rain drops set the peak and would cancel `RAIN_GAIN`). `finalize.py`: fill `VOICES` (same starts as `LINES`).

### 7. Render and export
Run in the background: `node render.mjs video reels`, `node render.mjs video tiktok`, then `python -I sound.py` and `python -I finalize.py`. Outputs: `out/<name>_reels.mp4` and `out/<name>_tiktok.mp4` (1080x1920, H.264, AAC, -14 LUFS). Move them where the project's `CLAUDE.md` says if it defines output folders.

### 8. Check before delivery
- Contact sheet every 0.25 s with the Reels and TikTok safe-zone overlay: no subtitle, logo or CTA hidden.
- Loudness -14 LUFS, true peak <= -1.5 dBTP.
- Voices on top: ambience about 15 dB under the voices during dialogue (measured above 150 Hz on the final file).
- Report what could not be checked (Claude cannot listen to the audio: say so).
