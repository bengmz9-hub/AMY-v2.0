// Shared portrait/composition contract. Root owns this file.
export const PORTRAIT_SCALE = .78;
export const portraitScaleForWidth = width => width < 700 ? .66 : PORTRAIT_SCALE;
export const SOCIALS = [
  { id: 'kick', label: 'Kick' },
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'starvios', label: 'Starvios' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
];
