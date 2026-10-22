import { MusicSignal } from './shared/music-signal.js';

const button = document.querySelector<HTMLButtonElement>('#start')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let stream: MediaStream | undefined;
let context: AudioContext | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;

function stop(): void {
  generation++;
  if (timer) clearInterval(timer);
  timer = undefined;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  void context?.close(); context = undefined;
  window.hiho.music({ active: false, energy: 0, phase: 0, pulse: 0 });
}
button.addEventListener('click', async () => {
  button.disabled = true;
  const run = ++generation;
  try {
    await window.hiho.authorizeMusic();
    const capture = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
    });
    capture.getVideoTracks().forEach(track => { track.stop(); capture.removeTrack(track); });
    if (run !== generation) { capture.getTracks().forEach(track => track.stop()); return; }
    if (!capture.getAudioTracks().length) { capture.getTracks().forEach(track => track.stop()); throw new Error('No system audio'); }
    stream = capture;
    context = new AudioContext({ latencyHint: 'interactive' }); await context.resume();
    const source = context.createMediaStreamSource(capture);
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    source.connect(analyser);
    const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 40; highpass.Q.value = Math.SQRT1_2;
    const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 180; lowpass.Q.value = Math.SQRT1_2;
    const bassAnalyser = context.createAnalyser(); bassAnalyser.fftSize = 1024;
    source.connect(highpass).connect(lowpass).connect(bassAnalyser);
    const wave = new Float32Array(analyser.fftSize), bassWave = new Float32Array(bassAnalyser.fftSize);
    // The macOS loopback buffer precedes analysis by about 70 ms. Predict in
    // audible time so the seated compression reaches the beat, not its capture.
    const signal = new MusicSignal(0.07);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(wave); bassAnalyser.getFloatTimeDomainData(bassWave);
      let square = 0; for (const sample of wave) square += sample * sample;
      let bassSquare = 0; for (const sample of bassWave) bassSquare += sample * sample;
      const value = signal.update(Math.sqrt(square / wave.length), Math.sqrt(bassSquare / bassWave.length), performance.now() / 1000);
      window.hiho.music({ active: true, ...value });
    }, 1000 / 60);
    capture.getAudioTracks()[0].addEventListener('ended', () => { stop(); button.disabled = false; status.textContent = '聆听已结束，随时可以再来一首。'; });
    window.hiho.music({ active: true, energy: 0, phase: 0, pulse: 0 });
    status.textContent = '正在聆听系统音乐。右键 Hiho 可停止。';
  } catch {
    stop(); button.disabled = false;
    status.textContent = '暂时没能取得系统音频。请在系统设置的“隐私与安全性”中允许 Hiho 录制系统音频，再重试。';
  }
});
window.addEventListener('beforeunload', stop);
