# Assemble image + voix + ambiance et normalise a -14 LUFS (loudnorm en deux passes).
# Le dossier de travail s'appelle comme la video ; voix dans voices/*.mp3.
# Usage : python -I finalize.py  -> out/<nom>_reels.mp4 et out/<nom>_tiktok.mp4
import json, re, subprocess
from pathlib import Path

HERE = Path(__file__).parent
NAME = HERE.name
RAW = HERE / 'voices'
OUT = HERE / 'out'
OUT.mkdir(exist_ok=True)
AMB = HERE / 'frames' / 'ambiance.wav'
MIX = HERE / 'frames' / 'mix.wav'
TARGET = 'I=-14:TP=-1.5:LRA=11'
DURATION = float(re.search(r'export const DURATION = ([\d.]+)', (HERE / 'scene.js').read_text(encoding='utf-8')).group(1))
# (fichier sans extension, debut en secondes) : memes debuts que les repliques de LINES dans scene.js
VOICES = [('lui_1', 0.3), ('claude_1', 4.4), ('lui_2', 5.6), ('claude_2', 7.55), ('lui_3', 12.2), ('claude_3', 14.95)]

def ff(*args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *map(str, args)], check=True)

# 1. mixage : voix calees + ambiance baissee sous la parole (sidechain)
inputs = ['-i', AMB]
chains = []
for i, (name, start) in enumerate(VOICES, 1):
    inputs += ['-i', RAW / f'{name}.mp3']
    ms = int(start * 1000)
    chains.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,adelay={ms}|{ms}[v{i}]')
vlabels = ''.join(f'[v{i}]' for i in range(1, len(VOICES) + 1))
fc = ';'.join(chains) + (
    f';{vlabels}amix=inputs={len(VOICES)}:normalize=0,apad=whole_dur={DURATION},asplit=2[vox][key]'
    ';[0:a]volume=-7dB[amb];[amb][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=350[duck]'
    ';[duck][vox]amix=inputs=2:normalize=0:duration=first[out]')
ff(*inputs, '-filter_complex', fc, '-map', '[out]', '-ar', '48000', MIX)

# 2. loudnorm deux passes
r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(MIX), '-af', f'loudnorm={TARGET}:print_format=json', '-f', 'null', '-'],
                   capture_output=True, text=True)
m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
af = (f"loudnorm={TARGET}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
for variant in ('reels', 'tiktok'):
    out = OUT / f'{NAME}_{variant}.mp4'
    ff('-i', HERE / 'frames' / f'{variant}_video.mp4', '-i', MIX, '-map', '0:v', '-map', '1:a',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30',
       '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out)
    print('ok', out)
