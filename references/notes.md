# Notes, pitfalls and handy commands

## Pitfalls met while building the example video
- **Encoding (Windows)**: `Get-Content` + `Set-Content` in Windows PowerShell 5.1 breaks UTF-8 (accents, "…", "’"). Edit files with an editor tool or a Python script reading/writing `utf-8`.
- **Headless Chrome**: launching the desktop Chrome through puppeteer can fail with "Code: 0" for no visible reason (a Chrome already open, environment...). Use chrome-headless-shell (`npm run setup`, picked first by `render.mjs`): it never failed. `render.mjs` also retries 5 times with a fresh temporary profile. Never put the Chrome profile in a path containing spaces.
- **Hologram**: with additive blending the panel becomes unreadable over the city lights; `drawPanel` uses a dark semi-opaque background.
- **Face shots**: compute the camera from the head (`head.getWorldQuaternion`) with a horizontally projected forward vector, otherwise the camera dives when the character looks down.
- **Assistant creature**: legs must be children of the body (otherwise they stay on the desk during hops); emissive around 0.38 keeps it orange under the blue light.
- **Sound**: never peak-normalize the ambience (rain drops set the peak and cancel `RAIN_GAIN`). Fixed gain + sidechain ducking under the voices + two-pass loudnorm on the final mix.
- **Voices**: emotion tags and "soft / calm" voices give a breathy, over-acted read. Plain text + conversational voice + stability ~70 %.

## Pulling ElevenLabs takes from the page (Claude in Chrome)
1. Start `node recv.mjs` in the background (writes to `voices/`).
2. Open History in Text to Speech, list the rows first (text + voice) to get their indexes (newest first), then run in the page with `javascript_tool`, adapting the voice names and the plan:
```js
const rows=[...document.querySelectorAll('li')].filter(li=>/VoiceNameA|VoiceNameB/.test(li.innerText) && li.innerText.length<300);
const plan=[[5,'lui_1.mp3'],[3,'lui_2.mp3'],[1,'lui_3.mp3'],[9,'claude_1.mp3'],[7,'claude_2.mp3'],[11,'claude_3.mp3']];
const out=[];
for (const [i,name] of plan) {
  const prev=document.querySelector('audio')?.src;
  rows[i].querySelector('button[aria-label="Play"]').click();
  let a; for (let k=0;k<40;k++){ await new Promise(r=>setTimeout(r,150)); a=document.querySelector('audio'); if(a && a.src!==prev && a.src.startsWith('data:')) break; }
  a.pause();
  const blob=await (await fetch(a.src)).blob();
  const r=await fetch('http://127.0.0.1:8799/save?name='+name,{method:'POST',body:blob,headers:{'Content-Type':'audio/mpeg'}});
  out.push(name+' <- '+rows[i].innerText.split('\n')[0].slice(0,40)+' | '+blob.size+' B | '+(await r.text()));
}
out
```
3. Stop `recv.mjs` and close the tab you opened.

## Contact sheet of previews (PowerShell, inside previews/)
```powershell
$files = Get-ChildItem t_*.jpg | Sort-Object { [double]($_.BaseName -replace 't_','') }; $in = $files | % { '-i', $_.Name }; $n=$files.Count
$fc = (0..($n-1) | % { "[$($_):v]scale=300:533[v$_];" }) -join ''; $fc += (0..($n-1) | % { "[v$_]" }) -join ''; $fc += "hstack=inputs=$n"
ffmpeg -y -loglevel error @in -filter_complex $fc -frames:v 1 sheet.jpg
```

## Safe-zone overlay (red = Reels, yellow = TikTok)
```powershell
$z = "drawbox=x=0:y=0:w=1080:h=220:color=red@0.25:t=fill,drawbox=x=0:y=1470:w=1080:h=450:color=red@0.25:t=fill,drawbox=x=980:y=1155:w=100:h=315:color=red@0.25:t=fill,drawbox=x=940:y=0:w=140:h=1920:color=yellow@0.2:t=fill,drawbox=x=0:y=0:w=60:h=1920:color=yellow@0.2:t=fill"
ffmpeg -y -loglevel error -i out\<name>_reels.mp4 -vf "fps=4,$z,scale=180:320,drawtext=text='%{pts\:hms}':x=4:y=4:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.6,tile=13x4" previews\check_%02d.jpg
```
Reels: keep 220 px free at the top, nothing below y = 1470, 35 px on the sides, 100 px free on the right from y = 1155. TikTok: 160 px top, 480 px bottom, 140 px right, 60 px left.

## Voice vs ambience gap (final file)
```powershell
python -I -c "
import subprocess, numpy as np
from scipy.signal import butter, sosfilt
raw = subprocess.run(['ffmpeg','-v','error','-i','out/<name>_reels.mp4','-ac','1','-ar','16000','-f','s16le','-'],capture_output=True).stdout
x = np.frombuffer(raw, np.int16).astype(float)/32768; hi = x - sosfilt(butter(4,150,'lowpass',fs=16000,output='sos'),x)
db = lambda a,b: 20*np.log10(np.sqrt((hi[int(a*16000):int(b*16000)]**2).mean())+1e-9)
for a,b,lab in [(0.3,3.1,'voice'),(3.3,4.3,'ambience only')]: print(lab, round(db(a,b),1))
"
```
Reference that sounded right: voices about -14 dB, calm rain about -32 dB, heavy rain in a voiceless beat about -22 dB.
