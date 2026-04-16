import os
import io
import time
import wave
import struct
import tempfile
import threading
import requests
import pyaudio
import pygame
from openai import OpenAI
from elevenlabs import ElevenLabs
from dotenv import load_dotenv

load_dotenv('.env.local')

openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
elevenlabs_client = ElevenLabs(api_key=os.getenv('ELEVENLABS_API_KEY'))

JARVIS_SERVER = 'http://localhost:3001'
VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJuYWRhdm1pbmtvd2l0el9nbWFpbF9jb20iLCJlbWFpbCI6Im5hZGF2bWlua293aXR6QGdtYWlsLmNvbSIsIm5hbWUiOiJOYWRhdiIsImlhdCI6MTc3NTY2OTA3NywiZXhwIjoxNzc4MjYxMDc3fQ.02zpXrYe3fD77EV2ww-SKyvlXM4nYp0pMoVila8U0GI'

CHUNK = 512
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
MIC_DEVICE = 0

SILENCE_THRESHOLD = 300
SILENCE_DURATION = 1.2
MIN_SPEECH_DURATION = 0.4

is_speaking = False
stop_speaking = threading.Event()

# Current emotional tone — updated by face monitor events
current_tone = 'normal'  # normal | upbeat | gentle | calm | reassuring

# Tone → ElevenLabs voice settings mapping
TONE_SETTINGS = {
    'normal':       {'stability': 0.50, 'similarity_boost': 0.75, 'style': 0.0},
    'upbeat and enthusiastic': {'stability': 0.35, 'similarity_boost': 0.80, 'style': 0.3},
    'gentle and supportive':   {'stability': 0.65, 'similarity_boost': 0.70, 'style': 0.1},
    'calm and measured':       {'stability': 0.75, 'similarity_boost': 0.65, 'style': 0.0},
    'calm and reassuring':     {'stability': 0.70, 'similarity_boost': 0.70, 'style': 0.05},
    'neutral and professional':{'stability': 0.55, 'similarity_boost': 0.75, 'style': 0.0},
    'engaged and curious':     {'stability': 0.40, 'similarity_boost': 0.80, 'style': 0.2},
    'clear and helpful':       {'stability': 0.55, 'similarity_boost': 0.75, 'style': 0.0},
}

def get_voice_settings():
    settings = TONE_SETTINGS.get(current_tone, TONE_SETTINGS['normal'])
    return settings

def update_status(listening=False, speaking=False, transcript='', response=''):
    try:
        requests.post(f'{JARVIS_SERVER}/voice-update', json={
            'listening': listening,
            'speaking': speaking,
            'transcript': transcript,
            'response': response
        }, timeout=2)
    except:
        pass

def get_volume(data):
    try:
        shorts = struct.unpack('%dh' % (len(data) // 2), data)
        return max(abs(s) for s in shorts) if shorts else 0
    except:
        return 0

def clean_for_speech(text):
    text = text.replace('**', '').replace('*', '')
    text = text.replace('##', '').replace('#', '')
    text = text.replace('`', '').replace('__', '').replace('_', ' ')
    text = text.replace('•', '').replace('→', '').replace('✓', 'yes').replace('✗', 'no')
    text = text.replace('[JARVIS]', '').replace('🎤', '').replace('🔊', '')
    return text.strip()

def speak(text):
    global is_speaking
    is_speaking = True
    stop_speaking.clear()
    text = clean_for_speech(text)
    update_status(speaking=True, response=text)

    try:
        print(f"\nJARVIS: {text}")
        t0 = time.time()

        vs = get_voice_settings()

        audio = elevenlabs_client.text_to_speech.convert(
            voice_id=VOICE_ID,
            text=text[:500],
            model_id='eleven_monolingual_v1',
            voice_settings={
                'stability': vs['stability'],
                'similarity_boost': vs['similarity_boost'],
                'style': vs.get('style', 0.0),
                'use_speaker_boost': True
            }
        )

        tmp_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'speech_{int(time.time())}.mp3')
        with open(tmp_path, 'wb') as f:
            for chunk in audio:
                if chunk:
                    f.write(chunk)

        print(f"[ElevenLabs took {time.time()-t0:.1f}s, tone: {current_tone}]")

        pygame.mixer.init()
        pygame.mixer.music.load(tmp_path)
        pygame.mixer.music.play()

        while pygame.mixer.music.get_busy():
            if stop_speaking.is_set():
                pygame.mixer.music.stop()
                print("[Stopped]")
                break
            time.sleep(0.05)

        pygame.mixer.quit()

        try:
            os.unlink(tmp_path)
        except:
            pass

    except Exception as e:
        print(f"Speech error: {e}")
    finally:
        is_speaking = False
        update_status(speaking=False, response='')

def record_until_silence():
    pa = pyaudio.PyAudio()
    stream = pa.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        input_device_index=MIC_DEVICE,
        frames_per_buffer=CHUNK
    )

    frames = []
    silence_start = None
    speech_started = False
    speech_start_time = None

    update_status(listening=True)
    print("Listening...", end='\r')

    while True:
        try:
            data = stream.read(CHUNK, exception_on_overflow=False)
        except:
            continue

        volume = get_volume(data)

        if is_speaking:
            time.sleep(0.01)
            continue

        if volume > SILENCE_THRESHOLD:
            if not speech_started:
                speech_started = True
                speech_start_time = time.time()
                print("Speech detected...", end='\r')
            frames.append(data)
            silence_start = None
        else:
            if speech_started:
                frames.append(data)
                if silence_start is None:
                    silence_start = time.time()
                elif time.time() - silence_start > SILENCE_DURATION:
                    speech_duration = time.time() - speech_start_time
                    if speech_duration > MIN_SPEECH_DURATION:
                        break
                    else:
                        frames = []
                        speech_started = False
                        silence_start = None

    stream.stop_stream()
    stream.close()
    pa.terminate()
    return frames

def transcribe(frames):
    pa = pyaudio.PyAudio()
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp_path = f.name

    wf = wave.open(tmp_path, 'wb')
    wf.setnchannels(CHANNELS)
    wf.setsampwidth(pa.get_sample_size(FORMAT))
    wf.setframerate(RATE)
    wf.writeframes(b''.join(frames))
    wf.close()
    pa.terminate()

    with open(tmp_path, 'rb') as f:
        result = openai_client.audio.transcriptions.create(
            model='whisper-1',
            file=f,
            language='en'
        )

    os.unlink(tmp_path)
    return result.text.strip()

def fix_text(text):
    replacements = {
        ' at ': ' @ ',
        ' dot com': '.com',
        ' dot org': '.org',
        ' dot net': '.net',
        ' dot io': '.io',
        ' underscore ': '_',
        ' dash ': '-',
        ' hashtag ': '#',
        ' percent ': '%',
        ' dollar ': '$',
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text

def send_to_jarvis(message):
    try:
        print(f"\nYou: {message}")
        t0 = time.time()
        res = requests.post(
            f'{JARVIS_SERVER}/chat',
            json={'message': message},
            headers={'Authorization': f'Bearer {AUTH_TOKEN}'},
            timeout=120
        )
        data = res.json()
        print(f"[Claude took {time.time()-t0:.1f}s]")
        if data.get('success'):
            return data.get('message', '')
        return 'Sorry, something went wrong.'
    except Exception as e:
        print(f"Server error: {e}")
        return 'Cannot connect to JARVIS server.'

def calibrate():
    print("Calibrating microphone... (be quiet for 1 second)")
    pa = pyaudio.PyAudio()
    stream = pa.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        input_device_index=MIC_DEVICE,
        frames_per_buffer=CHUNK
    )

    volumes = []
    for _ in range(30):
        try:
            data = stream.read(CHUNK, exception_on_overflow=False)
            volumes.append(get_volume(data))
        except:
            pass

    stream.stop_stream()
    stream.close()
    pa.terminate()

    if volumes:
        ambient = sum(volumes) / len(volumes)
        threshold = max(200, ambient * 3)
        print(f"Ambient: {ambient:.0f} | Threshold: {threshold:.0f}")
        return threshold
    return 300

def poll_face_greeting():
    """Background thread — polls /face-greeting every 2s.
    When face_monitor.py detects Nadav, the server queues a greeting here.
    voice.py speaks it immediately."""
    global current_tone
    while True:
        try:
            res = requests.get(f'{JARVIS_SERVER}/face-greeting', timeout=3)
            data = res.json()
            greeting = data.get('greeting')
            tone = data.get('tone')

            if tone:
                current_tone = tone
                print(f"[FACE] Tone updated: {current_tone}")

            if greeting and not is_speaking:
                print(f"[FACE] Speaking greeting: {greeting}")
                speak_thread = threading.Thread(target=speak, args=(greeting,))
                speak_thread.daemon = True
                speak_thread.start()
        except:
            pass
        time.sleep(2)

def main():
    global SILENCE_THRESHOLD

    print("=" * 50)
    print("  JARVIS Voice")
    print("  Always listening")
    print("  Face greeting: active")
    print("  Press Ctrl+C to quit")
    print("=" * 50)

    try:
        requests.get(f'{JARVIS_SERVER}/health', timeout=3)
        print("Server connected!")
    except:
        print("WARNING: JARVIS server not running.")

    SILENCE_THRESHOLD = calibrate()

    # Start face greeting polling in background
    greeting_thread = threading.Thread(target=poll_face_greeting, daemon=True)
    greeting_thread.start()

    speak("JARVIS online. Ready for your command, Nadav.")

    while True:
        try:
            frames = record_until_silence()

            if not frames:
                continue

            update_status(listening=False)

            t0 = time.time()
            transcript = transcribe(frames)
            print(f"[Whisper took {time.time()-t0:.1f}s]")

            if not transcript or len(transcript) < 2:
                continue

            transcript = fix_text(transcript)
            print(f"Heard: {transcript}")

            update_status(transcript=transcript)

            response = send_to_jarvis(transcript)

            if response:
                update_status(transcript='')
                speak_thread = threading.Thread(target=speak, args=(response,))
                speak_thread.daemon = True
                speak_thread.start()
                speak_thread.join()
                update_status(transcript='', response='')

        except KeyboardInterrupt:
            print("\nGoodbye!")
            update_status(listening=False, speaking=False)
            break
        except Exception as e:
            print(f"Error: {e}")
            continue

if __name__ == '__main__':
    main()