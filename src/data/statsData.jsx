import { PROFILE } from '@/data/profile.js';

export const STATS_DATA = [
  {
    value: PROFILE.hoursPlayed,
    label: 'Horas Jugadas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
        <path d="M12 2v2" />
      </svg>
    ),
  },
  {
    value: PROFILE.rank,
    label: 'Rango Actual',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7L12 2z" />
        <path d="M12 8v4" />
        <path d="M12 16l2-2" />
      </svg>
    ),
  },
];
