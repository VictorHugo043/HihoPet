export const voiceCatalog = [
  { file: 'heeho-1', text: 'Hi-ho!', kind: 'greeting' },
  { file: 'voice-hello', text: 'Hee-ho～', kind: 'greeting' },
  { file: 'voice-bright', text: 'Hi-ho!', kind: 'greeting' },
  { file: 'voice-double', text: 'Hee-ho! Hee-ho!', kind: 'greeting' },
  { file: 'voice-dizzy', text: 'Hee… ho…', kind: 'dizzy' },
  { file: 'voice-angry', text: 'Hee-hah!!', kind: 'angry' }
] as const;

export const greetingCount = voiceCatalog.filter(voice => voice.kind === 'greeting').length;
export const dizzyVoice = voiceCatalog.findIndex(voice => voice.kind === 'dizzy');
export const angryVoice = voiceCatalog.findIndex(voice => voice.kind === 'angry');
