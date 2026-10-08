import { useState } from 'react';

// The PNG supplies the actual ink. These wide, invisible strokes only reveal it.
const strokes = [
  ['M237 926 C243 740 263 507 294 349', .55, 0],
  ['M237 926 C218 685 243 306 290 238 C307 179 323 174 336 229 C370 387 399 636 464 867', .75, .48],
  ['M312 735 L366 704', .15, 1.18],
  ['M495 855 L502 754 Q511 736 519 766 L533 827 Q544 792 553 758 Q574 687 583 747 L602 819 Q615 829 632 812', .45, 1.32],
  ['M679 791 C710 705 712 462 714 116', .45, 1.72],
  ['M714 116 C688 419 741 750 763 959', .55, 2.12],
  ['M778 697 C761 515 793 168 834 65', .42, 2.64],
  ['M834 65 C808 341 826 646 872 869 Q886 901 887 839', .52, 3.01],
  ['M878 497 L868 663 C891 676 916 612 938 585 Q960 551 964 586 Q966 624 980 622', .4, 3.48],
  ['M975 591 C1009 565 1033 590 1028 550 C1026 522 1043 486 1061 488 Q1096 492 1067 529 Q1043 562 1116 542 C1152 532 1185 491 1178 470', .5, 3.84],
  ['M1178 476 Q1212 451 1178 437 Q1151 435 1165 410 C1187 438 1268 409 1273 448 Q1277 480 1208 553 Q1304 493 1354 484', .5, 4.3],
];

export default function AmySignature({ id, src }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="amy-signature-fallback">AMY.</span>;

  return (
    <svg className="amy-signature" viewBox="170 0 1260 1024" role="img" aria-label="Firma manuscrita de AMY">
      <defs>
        <mask id={`${id}-ink`} x="0" y="0" width="1536" height="1024" maskUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
          <image href={src} width="1536" height="1024" onError={() => setFailed(true)} />
        </mask>
        <mask id={`${id}-write`} x="0" y="0" width="1536" height="1024" maskUnits="userSpaceOnUse">
          <g fill="none" stroke="white" strokeWidth="95" strokeLinecap="round" strokeLinejoin="round">
            {strokes.map(([d, duration, delay], index) => <path key={index} className="amy-signature-stroke" d={d} pathLength="1" style={{ '--write-duration': `${duration}s`, '--write-delay': `${delay}s` }} />)}
          </g>
        </mask>
      </defs>
      <g mask={`url(#${id}-ink)`}>
        <rect width="1536" height="1024" fill="currentColor" mask={`url(#${id}-write)`} />
      </g>
    </svg>
  );
}
