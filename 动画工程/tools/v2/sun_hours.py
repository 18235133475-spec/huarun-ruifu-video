"""太原的日照几何：按纬度、经度和楼栋朝向，算各节气立面受直射的时段（只算太阳几何，不计遮挡）。
写 src/v2/sun_taiyuan.json，给开场 O5S“阳光账”镜头用：太阳轨迹（方位、高度）和三个立面每 10 分钟的入射余弦。
2号楼正面朝 217.7°（甲方总平面量得），东北面法线 37.7°；正南楼北面法线 0°。时间为北京时间。
用法：python3 -I tools/v2/sun_hours.py
"""
import math, datetime as dt, json
LAT, LON = 37.82, 112.52
def sunpos(d, minute):  # minute: Beijing time minutes since midnight
    n = d.timetuple().tm_yday
    g = 2*math.pi/365*(n-1+(minute/60-8-12)/24)
    eqt = 229.18*(0.000075+0.001868*math.cos(g)-0.032077*math.sin(g)-0.014615*math.cos(2*g)-0.040849*math.sin(2*g))
    dec = 0.006918-0.399912*math.cos(g)+0.070257*math.sin(g)-0.006758*math.cos(2*g)+0.000907*math.sin(2*g)-0.002697*math.cos(3*g)+0.00148*math.sin(3*g)
    tst = minute + eqt + 4*LON - 60*8
    ha = math.radians(tst/4-180)
    lat = math.radians(LAT)
    cz = math.sin(lat)*math.sin(dec)+math.cos(lat)*math.cos(dec)*math.cos(ha)
    zen = math.acos(max(-1,min(1,cz)))
    el = 90-math.degrees(zen)
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha)*math.sin(lat)-math.tan(dec)*math.cos(lat)))+180
    return az % 360, el
def runs(d, normal):
    out=[];cur=None
    for m in range(0,24*60):
        az,el=sunpos(d,m)
        inc = math.cos(math.radians(az-normal))*math.cos(math.radians(el))
        lit = el>0 and inc>0
        if lit and cur is None: cur=m
        if not lit and cur is not None: out.append((cur,m)); cur=None
    return out
fmt=lambda m:f"{m//60:02d}:{m%60:02d}"
D={"夏至":dt.date(2026,6,21),"立夏":dt.date(2026,5,5),"立秋":dt.date(2026,8,7),"春分":dt.date(2026,3,20),"秋分":dt.date(2026,9,23),"冬至":dt.date(2026,12,22)}
res={}
for k,d in D.items():
    row={}
    for name,nrm in (("NE",37.7),("N",0),("SW",217.7)):
        r=runs(d,nrm); row[name]=[(a,b) for a,b in r]
        print(k,name,[f"{fmt(a)}-{fmt(b)} {(b-a)/60:.1f}h" for a,b in r])
    # sun path every 10 min
    row["path"]=[(m,*sunpos(d,m)) for m in range(0,1440,10) if sunpos(d,m)[1]>-2]
    res[k]=row

from pathlib import Path
OUT = Path(__file__).resolve().parents[2] / "src" / "v2" / "sun_taiyuan.json"
def prof(d, nrm):
    out = []
    for m in range(240, 1201, 10):
        az, el = sunpos(d, m)
        out.append(round(max(0.0, math.cos(math.radians(az - nrm)) * math.cos(math.radians(el))) if el > 0 else 0.0, 3))
    return out
data = {}
for k in ("夏至", "立夏", "春分", "冬至"):
    d = D[k]
    data[k] = {"path": [[m, round(az, 2), round(el, 2)] for m, az, el in res[k]["path"]],
               "runs": {f: res[k][f] for f in ("NE", "N", "SW")},
               "prof": {f: prof(d, n) for f, n in (("NE", 37.7), ("N", 0), ("SW", 217.7))}}
json.dump(data, open(OUT, "w"), ensure_ascii=False)
print("written", OUT)
