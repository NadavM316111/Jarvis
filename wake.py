import openwakeword
import pyaudio
import numpy as np
import subprocess
import time
import sys
import os

openwakeword.utils.download_models(["hey_jarvis"])
from openwakeword.model import Model

model = Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")

print("JARVIS wake word listener active", flush=True)

while True:
    try:
        pa = pyaudio.PyAudio()
        stream = pa.open(rate=16000, channels=1, format=pyaudio.paInt16, input=True, frames_per_buffer=1280)
        
        detected = False
        while not detected:
            audio = stream.read(1280, exception_on_overflow=False)
            audio_np = np.frombuffer(audio, dtype=np.int16)
            prediction = model.predict(audio_np)
            for key, value in prediction.items():
                if value > 0.5:
                    print("Wake word detected!", flush=True)
                    detected = True

        # Stop mic so JARVIS voice mode can use it
        stream.stop_stream()
        stream.close()
        pa.terminate()

        subprocess.run(["open", "-a", "jarvis-web"])
        
        # Wait 30 seconds (user is talking to JARVIS) then resume listening
        time.sleep(30)

    except Exception as e:
        print(f"Error: {e}", flush=True)
        time.sleep(1)