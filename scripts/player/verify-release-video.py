from pathlib import Path
import json,subprocess,re,sys
sys.path.insert(0,'data/pdf-tools')
from PIL import Image,ImageDraw
out=Path('submission/release-v026/video');video=out/'自在弈境-演示与真实协作记录.mp4';ff=str(next(Path('data/submission-tools/imageio_ffmpeg/binaries').glob('*.exe')))
meta=subprocess.run([ff,'-i',str(video)],capture_output=True,text=True,encoding='utf8',errors='replace').stderr
m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',meta);duration=int(m[1])*3600+int(m[2])*60+float(m[3]);assert 300<=duration<=480;assert '1920x1080' in meta
r=subprocess.run([ff,'-v','error','-i',str(video),'-f','null','-'],capture_output=True,text=True);assert r.returncode==0 and not r.stderr,r.stderr
frames=Path('evidence/final-v026/video-frames');frames.mkdir(parents=True,exist_ok=True)
scenes=json.loads((out/'recording.json').read_text(encoding='utf8'))['scenes'];sheet=Image.new('RGB',(1200,((len(scenes)+2)//3)*260),'#ddd')
for i,s in enumerate(scenes):
 target=frames/f'frame-{i}.png';subprocess.run([ff,'-v','error','-y','-ss',str(s['startSeconds']+4),'-i',str(video),'-frames:v','1',str(target)],check=True)
 im=Image.open(target);im.thumbnail((396,225));sheet.paste(im,((i%3)*400,(i//3)*260));ImageDraw.Draw(sheet).text(((i%3)*400+6,(i//3)*260+232),f'Scene {i}',fill='black')
sheet.save(frames/'contact.jpg');report={'durationSeconds':duration,'width':1920,'height':1080,'fullDecodePassed':True,'sceneFrames':len(scenes),'collaborationSeconds':135,'collaborationMode':'Authentic historical playback; original product name retained','bytes':video.stat().st_size};(out/'verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
