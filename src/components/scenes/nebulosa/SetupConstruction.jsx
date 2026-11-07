import { useId } from 'react';
import './SetupConstruction.css';

export default function SetupConstruction() {
  const id = `setup-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fill = name => `url(#${id}-${name})`;

  return <>
    <header className="setup-construction__heading">
      <p className="setup-construction__overline">04 / SU ESPACIO</p>
      <h2 className="setup-construction__title" id="amy-about-heading">SETUP</h2>
      <p className="setup-construction__status" lang="en">UNDER CONSTRUCTION</p>
    </header>

    <figure className="setup-construction__figure">
      <svg className="setup-construction__desk" viewBox="0 0 1200 660" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-titanium`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#635b57" />
            <stop offset=".28" stopColor="#302e2d" />
            <stop offset=".68" stopColor="#161819" />
            <stop offset="1" stopColor="#4f423b" />
          </linearGradient>
          <linearGradient id={`${id}-worktop`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#393633" />
            <stop offset=".48" stopColor="#211f1f" />
            <stop offset="1" stopColor="#4c3e37" />
          </linearGradient>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#66544a" />
            <stop offset=".2" stopColor="#d3b59a" />
            <stop offset=".52" stopColor="#a37b6c" />
            <stop offset=".8" stopColor="#c7a586" />
            <stop offset="1" stopColor="#51443f" />
          </linearGradient>
          <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#25211e" />
            <stop offset=".55" stopColor="#141414" />
            <stop offset="1" stopColor="#201a19" />
          </linearGradient>
          <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ead6c3" stopOpacity=".1" />
            <stop offset=".5" stopColor="#ead6c3" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-halo`}>
            <stop stopColor="#b48260" stopOpacity=".14" />
            <stop offset="1" stopColor="#b48260" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-floor`}>
            <stop stopColor="#bc8e70" stopOpacity=".12" />
            <stop offset="1" stopColor="#bc8e70" stopOpacity="0" />
          </radialGradient>
          <pattern id={`${id}-stripe`} width="22" height="12" patternUnits="userSpaceOnUse">
            <path d="M-5 12 7 0M17 12 29 0" stroke="#b89979" strokeWidth="4" opacity=".28" />
          </pattern>
        </defs>

        <ellipse cx="600" cy="300" rx="480" ry="290" fill={fill('halo')} />
        <ellipse cx="600" cy="613" rx="485" ry="38" fill={fill('floor')} />

        {/* Structural paths are the only sampled recomposition targets. */}
        <path data-recomposition-path="leg-left" d="M165 434H198L222 601 192 608Z" fill={fill('titanium')} stroke="#9e8574" strokeWidth="1.5" />
        <path data-recomposition-path="leg-right" d="M1002 434H1035L1008 608 978 601Z" fill={fill('titanium')} stroke="#9e8574" strokeWidth="1.5" />
        <path d="M185 606 224 599 244 609 188 619 171 615Z" fill="#3c3531" stroke="#716156" />
        <path d="M976 599 1015 606 1029 615 1012 619 956 609Z" fill="#3c3531" stroke="#716156" />
        <path d="M199 460H1001L997 472H201Z" fill="#191a1b" stroke="#4e4540" />
        <path d="M180 447 202 593M1020 447 998 593" fill="none" stroke="#d1ad8b" strokeOpacity=".28" />

        <path data-recomposition-path="desk" d="M172 350H1028L1120 420Q1125 424 1119 428H81Q75 424 80 420Z" fill={fill('worktop')} stroke={fill('edge')} strokeWidth="2" strokeLinejoin="round" />
        <path data-recomposition-path="desk-edge" d="M81 428H1119V442H81Z" fill="#292425" stroke="#8d7364" strokeWidth="1.3" />
        <path d="M83 429H1117" fill="none" stroke={fill('edge')} strokeWidth="2.5" />
        <path d="M186 359H1014" fill="none" stroke="#ead1b9" strokeOpacity=".14" />
        <path d="M106 438H1094" fill="none" stroke="#0c0c0e" strokeWidth="2" />

        <path d="M573 309H627L635 365H565Z" fill={fill('titanium')} stroke="#8c7969" strokeWidth="1.4" />
        <path d="M552 362H648L688 378H512Z" fill={fill('titanium')} stroke="#a48b74" strokeWidth="1.3" />
        <path d="M515 378H685" fill="none" stroke="#cfb297" strokeOpacity=".45" />

        <path data-recomposition-path="monitor" d="M321 54H879Q892 54 892 67V304Q892 317 879 317H321Q308 317 308 304V67Q308 54 321 54Z" fill={fill('titanium')} stroke={fill('edge')} strokeWidth="2" />
        <rect x="323" y="69" width="554" height="228" rx="3" fill={fill('screen')} stroke="#ad8d75" strokeOpacity=".24" />
        <path d="M326 72H874L648 294H326Z" fill={fill('glass')} />
        <path d="M342 91H858" fill="none" stroke="#e1b791" strokeOpacity=".12" />
        <path d="M342 275H858" fill="none" stroke="#c7a281" strokeOpacity=".14" />
        <rect x="469" y="252" width="262" height="9" rx="1" fill={fill('stripe')} />
        <text className="setup-construction__screen-label" textAnchor="middle">
          <tspan x="600" y="166">UNDER</tspan>{' '}
          <tspan x="600" y="226">CONSTRUCTION</tspan>
        </text>
        <circle cx="864" cy="307" r="1.8" fill="#e6c4a1" opacity=".8" />

        <path d="M422 384H738L774 415H394Z" fill="#101214" stroke="#a48c78" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M395 415H773V420H395Z" fill="#302c2a" stroke="#736154" strokeWidth=".8" />
        <g transform="translate(434 390) skewX(-20)" fill="#a39a8c" opacity=".4">
          {[0, 1].map(row => Array.from({ length: 12 }, (_, column) => <rect key={`${row}-${column}`} x={column * 24} y={row * 8} width="17" height="5" rx="1" />))}
          <rect x="9" y="16" width="35" height="5" rx="1" />
          <rect x="51" y="16" width="164" height="5" rx="1" />
          <rect x="222" y="16" width="49" height="5" rx="1" />
        </g>
        <path d="M818 382H904L938 418H809Z" fill="#20201f" stroke="#a48a72" strokeOpacity=".22" />
        <path d="M856 382C846 382 840 390 841 400L844 408C846 414 869 414 872 407L872 398C871 388 865 382 856 382Z" fill={fill('titanium')} stroke="#b69b81" strokeWidth="1.2" />
        <path d="M856 385 858 396M844 398H870" fill="none" stroke="#d1b799" strokeOpacity=".45" />
      </svg>
      <figcaption className="setup-construction__caption">El espacio de AMY está en preparación.</figcaption>
    </figure>
  </>;
}
