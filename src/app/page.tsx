"use client";
import { useState, useRef, useEffect, useCallback } from "react";
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
interface Message {
  role: "user" | "assistant";
  content: string;
  source?: "voice" | "text";
  timestamp?: number;
  imageUrl?: string;
  fileName?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

interface Update {
  id: number;
  message: string;
  time: string;
  date: string;
  read: boolean;
}

interface DailyCheck {
  id: number;
  label: string;
  status: "idle" | "processing" | "done";
  lastResult: string;
  expanded: boolean;
  followUp: string;
}

function formatMessage(text: string) {
  return text
    .replace(/\[PROGRESS:\d+%\].*?\[\/PROGRESS\]/g, '')
    .replace(/\[CONTINUE_BUTTON:.*?\]/g, '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/#{1,3} (.*?)(\n|$)/g, '<strong>$1</strong><br/>')
    .replace(/^- (.*?)$/gm, '• $1')
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s<"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;word-break:break-all;">$1</a>');
}

function renderMessageExtras(content: string, onContinue: (prompt: string) => void) {
  const extras: React.ReactNode[] = [];
  const progressMatch = content.match(/\[PROGRESS:(\d+)%\](.*?)\[\/PROGRESS\]/);
  if (progressMatch) {
    const pct = parseInt(progressMatch[1]);
    const label = progressMatch[2].trim();
    extras.push(
      <div key="progress" style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{label}</div>
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: '999px', transition: 'width 0.5s ease' }} />
        </div>
      </div>
    );
  }
  const continueMatch = content.match(/\[CONTINUE_BUTTON:(.*?)\]/);
  if (continueMatch) {
    const prompt = continueMatch[1].trim();
    extras.push(
      <button
        key="continue"
        onClick={() => onContinue(prompt)}
        style={{
          marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 500,
          background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)',
          color: '#60a5fa', cursor: 'pointer', transition: 'all 0.15s'
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.25)')}
        onMouseOut={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Continue
      </button>
    );
  }
  return extras.length > 0 ? <div>{extras}</div> : null;
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

const API = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'https://api.heyjarvis.me'
  : 'http://localhost:3001';

// ============ VOICE MODE MODAL ============
function VoiceModeModal({
  token,
  userName,
  onClose,
  onMessageSent,
}: {
  token: string;
  userName: string;
  onClose: () => void;
  onMessageSent: (userMsg: string, assistantMsg: string) => void;
}) {
  const [voiceState, setVoiceState] = useState<'idle' | 'wake' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [orbAngle, setOrbAngle] = useState(0);
  const [wakeActive, setWakeActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wakeRecRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isListeningRef = useRef(false);
  const wakeLoopRef = useRef(true);
  const voiceStateRef = useRef(voiceState);
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  // Animate orb rotation
  useEffect(() => {
    let frame: number;
    const tick = () => { setOrbAngle(a => (a + 0.8) % 360); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Audio level analyzer
  useEffect(() => {
    let frame: number;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length);
        frame = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => {});
    return () => { cancelAnimationFrame(frame); streamRef.current?.getTracks().forEach(t => t.stop()); audioCtxRef.current?.close(); };
  }, []);

  const inConversationRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});
  const sendToJarvisRef = useRef<(text: string) => void>(() => {});

  const speak = useCallback(async (text: string) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/<[^>]*>/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
    setVoiceState('speaking');
    try {
      const res = await fetch(`${API}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (inConversationRef.current && wakeLoopRef.current) {
          setTimeout(() => startListeningRef.current(), 400);
        } else {
          setVoiceState('idle');
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setVoiceState('idle');
      };
      await audio.play();
    } catch {
      // Fallback to browser TTS
      const utt = new SpeechSynthesisUtterance(clean);
      utt.rate = 0.9; utt.pitch = 0.7; utt.volume = 1.0;
      utt.onend = () => {
        if (inConversationRef.current && wakeLoopRef.current) {
          setTimeout(() => startListeningRef.current(), 400);
        } else {
          setVoiceState('idle');
        }
      };
      window.speechSynthesis.speak(utt);
    }
  }, []);

  const sendToJarvis = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const lower = text.toLowerCase().trim();
    if (lower.includes('goodbye jarvis') || lower === 'goodbye' || lower === 'bye jarvis' || lower === 'stop jarvis') {
      inConversationRef.current = false;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance('Goodbye.');
      utt.rate = 1.05; utt.pitch = 0.85; utt.volume = 1.0;
      utt.onend = () => setVoiceState('idle');
      window.speechSynthesis.speak(utt);
      setVoiceState('speaking');
      setTranscript(text);
      return;
    }
    inConversationRef.current = true;
    setVoiceState('thinking');
    setTranscript(text);
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const reply = data.message || 'Done.';
      setResponse(reply);
      onMessageSent(text, reply);
      speak(reply);
    } catch { setVoiceState('idle'); }
  }, [token, speak, onMessageSent]);

  const startListening = useCallback(() => {
    if (isListeningRef.current) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeRecRef.current?.abort();
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    recognitionRef.current = rec;
    isListeningRef.current = true;
    setVoiceState('listening');
    setTranscript('');
    setResponse('');
    let finalTranscript = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(finalTranscript || interim);
    };
    rec.onend = () => {
      isListeningRef.current = false;
      if (finalTranscript.trim()) sendToJarvisRef.current(finalTranscript.trim());
      else setVoiceState('idle');
    };
    rec.onerror = () => { isListeningRef.current = false; setVoiceState('idle'); };
    rec.start();
  }, [sendToJarvis]);

  // Keep refs in sync so circular deps don't matter
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { sendToJarvisRef.current = sendToJarvis; }, [sendToJarvis]);

  // Wake word loop — runs continuously in background
  const playWakeChime = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const notes = [880, 1320];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.22);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.25);
      });
      setTimeout(() => ctx.close(), 800);
    } catch {}
  }, []);

  const startWakeLoop = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setWakeActive(true);

    const loop = () => {
      if (!wakeLoopRef.current) return;
      if (['listening', 'thinking', 'speaking'].includes(voiceStateRef.current)) {
        setTimeout(loop, 800);
        return;
      }
      const rec = new SpeechRecognition();
      wakeRecRef.current = rec;
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (e: any) => {
        const said = (e.results[0]?.[0]?.transcript || '').toLowerCase().trim();
        if (said.includes('hey jarvis') || (said.includes('jarvis') && said.startsWith('hey'))) {
          playWakeChime();
          setTimeout(() => {
            if (wakeLoopRef.current) {
              inConversationRef.current = true;
              startListening();
            }
          }, 350);
        }
      };
      rec.onend = () => { if (wakeLoopRef.current) setTimeout(loop, 200); };
      rec.onerror = () => { if (wakeLoopRef.current) setTimeout(loop, 500); };
      try { rec.start(); } catch {}
    };
    loop();
  }, [startListening, playWakeChime]);

  useEffect(() => {
    wakeLoopRef.current = true;
    startWakeLoop();
    return () => {
      wakeLoopRef.current = false;
      wakeRecRef.current?.abort();
    };
  }, [startWakeLoop]);

  const handleOrbClick = () => {
    if (voiceState === 'listening') {
      recognitionRef.current?.stop();
      isListeningRef.current = false;
      inConversationRef.current = false;
      setVoiceState('idle');
    } else if (voiceState === 'speaking') {
      window.speechSynthesis.cancel();
      inConversationRef.current = false;
      setVoiceState('idle');
    } else if (voiceState === 'idle') {
      inConversationRef.current = true;
      startListening();
    }
  };

  const orbConfig = {
    idle: {
      gradient: `conic-gradient(from ${orbAngle}deg, #1d4ed8, #3b82f6, #60a5fa, #93c5fd, #1d4ed8)`,
      glow: '0 0 40px rgba(96,165,250,0.4), 0 0 80px rgba(59,130,246,0.2)',
      scale: 1, pulseRings: false,
    },
    wake: {
      gradient: `conic-gradient(from ${orbAngle}deg, #1d4ed8, #3b82f6, #60a5fa, #93c5fd, #1d4ed8)`,
      glow: '0 0 40px rgba(96,165,250,0.4), 0 0 80px rgba(59,130,246,0.2)',
      scale: 1, pulseRings: false,
    },
    listening: {
      gradient: `conic-gradient(from ${orbAngle}deg, #065f46, #10b981, #34d399, #6ee7b7, #065f46)`,
      glow: `0 0 ${40 + audioLevel / 3}px rgba(52,211,153,0.7), 0 0 ${80 + audioLevel / 2}px rgba(16,185,129,0.3)`,
      scale: 1 + (audioLevel / 255) * 0.25, pulseRings: true, ringColor: 'rgba(52,211,153,0.15)',
    },
    thinking: {
      gradient: `conic-gradient(from ${orbAngle * 2}deg, #4c1d95, #7c3aed, #a78bfa, #c4b5fd, #4c1d95)`,
      glow: '0 0 50px rgba(167,139,250,0.6), 0 0 100px rgba(124,58,237,0.3)',
      scale: 1.05, pulseRings: true, ringColor: 'rgba(167,139,250,0.12)',
    },
    speaking: {
      gradient: `conic-gradient(from ${orbAngle * 1.5}deg, #831843, #db2777, #f472b6, #fbcfe8, #831843)`,
      glow: '0 0 50px rgba(244,114,182,0.6), 0 0 100px rgba(219,39,119,0.3)',
      scale: 1 + Math.sin(Date.now() / 200) * 0.05, pulseRings: true, ringColor: 'rgba(244,114,182,0.12)',
    },
  }[voiceState];

  const stateLabel = {
    idle: 'Tap to speak or say "Hey JARVIS"',
    wake: 'Tap to speak or say "Hey JARVIS"',
    listening: 'Listening... say "Goodbye JARVIS" to end',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
  }[voiceState];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(4,4,6,0.97)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '0',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: 12,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: 600, letterSpacing: '0.02em' }}>JARVIS Voice</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 }}>Hey {userName}</div>
      </div>

      {/* Orb container */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
        {/* Pulse rings */}
        {orbConfig.pulseRings && (
          <>
            <div style={{
              position: 'absolute',
              width: 240, height: 240, borderRadius: '50%',
              background: (orbConfig as any).ringColor,
              animation: 'voicePulse1 2s ease-out infinite',
            }} />
            <div style={{
              position: 'absolute',
              width: 200, height: 200, borderRadius: '50%',
              background: (orbConfig as any).ringColor,
              animation: 'voicePulse1 2s ease-out infinite 0.5s',
            }} />
          </>
        )}

        {/* Main orb */}
        <div
          onClick={handleOrbClick}
          style={{
            width: 140, height: 140, borderRadius: '50%',
            background: orbConfig.gradient,
            boxShadow: orbConfig.glow,
            transform: `scale(${orbConfig.scale})`,
            transition: 'transform 0.1s ease, box-shadow 0.2s ease',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Inner shine */}
          <div style={{
            position: 'absolute', top: '15%', left: '20%',
            width: '35%', height: '30%',
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '50%',
            filter: 'blur(8px)',
          }} />

          {/* State icon */}
          {voiceState === 'idle' && (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
          {voiceState === 'listening' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{
                  width: 4, borderRadius: 2,
                  background: 'rgba(255,255,255,0.95)',
                  height: `${8 + (audioLevel / 255) * 28 * (0.4 + Math.abs(Math.sin(Date.now() / 100 + i * 0.9)) * 0.6)}px`,
                  transition: 'height 0.05s',
                  animation: `voiceBar${i % 3} 0.6s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                }} />
              ))}
            </div>
          )}
          {voiceState === 'thinking' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.9)',
                  animation: 'voiceBounce 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          )}
          {voiceState === 'speaking' && (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          )}
        </div>
      </div>

      {/* State label */}
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: 500, marginBottom: 24, letterSpacing: '0.02em', height: 22 }}>
        {stateLabel}
      </div>

      {/* Transcript / Response */}
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px', minHeight: 80, textAlign: 'center' }}>
        {transcript && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '12px 16px', marginBottom: 12,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>You</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.5 }}>{transcript}</div>
          </div>
        )}
        {response && voiceState !== 'idle' && (
          <div style={{
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
            borderRadius: 16, padding: '12px 16px',
          }}>
            <div style={{ color: 'rgba(96,165,250,0.6)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>JARVIS</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: formatMessage(response.substring(0, 200) + (response.length > 200 ? '...' : '')) }}
            />
          </div>
        )}
        {voiceState === 'idle' && !transcript && (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
            Tap the orb to start speaking
          </div>
        )}
        {voiceState === 'idle' && transcript && (
          <button
            onClick={startListening}
            style={{
              marginTop: 16, padding: '10px 24px', borderRadius: 12,
              background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)',
              color: '#60a5fa', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Ask again
          </button>
        )}
      </div>

      <style>{`
        @keyframes voicePulse1 {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes voiceBounce {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes voiceBar0 { 0%, 100% { height: 8px; } 50% { height: 28px; } }
        @keyframes voiceBar1 { 0%, 100% { height: 14px; } 50% { height: 8px; } }
        @keyframes voiceBar2 { 0%, 100% { height: 20px; } 50% { height: 36px; } }
      `}</style>
    </div>
  );
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showUpdates, setShowUpdates] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dailyChecks, setDailyChecks] = useState<DailyCheck[]>([]);
  const [newCheckInput, setNewCheckInput] = useState("");
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [spokenUpdates, setSpokenUpdates] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{data: string, type: string, name: string}[]>([]);
  const [voiceBubbleVisible, setVoiceBubbleVisible] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
const [showSettings, setShowSettings] = useState(false);
const [checkingOut, setCheckingOut] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTranscriptRef = useRef("");
  const lastResponseRef = useRef("");
  const activeIdRef = useRef<string | null>(null);
  const latestCameraFrameRef = useRef<string | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/auth/google/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setGoogleConnected(d.connected)).catch(() => {});
    fetch(`${API}/subscription-status`, { headers: { Authorization: `Bearer ${token}` } })
  .then(r => r.json()).then(d => setSubscribed(d.subscribed)).catch(() => {});
  // Re-check if returning from Stripe
if (window.location.search.includes('subscribed=true')) {
  setSubscribed(true);
  window.history.replaceState({}, '', '/');
}
  }, [token]);

  const activeConv = conversations.find(c => c.id === activeId);
  const messages = activeConv?.messages || [];

  useEffect(() => {
    const saved = localStorage.getItem('jarvis_token');
    const savedName = localStorage.getItem('jarvis_name');
    const savedConvs = localStorage.getItem('jarvis_conversations');
    if (localStorage.getItem('jarvis_subscribed') === 'true') setSubscribed(true);
    if (saved && savedName) { setToken(saved); setUserName(savedName); }
    if (savedConvs) {
      try {
        const convs = JSON.parse(savedConvs);
        setConversations(convs);
        if (convs.length > 0) setActiveId(convs[0].id);
      } catch {}
    }
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (conversations.length > 0) localStorage.setItem('jarvis_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function addMessageToConv(convId: string, msg: Message) {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, msg] } : c));
  }

  const handleVoiceModeMessage = useCallback((userMsg: string, assistantMsg: string) => {
    let convId = activeIdRef.current;
    if (!convId) {
      convId = generateId();
      const conv: Conversation = { id: convId, title: userMsg.slice(0, 40), messages: [], createdAt: Date.now() };
      setConversations(prev => [conv, ...prev]);
      setActiveId(convId);
      activeIdRef.current = convId;
    }
    setConversations(prev => prev.map(c => c.id === convId ? {
      ...c,
      messages: [
        ...c.messages,
        { role: 'user', content: userMsg, source: 'voice', timestamp: Date.now() },
        { role: 'assistant', content: assistantMsg, source: 'voice', timestamp: Date.now() },
      ]
    } : c));
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const tok = tokenRef.current;
      if (!tok) return;
      try {
        const res = await fetch(`${API}/bg-response`, { headers: { Authorization: `Bearer ${tok}` } });
        const data = await res.json();
        if (!data.responses?.length) return;
        for (const r of data.responses) {
          if (r.message === '__SUBSCRIBED__') { setSubscribed(true); continue; }
          let convId = activeIdRef.current;
          if (!convId) {
            convId = generateId();
            const conv: Conversation = { id: convId, title: r.message.slice(0, 40), messages: [], createdAt: Date.now() };
            setConversations(prev => [conv, ...prev]);
            setActiveId(convId);
            activeIdRef.current = convId;
          }
          const isProgress = r.message.includes('[PROGRESS:');
  if (isProgress) {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const msgs = c.messages;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content.includes('[PROGRESS:')) {
        return { ...c, messages: [...msgs.slice(0, -1), { ...lastMsg, content: r.message }] };
      }
      return { ...c, messages: [...msgs, { role: 'assistant', content: r.message, source: 'text', timestamp: Date.now() }] };
    }));
    continue; // ← skip the rest of the loop for progress messages
  }
          addMessageToConv(convId, { role: "assistant", content: r.message, source: "text", timestamp: r.timestamp ?? Date.now() });
          const urlMatch2 = r.message.match(/https:\/\/api\.heyjarvis\.me\/view\/[^\s)]+/);
          if (urlMatch2) setTimeout(() => window.open(urlMatch2[0], '_blank'), 500);
          const ytMatch2 = r.message.match(/https:\/\/(www\.)?youtube\.com\/watch\?[^\s<>"')]+/);
          if (ytMatch2) setTimeout(() => window.open(ytMatch2[0], '_blank'), 500);
        }
      } catch {}
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!token) return;
    const saved = token;

    const fetchUpdates = async () => {
      try {
        const res = await fetch(`${API}/proactive-updates`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setUpdates(data.updates || []);
        setUnreadCount((data.updates || []).filter((u: Update) => !u.read).length);
      } catch {}
    };

    const checkVoice = async () => {
      try {
        const res = await fetch(`${API}/voice/running`);
        const data = await res.json();
        setVoiceRunning(data.running);
      } catch {}
    };

    fetchUpdates();
    checkVoice();
    const updatesInterval = setInterval(fetchUpdates, 15000);
    const voiceInterval = setInterval(checkVoice, 3000);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/voice-status`);
        const data = await res.json();
        setIsListening(data.listening);
        setIsSpeaking(data.speaking);
        if (data.transcript && data.transcript !== lastTranscriptRef.current) {
          lastTranscriptRef.current = data.transcript;
          const convId = activeIdRef.current || generateId();
          if (!activeIdRef.current) {
            const conv: Conversation = { id: convId, title: data.transcript.slice(0, 40), messages: [], createdAt: Date.now() };
            setConversations(prev => [conv, ...prev]);
            setActiveId(convId);
            activeIdRef.current = convId;
          }
          addMessageToConv(convId, { role: "user", content: data.transcript, source: "voice", timestamp: Date.now() });
        }
        if (data.response && data.response !== lastResponseRef.current && data.response !== '' && data.speaking) {
          lastResponseRef.current = data.response;
          const convId = activeIdRef.current;
          if (convId) addMessageToConv(convId, { role: "assistant", content: data.response, source: "voice", timestamp: Date.now() });
          setTimeout(() => { if (lastResponseRef.current === data.response) lastResponseRef.current = ''; }, 5000);
        }
      } catch {}
    }, 400);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => {});

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then(stream => {
        cameraStreamRef.current = stream;
        setCameraActive(true);
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        video.addEventListener('loadeddata', async () => {
          try {
            ctx.drawImage(video, 0, 0, 640, 480);
            const frame = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            latestCameraFrameRef.current = frame;
            await fetch(`${API}/camera-frame`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved}` }, body: JSON.stringify({ frame }) });
          } catch {}
        });
        cameraIntervalRef.current = setInterval(async () => {
          try {
            ctx.drawImage(video, 0, 0, 640, 480);
            const frame = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            latestCameraFrameRef.current = frame;
            await fetch(`${API}/camera-frame`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved}` }, body: JSON.stringify({ frame }) });
          } catch {}
        }, 5000);
      }).catch(() => { setCameraActive(false); });

    return () => {
      clearInterval(interval); clearInterval(updatesInterval); clearInterval(voiceInterval);
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
      if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    };
  }, [token]);

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  
  // For large folders, process in batches to avoid freezing UI
  const MAX = 200;
  const toProcess = files.slice(0, MAX);
  
  for (const file of toProcess) {
    // Skip files over 10MB
    if (file.size > 10 * 1024 * 1024) continue;
    await new Promise<void>(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachedFiles(prev => [...prev, { 
          data: base64, 
          type: file.type || 'application/octet-stream', 
          name: (file as any).webkitRelativePath || file.name 
        }]);
        resolve();
      };
      reader.onerror = () => resolve(); // skip broken files
      reader.readAsDataURL(file);
    });
  }
  e.target.value = '';
};

  function newConversation() {
    const id = generateId();
    const conv: Conversation = { id, title: 'New conversation', messages: [], createdAt: Date.now() };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    activeIdRef.current = id;
    setSidebarOpen(false);
    fetch(`${API}/reset`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }

  function deleteConversation(id: string) {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (activeId === id) {
        const newActive = filtered.length > 0 ? filtered[0].id : null;
        setActiveId(newActive);
        activeIdRef.current = newActive;
      }
      localStorage.setItem('jarvis_conversations', JSON.stringify(filtered));
      return filtered;
    });
  }

  const toggleVoice = async () => {
    if (voiceRunning) {
      await fetch(`${API}/voice/stop`, { method: "POST" });
      setVoiceRunning(false); setVoiceBubbleVisible(false);
    } else {
      await fetch(`${API}/voice/start`, { method: "POST" });
      setVoiceRunning(true); setVoiceBubbleVisible(true);
    }
  };

  const handleAuth = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/signup';
      const body = authMode === 'login'
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, name: authName };
      const res = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      localStorage.setItem('jarvis_token', data.token);
      localStorage.setItem('jarvis_name', data.name);
      setToken(data.token); setUserName(data.name);
      const id = generateId();
      setConversations([{ id, title: 'New conversation', messages: [], createdAt: Date.now() }]);
      setActiveId(id); activeIdRef.current = id;
    } catch (e: any) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('jarvis_token');
    localStorage.removeItem('jarvis_name');
    localStorage.removeItem('jarvis_conversations');
    setToken(null); setUserName(''); setConversations([]); setActiveId(null); activeIdRef.current = null;
  };

  const markAllRead = async () => {
    await fetch(`${API}/proactive-updates/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setUpdates(prev => prev.map(u => ({ ...u, read: true }))); setUnreadCount(0);
  };

  const addDailyCheck = async () => {
    if (!newCheckInput.trim()) return;
    const label = newCheckInput.trim(); setNewCheckInput("");
    const check: DailyCheck = { id: Date.now(), label, status: "processing", lastResult: "", expanded: false, followUp: "" };
    setDailyChecks(prev => [...prev, check]);
    try {
      const res = await fetch(`${API}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: `${label} — check this every day and send a proactive_update with the result` }) });
      const data = await res.json();
      setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "done", lastResult: data.message || "Done." } : c));
    } catch { setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "idle", lastResult: "Failed." } : c)); }
  };

  const runFollowUp = async (check: DailyCheck) => {
    if (!check.followUp.trim()) return;
    setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "processing", followUp: "" } : c));
    try {
      const res = await fetch(`${API}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: `Regarding my daily check "${check.label}": ${check.followUp}` }) });
      const data = await res.json();
      setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "done", lastResult: data.message || "Done." } : c));
    } catch {}
  };

  const send = async () => {
  if (!input.trim() || loading) return;
  const userMsg = input.trim();
  const filesToSend = attachedFiles;
  setInput(""); setAttachedFiles([]);

  let convId = activeIdRef.current;
  if (!convId || !conversations.find(c => c.id === convId)) {
    convId = generateId();
    setConversations(prev => [{ id: convId!, title: userMsg.slice(0, 40), messages: [], createdAt: Date.now() }, ...prev]);
    setActiveId(convId); activeIdRef.current = convId;
  } else {
    setConversations(prev => prev.map(c => c.id === convId && c.messages.length === 0 ? { ...c, title: userMsg.slice(0, 40) } : c));
  }
  const finalConvId = convId!;

  addMessageToConv(finalConvId, { role: "user", content: userMsg, source: "text", timestamp: Date.now(), imageUrl: filesToSend[0]?.type.startsWith('image/') ? `data:${filesToSend[0].type};base64,${filesToSend[0].data}` : undefined, fileName: filesToSend[0]?.name });

  setLoading(true);
  try {
    const res = await fetch(`${API}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: userMsg, attachedFiles: filesToSend }) });
    const data = await res.json();
    if (data.message === 'On it.') {
      addMessageToConv(finalConvId, { role: "assistant", content: "On it...", source: "text", timestamp: Date.now() });
    } else if (data.message) {
      addMessageToConv(finalConvId, { role: "assistant", content: data.message, source: "text", timestamp: Date.now() });
      const urlMatch = data.message.match(/https:\/\/api\.heyjarvis\.me\/view\/[^\s)]+/);
      if (urlMatch) setTimeout(() => window.open(urlMatch[0], '_blank'), 500);
      const ytMatch = data.message.match(/https:\/\/(www\.)?youtube\.com\/watch\?[^\s<>"')]+/);
      if (ytMatch) { const w = window.open(ytMatch[0], '_blank'); if (w) w.focus(); }
    }
  } catch {}
  setLoading(false);
};

  const orbScale = 1 + (audioLevel / 255) * 0.4;
  const orbBg = isListening ? "radial-gradient(circle at 40% 40%, #34d399, #059669)" : isSpeaking ? "radial-gradient(circle at 40% 40%, #a78bfa, #6d28d9)" : loading ? "radial-gradient(circle at 40% 40%, #a78bfa, #6d28d9)" : "radial-gradient(circle at 40% 40%, #60a5fa, #1d4ed8)";
  const orbGlow = isListening ? `0 0 ${20 + audioLevel / 4}px rgba(52,211,153,0.8)` : isSpeaking ? "0 0 24px rgba(167,139,250,0.8)" : loading ? "0 0 20px rgba(167,139,250,0.6)" : "0 0 16px rgba(96,165,250,0.5)";
  const statusText = isListening ? "Listening..." : isSpeaking ? "Speaking..." : loading ? "Thinking..." : "Ready";

  if (!token) {
    return (
      <div style={{ minHeight: '100dvh' }} className="bg-[#060608] flex items-center justify-center p-4">
        <div className="w-full max-w-4xl flex gap-8 items-center">
          <div className="hidden md:flex flex-col flex-1 pr-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-700" style={{ boxShadow: "0 0 24px rgba(96,165,250,0.5)" }} />
              <span className="text-white text-xl font-semibold tracking-wide">JARVIS</span>
            </div>
            <h1 className="text-white text-3xl font-semibold leading-tight mb-3">Your autonomous<br/>AI assistant</h1>
            <p className="text-white/40 text-sm leading-relaxed mb-10">JARVIS connects to your digital life and acts on your behalf — from managing emails to making phone calls.</p>
            <div className="flex flex-col gap-4">
              {[
                { icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", label: "Gmail & Calendar", desc: "Reads, sends emails and manages your schedule" },
                { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Google Drive & Docs", desc: "Creates and reads your files and documents" },
                { icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z", label: "Phone Calls & SMS", desc: "Makes real calls and sends texts on your behalf" },
                { icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", label: "Builds Websites & Docs", desc: "Generates full websites and documents instantly" },
                { icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9", label: "Web Search & Research", desc: "Finds current information and answers instantly" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8"><path d={item.icon}/></svg>
                  </div>
                  <div>
                    <div className="text-white/80 text-xs font-medium">{item.label}</div>
                    <div className="text-white/30 text-xs mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-full max-w-sm bg-[rgba(8,8,12,0.97)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
            <div className="px-8 pt-8 pb-6 text-center border-b border-white/5">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 mx-auto mb-4 md:hidden" style={{ boxShadow: "0 0 24px rgba(96,165,250,0.5)" }} />
              <div className="text-white text-xl font-semibold tracking-wide">Welcome to JARVIS</div>
              <div className="text-white/30 text-xs mt-1">{authMode === 'login' ? 'Sign in to continue' : 'Create your account'}</div>
            </div>
            <div className="p-8">
              <div className="flex gap-2 mb-6">
                <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${authMode === 'login' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}>Sign In</button>
                <button onClick={() => setAuthMode('signup')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${authMode === 'signup' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}>Sign Up</button>
              </div>
              <div className="flex flex-col gap-3">
                {authMode === 'signup' && <input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your name" style={{ fontSize: '16px' }} className="bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all" />}
                <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email" type="email" style={{ fontSize: '16px' }} className="bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all" />
                <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e => e.key === 'Enter' && handleAuth()} style={{ fontSize: '16px' }} className="bg-white/5 border border-white/10 rounded-xl text-white px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all" />
                {authError && <div className="text-red-400 text-xs px-1">{authError}</div>}
                <button onClick={handleAuth} disabled={authLoading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-all mt-1">
                  {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', fontFamily: "-apple-system, 'SF Pro Display', sans-serif" }} className="bg-[#060608] flex overflow-hidden">
      {/* Voice Mode Modal */}
      {showSettings && (
  <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
    <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="text-white font-semibold">Settings</div>
        <button onClick={() => setShowSettings(false)} className="text-white/30 hover:text-white/60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/3">
        <div className="text-white/40 text-xs mb-1">Account</div>
        <div className="text-white font-medium">{userName}</div>
        <div className={`text-sm mt-1 ${subscribed ? 'text-green-400' : 'text-yellow-400'}`}>
          {subscribed ? 'Pro — Active' : 'Free Plan'}
        </div>
      </div>
      {!subscribed && (
        <div className="mb-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <div className="text-white font-medium mb-1">Upgrade to Pro</div>
          <div className="text-white/40 text-xs mb-3">$25/month — unlimited messages, all features</div>
          <button
            onClick={async () => {
  setCheckingOut(true);
  localStorage.setItem('jarvis_subscribed', 'true');
  const res = await fetch(`${API}/create-checkout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  setCheckingOut(false);
}}
            disabled={checkingOut}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-all"
          >
            {checkingOut ? 'Loading...' : 'Upgrade Now — $25/mo'}
          </button>
        </div>
      )}
    </div>
  </div>
)}
      {voiceModeOpen && token && (
        <VoiceModeModal
          token={token}
          userName={userName}
          onClose={() => setVoiceModeOpen(false)}
          onMessageSent={handleVoiceModeMessage}
        />
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/70 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <div
        className="fixed md:relative inset-y-0 left-0 z-40 md:z-auto flex flex-col bg-[#07070a] border-r border-white/5 transition-transform duration-300"
        style={{ width: '260px', transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', height: '100dvh' }}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-700" style={{ boxShadow: "0 0 12px rgba(96,165,250,0.5)" }} />
            <span className="text-white text-sm font-semibold tracking-wide">JARVIS</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <button onClick={newConversation} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-300 text-xs font-medium transition-all mb-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New conversation
          </button>

          {/* Voice Mode Button */}
          <button
            onClick={() => { setVoiceModeOpen(true); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all mb-2 bg-gradient-to-r from-blue-600/20 via-purple-600/15 to-pink-600/20 border-white/10 text-white/70 hover:text-white hover:border-white/20"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            Voice mode
          </button>

          <a
            href={`${API}/auth/google?token=${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all mb-2 ${googleConnected ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}
          >
            <div className={`w-2 h-2 rounded-full ${googleConnected ? 'bg-green-400' : 'bg-white/20'}`} />
            {googleConnected ? 'Google connected' : 'Connect Google'}
          </a>

          {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
            <button onClick={toggleVoice} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all mb-2 ${voiceRunning ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}>
              <div className={`w-2 h-2 rounded-full ${voiceRunning ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
              {voiceRunning ? 'Voice active — stop' : 'Start voice'}
            </button>
          )}

          <button
            onClick={async () => {
              const res = await fetch(`${API}/voice/spoken-updates`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              const data = await res.json();
              setSpokenUpdates(data.enabled);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${spokenUpdates ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}
          >
            <div className={`w-2 h-2 rounded-full ${spokenUpdates ? 'bg-purple-400 animate-pulse' : 'bg-white/20'}`} />
            {spokenUpdates ? 'Spoken updates — on' : 'Spoken updates — off'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
          <div className="text-white/20 text-xs uppercase tracking-widest mb-2 px-1">Conversations</div>
          {conversations.length === 0 && <div className="text-white/20 text-xs px-1 py-2">No conversations yet</div>}
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-all ${conv.id === activeId ? 'bg-white/8 text-white/90' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`}
              onClick={() => { setActiveId(conv.id); activeIdRef.current = conv.id; setSidebarOpen(false); }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 opacity-50">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="text-xs flex-1 truncate">{conv.title}</span>
              <button onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-red-400 p-1 flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-white/5 flex items-center gap-2.5 flex-shrink-0">
  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
    {userName.charAt(0).toUpperCase()}
  </div>
  <div className="flex-1 min-w-0">
    <div className="text-white/70 text-xs font-medium truncate">{userName}</div>
    <div className={`text-xs ${subscribed ? 'text-green-400' : 'text-yellow-400'}`}>
      {subscribed ? 'Pro' : 'Free'}
    </div>
  </div>
  <button onClick={() => setShowSettings(true)} className="text-white/25 hover:text-white/50 transition-all p-1">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>
  <button onClick={logout} className="text-white/25 hover:text-white/50 transition-all p-1">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  </button>
</div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ height: '100dvh' }}>
        {/* Top bar */}
        <div className="px-3 py-3 flex items-center gap-2 border-b border-white/5 flex-shrink-0 bg-[#060608]">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all text-white/40 hover:text-white/70 flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full flex-shrink-0 transition-all duration-100" style={{ background: orbBg, boxShadow: orbGlow, transform: `scale(${orbScale})` }} />
            <div className="min-w-0">
              <div className="text-white/85 text-sm font-medium leading-none">JARVIS</div>
              <div className="text-white/30 text-xs mt-0.5">{statusText}</div>
            </div>
          </div>
          {cameraActive && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 flex-shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/30 text-xs">cam</span>
            </div>
          )}
          {/* Voice mode button in top bar (mobile shortcut) */}
          <button
            onClick={() => setVoiceModeOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all flex-shrink-0"
            title="Voice mode"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button onClick={logout} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all text-white/30 hover:text-white/60 flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
          <button onClick={() => { setShowUpdates(!showUpdates); if (!showUpdates) markAllRead(); }} className="relative w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-blue-500 rounded-full text-white flex items-center justify-center font-bold" style={{ fontSize: '9px' }}>{unreadCount}</span>
            )}
          </button>
        </div>

        {/* Updates panel */}
        {showUpdates && (
          <div className="absolute inset-0 md:inset-auto md:top-[53px] md:right-0 md:w-80 md:h-[calc(100dvh-53px)] bg-[rgba(6,6,8,0.99)] border-l border-white/5 z-20 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white/40 text-xs uppercase tracking-widest font-medium">Daily Checks</div>
                  <button onClick={() => setShowUpdates(false)} className="text-white/40 hover:text-white/70 text-xs transition-all flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Close
                  </button>
                </div>
                {dailyChecks.length === 0 && <div className="text-white/20 text-xs py-2">No checks yet</div>}
                {dailyChecks.map(check => (
                  <div key={check.id} className="mb-2 rounded-xl border border-white/7 overflow-hidden">
                    <button onClick={() => setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, expanded: !c.expanded } : c))}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-all text-left">
                      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        {check.status === "processing" ? <div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                          : check.status === "done" ? <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center"><svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
                          : <div className="w-3.5 h-3.5 rounded-full border border-white/20" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/80 text-xs font-medium truncate">{check.label}</div>
                        {check.status === "done" && !check.expanded && <div className="text-white/30 text-xs mt-0.5 truncate">{check.lastResult}</div>}
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" className={`flex-shrink-0 transition-transform ${check.expanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    {check.expanded && (
                      <div className="px-4 pb-3 border-t border-white/5">
                        {check.lastResult && <div className="text-white/60 text-xs py-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatMessage(check.lastResult) }} />}
                        <div className="flex gap-2 mt-1">
                          <input value={check.followUp} onChange={e => setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, followUp: e.target.value } : c))}
                            onKeyDown={e => e.key === 'Enter' && runFollowUp(check)} placeholder="Ask a follow-up..."
                            style={{ fontSize: '16px' }}
                            className="flex-1 bg-white/5 border border-white/8 rounded-lg text-white text-xs px-3 py-2 outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all" />
                          <button onClick={() => runFollowUp(check)} className="px-3 py-2 bg-blue-600/40 hover:bg-blue-600/60 border border-blue-500/20 rounded-lg text-blue-300 text-xs transition-all">Ask</button>
                        </div>
                        <button onClick={() => setDailyChecks(prev => prev.filter(c => c.id !== check.id))} className="mt-2 text-red-400/40 hover:text-red-400/70 text-xs transition-all">Remove</button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <input value={newCheckInput} onChange={e => setNewCheckInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDailyCheck()}
                    placeholder="Check the weather every day..."
                    style={{ fontSize: '16px' }}
                    className="flex-1 bg-white/5 border border-white/8 rounded-xl text-white text-xs px-3 py-2.5 outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all" />
                  <button onClick={addDailyCheck} disabled={!newCheckInput.trim()} className="px-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl text-white text-xs transition-all font-medium">Add</button>
                </div>
              </div>
              <div className="mx-4 my-3 border-t border-white/5" />
              <div className="px-4 pb-4">
                <div className="text-white/40 text-xs uppercase tracking-widest mb-3 font-medium">JARVIS Updates</div>
                {updates.length === 0 ? <div className="text-white/20 text-xs py-2">JARVIS is watching...</div>
                  : updates.map(update => (
                    <div key={update.id} className={`mb-2 px-4 py-3 rounded-xl text-xs border leading-relaxed ${update.read ? 'bg-white/2 border-white/5 text-white/40' : 'bg-blue-500/8 border-blue-500/20 text-white/80'}`}>
                      <div>{update.message}</div>
                      <div className="mt-1.5 opacity-40">{update.time} · {update.date}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="px-3 py-4 flex flex-col gap-3">
            {voiceRunning && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative flex items-center justify-center mb-6">
                  {isListening && (
                    <>
                      <div className="absolute w-40 h-40 rounded-full animate-ping" style={{ background: 'rgba(52,211,153,0.08)', animationDuration: '2s' }} />
                      <div className="absolute w-28 h-28 rounded-full animate-ping" style={{ background: 'rgba(52,211,153,0.12)', animationDuration: '1.5s' }} />
                    </>
                  )}
                  {isSpeaking && (
                    <>
                      <div className="absolute w-40 h-40 rounded-full animate-ping" style={{ background: 'rgba(167,139,250,0.08)', animationDuration: '1.8s' }} />
                      <div className="absolute w-28 h-28 rounded-full animate-ping" style={{ background: 'rgba(167,139,250,0.12)', animationDuration: '1.2s' }} />
                    </>
                  )}
                  <div className="w-24 h-24 rounded-full transition-all duration-100" style={{ background: orbBg, boxShadow: `${orbGlow}, inset 0 0 40px rgba(255,255,255,0.05)`, transform: `scale(${1 + (audioLevel / 255) * 0.3})` }} />
                </div>
                <div className="text-white/60 text-base font-medium mb-1">{statusText}</div>
                <div className="flex items-center gap-1 h-6 mt-3">
                  {[...Array(10)].map((_, i) => {
                    const h = isListening || audioLevel > 10 ? Math.max(2, (audioLevel / 255) * 24 * (0.3 + Math.sin(i * 0.8) * 0.7)) : isSpeaking ? 3 + Math.abs(Math.sin(Date.now() / 150 + i * 0.6)) * 16 : 2;
                    return <div key={i} className="w-1 rounded-full transition-all duration-75" style={{ height: `${h}px`, background: isListening ? '#34d399' : isSpeaking ? '#a78bfa' : 'rgba(255,255,255,0.1)' }} />;
                  })}
                </div>
                <button onClick={() => setVoiceRunning(false)} className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/40 hover:text-white/60 text-xs transition-all">View chat</button>
              </div>
            )}

            {messages.length === 0 && !voiceRunning && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-14 h-14 rounded-full mb-4 flex-shrink-0" style={{ background: orbBg, boxShadow: orbGlow }} />
                <div className="text-white/60 text-lg font-medium mb-1">Good to see you, {userName}.</div>
                <div className="text-white/25 text-sm">{cameraActive ? "I can see your camera feed." : "Ready to help."}</div>
              </div>
            )}

            {!voiceRunning && messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full flex-shrink-0 mt-1" style={{ background: orbBg, boxShadow: orbGlow }} />
                )}
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "assistant" ? "bg-white/5 border border-white/7 text-white/85 rounded-tl-sm" : "bg-blue-600 text-white rounded-tr-sm"}`}>
                  {msg.source === "voice" && <div className="text-xs opacity-40 mb-1">{msg.role === "user" ? "voice" : "spoken"}</div>}
                  {msg.fileName && !msg.imageUrl && (
                    <div className="flex items-center gap-1.5 mb-2 opacity-70">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      <span className="text-xs">{msg.fileName}</span>
                    </div>
                  )}
                  <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                  {msg.imageUrl && <img src={msg.imageUrl} alt={msg.fileName || 'attachment'} className="mt-2 rounded-xl max-w-full" style={{ maxHeight: '200px', objectFit: 'contain' }} />}
                  {msg.role === 'assistant' && renderMessageExtras(msg.content, (prompt) => {
                    setInput(prompt);
                    setTimeout(() => send(), 50);
                  })}
                </div>
              </div>
            ))}

            {loading && !voiceRunning && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex-shrink-0 mt-1" style={{ background: orbBg }} />
                <div className="bg-white/5 border border-white/7 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(delay => <span key={delay} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
{/* Attached file preview */}
        {attachedFiles.length > 0 && (
          <div className="px-3 pt-2 flex-shrink-0 bg-[#060608]">
            <div className="flex items-center gap-2 flex-wrap">
              {Array.from(new Set(
                attachedFiles
                  .filter(f => f.name.includes('/'))
                  .map(f => f.name.substring(0, f.name.indexOf('/')))
              )).map(folderName => (
                <div key={folderName} className="flex items-center gap-2">
                  <div className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="text-white/70 text-xs font-medium">{folderName}</span>
                    <span className="text-white/25 text-xs">{attachedFiles.filter(f => f.name.startsWith(folderName + '/')).length} files</span>
                  </div>
                  <button onClick={() => setAttachedFiles(prev => prev.filter(f => !f.name.startsWith(folderName + '/')))} className="text-white/30 hover:text-white/60 p-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
              {attachedFiles.filter(f => !f.name.includes('/')).map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  {f.type.startsWith('image/') ? (
                    <img src={`data:${f.type};base64,${f.data}`} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-white/10" />
                  ) : (
                    <div className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
                      <span className="text-white/50 text-xs truncate max-w-[100px]">{f.name}</span>
                    </div>
                  )}
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="text-white/30 hover:text-white/60 p-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
<div className="flex-shrink-0 bg-[#060608] border-t border-white/5 px-3 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
  <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.js,.ts,.py,.md,.json,.csv,.doc,.docx" onChange={handleFileAttach} className="hidden" />
  <input ref={folderInputRef} type="file" multiple onChange={handleFileAttach} className="hidden" {...{ webkitdirectory: 'true' } as any} />
  <div className="flex items-center gap-2">
    <div className="flex flex-col gap-1 flex-shrink-0">
      <button onClick={() => fileInputRef.current?.click()} className="w-11 h-5 flex items-center justify-center rounded-t-xl hover:bg-white/5 transition-all text-white/30 hover:text-white/60" title="Attach files">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <button onClick={() => folderInputRef.current?.click()} className="w-11 h-5 flex items-center justify-center rounded-b-xl hover:bg-white/5 transition-all text-white/30 hover:text-white/60" title="Attach folder">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </div>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Message JARVIS..."
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              style={{ fontSize: '16px' }}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl text-white px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all min-w-0"
            />
            <button
  onClick={send}
  disabled={loading || (!input.trim() && attachedFiles.length === 0)}
  className="w-11 h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
  title={subscribed ? 'Send' : 'Upgrade to Pro to send messages'}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
</button>
          </div>
        </div>
      </div>
    </div>
  );
}