# Ambiance sonore synthetisee (aucun sample externe) : pluie, UI, nappe, impact du logo.
# Sortie : frames/ambiance.wav (48 kHz stereo). Les temps sont ceux de l'animation (base 22 s),
# convertis en temps final par U() avec la meme table WARP que scene.js.
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR, DUR = 48000, 25.0
WARP = [(0, 0), (3.3, 3.0), (5.3, 5.0), (9, 9), (12, 12), (14.7, 14), (16.1, 15.7), (18.6, 17.6), (21.4, 19.0), (22.2, 19.6), (25, 22)]

def U(old):
    for (a0, b0), (a1, b1) in zip(WARP, WARP[1:]):
        if old <= b1:
            return a0 + (a1 - a0) * (old - b0) / (b1 - b0)
    return WARP[-1][0]
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)

def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)

def ramp(a, b):
    a, b = U(a), U(b)
    return smooth((t - a) / (b - a))

def band(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'bandpass', fs=SR, output='sos'), x)

def lowp(x, f):
    return sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)

def place(buf, start, sig, gain=1.0):
    i = int(U(start) * SR); j = min(N, i + len(sig))
    buf[i:j] += sig[: j - i] * gain

L = np.zeros(N); R = np.zeros(N)

# pluie : bruit filtre + gouttes sur la vitre, plus forte de 9 a 11 s.
# RAIN_GAIN garde la pluie nettement sous les voix (environ 10 dB d'ecart apres mixage).
RAIN_GAIN = 0.4
rain_k = (0.45 + 0.55 * ramp(9.0, 11.0) - 0.2 * ramp(15, 18)) * RAIN_GAIN
for ch, seed in ((L, 1), (R, 2)):
    n = np.random.default_rng(seed).standard_normal(N)
    bed = band(n, 400, 7000) * 0.05 + lowp(n, 300) * 0.05
    drops = np.zeros(N)
    r = np.random.default_rng(seed + 10)
    for s in r.uniform(0, DUR, 900):
        k = int(s * SR); ln = int(0.006 * SR)
        if k + ln < N:
            drops[k:k + ln] += r.standard_normal(ln) * np.exp(-np.arange(ln) / (0.0012 * SR)) * r.uniform(0.02, 0.08)
    ch += (bed + band(drops, 1500, 9000)) * rain_k

# souffle grave d'interieur
room = lowp(rng.standard_normal(N), 120) * 0.05
L += room; R += room

def tick(freq=1400, dur=0.07):
    x = np.arange(int(dur * SR)) / SR
    return np.sin(2 * np.pi * freq * x) * np.exp(-x / 0.012)

def chime(f1, f2):
    x = np.arange(int(0.9 * SR)) / SR
    a = np.sin(2 * np.pi * f1 * x) * np.exp(-x / 0.18)
    b = np.zeros_like(x); k = int(0.09 * SR)
    b[k:] = np.sin(2 * np.pi * f2 * x[:-k]) * np.exp(-x[:-k] / 0.3)
    return (a + b) * 0.5

def swell(dur, lo, hi):
    n = band(rng.standard_normal(int(dur * SR)), lo, hi)
    e = np.sin(np.pi * np.linspace(0, 1, len(n))) ** 2
    return n * e

for s in (3.3, 3.6, 3.9, 6.95, 7.2, 7.45):
    place(L, s, tick(), 0.05); place(R, s, tick(), 0.05)
for s in (4.1, 7.6):
    c = chime(880, 1318.5); place(L, s, c, 0.06); place(R, s, c, 0.06)
sw = swell(0.5, 2000, 8000); place(L, 2.55, sw, 0.05); place(R, 2.55, sw, 0.05)
# envoi des relances : petits souffles
for s in (6.95, 7.2, 7.45):
    w = swell(0.25, 1500, 5000); place(L, s, w, 0.03); place(R, s, w, 0.03)

# petits sauts du bonhomme Claude : "pop" doux (memes temps que poseClawd)
def pop():
    x = np.arange(int(0.09 * SR)) / SR
    f = 320 + 500 * x / 0.09
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.025)
for s in (4.1, 7.6, 14.2, 15.8, 17.6, 19.2):
    place(L, s - 0.02, pop(), 0.07); place(R, s - 0.02, pop(), 0.07)

# tension pendant que la lumiere baisse
drone = np.sin(2 * np.pi * 55 * t) * 0.6 + np.sin(2 * np.pi * 82.4 * t) * 0.3
drone_env = ramp(9.2, 11.5) * (1 - ramp(13.6, 14.4))
L += drone * drone_env * 0.05; R += drone * drone_env * 0.05

# nappe chaude a partir de 14 s (Do maj7), fondu en fin
pad = np.zeros(N)
for f in (130.81, 164.81, 196.0, 246.94, 329.63):
    for det in (-0.6, 0.6):
        pad += np.sin(2 * np.pi * (f + det) * t + rng.uniform(0, 6.28))
pad = lowp(pad, 1200) / 10
pad_env = ramp(14.0, 16.0) * (1 - ramp(21.0, 22.0)) * (1 + 0.08 * np.sin(2 * np.pi * 0.25 * t))
L += pad * pad_env * 0.11; R += np.roll(pad, 240) * pad_env * 0.11

# logo : impact grave doux + note claire
x = np.arange(int(2.0 * SR)) / SR
boom = np.sin(2 * np.pi * 48 * x * (1 - 0.15 * x)) * np.exp(-x / 0.5)
bell = np.sin(2 * np.pi * 1046.5 * x) * np.exp(-x / 0.6) * 0.25
place(L, 19.9, boom + bell, 0.06); place(R, 19.9, boom + bell, 0.06)

# fondu general en fin
fade = 1 - ramp(21.2, 22.0)
st = np.stack([L * fade, R * fade], axis=1)
# Gain fixe (pas de normalisation au pic : le pic vient des gouttes et annulerait RAIN_GAIN).
st *= 2.0
print('pic ambiance', round(float(np.abs(st).max()), 3))
st = np.clip(st, -0.98, 0.98)
wavfile.write('frames/ambiance.wav', SR, (st * 32767).astype(np.int16))
print('ok frames/ambiance.wav')
