import os, subprocess, sys
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
LIMIT = 4_800_000
CFGS = [(720, 10, 128), (640, 10, 128), (600, 10, 128), (600, 8, 128), (540, 8, 128), (480, 8, 96)]
for n in [f"{i:02d}" for i in range(1, 14)]:
    mp4 = os.path.join(src, f"g{n}.mp4")
    if not os.path.exists(mp4): print(n, "missing"); continue
    dst = os.path.join(out, f"g{n}.gif")
    for w, f, c in CFGS:
        vf = f"fps={f},scale={w}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors={c}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", mp4, "-vf", vf, "-loop", "0", dst], check=True)
        sz = os.path.getsize(dst)
        if sz <= LIMIT: break
    print(n, f"{w}px {f}fps {c}色", f"{sz/1e6:.2f}MB")
