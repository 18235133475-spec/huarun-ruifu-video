"""人声配音转写（只为对时）：faster-whisper 逐字时间戳，写 JSON。本地运行；首次会下载 whisper 模型。
用法：tools/.venv/bin/python tools/asr_words.py 输入.wav 输出.json [模型名]
"""
import json, sys, wave
import numpy as np
from faster_whisper import WhisperModel
src, out = sys.argv[1], sys.argv[2]
name = sys.argv[3] if len(sys.argv) > 3 else "small"
m = WhisperModel(name, device="cpu", compute_type="int8")
w_ = wave.open(src); audio = np.frombuffer(w_.readframes(w_.getnframes()), np.int16).astype(np.float32) / 32768.0  # 16k 单声道 wav，直接读，绕开 PyAV 版本问题
segs, info = m.transcribe(audio, language="zh", word_timestamps=True, vad_filter=True, vad_parameters={"min_silence_duration_ms": 300}, beam_size=5, condition_on_previous_text=False,
                          initial_prompt="华润瑞府，太原，汾河，和园，晋阳湖，长风，五大馆，万象城，夏邦杰，玄关厅，纵轴，横轴。")
words = []
for s in segs:
    for w in s.words:
        words.append([round(w.start, 3), round(w.end, 3), w.word])
    print(round(s.start, 1), s.text, flush=True)
json.dump(words, open(out, "w"), ensure_ascii=False)
