/**
 * Illustrated portraits for the About page.
 *
 * These replaced two Unsplash photographs of strangers that stood in for the
 * two real people named on the page. A stock portrait presented as a team
 * member is a small lie; an illustration is obviously a representation, which
 * is the honest way to give a two-person team a face.
 *
 * Inline SVG rather than asset files: two flat drawings are a few hundred bytes
 * of markup each, they need no request, they scale to any card width without a
 * srcset, and they inherit the page's own palette. No image dependency, no
 * external URL, nothing to optimise later.
 *
 * Both figures are drawn from one vocabulary — same field, same geometry, same
 * limited palette, same linework — so the pair reads as one commissioned set.
 * They are deliberately not likenesses: no identity matching is attempted, and
 * the flat shapes and single skin tone keep them unmistakably illustrations.
 */
const C = {
  field: '#ddd6fe', // violet-200, the disc the figure sits on
  shape: '#c4b5fd', // violet-300, atmospheric marks
  ink: '#2e1065', // violet-950, hair and linework
  skin: '#f2d3bd',
  skinShade: '#e3bda4',
  garment: '#7c3aed',
  garmentDeep: '#5b21b6',
  accent: '#9333ea',
  paper: '#ffffff',
};

type Props = { className?: string };

/** The parts both figures share, so the two drawings cannot drift apart. */
const Face = ({ children }: { children?: React.ReactNode }) => (
  <>
    {/* neck, tucked behind the shoulders */}
    <rect x="149" y="146" width="22" height="36" rx="11" fill={C.skinShade} />
    {/* shoulders */}
    <path d="M84 250 C84 206 118 180 160 180 C202 180 236 206 236 250 Z" fill={C.garment} />
    <path
      d="M144 183 L160 201 L176 183"
      fill="none"
      stroke={C.garmentDeep}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* face */}
    <circle cx="160" cy="124" r="36" fill={C.skin} />
    {children}
    <circle cx="148" cy="124" r="3.2" fill={C.ink} />
    <circle cx="172" cy="124" r="3.2" fill={C.ink} />
    <path
      d="M141 113 q7 -4.5 13 -1.5"
      fill="none"
      stroke={C.ink}
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M166 111.5 q6 -3 13 1.5"
      fill="none"
      stroke={C.ink}
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M151 138 q9 8 18 0"
      fill="none"
      stroke={C.ink}
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </>
);

const Field = () => (
  <>
    <circle cx="160" cy="134" r="94" fill={C.field} />
    <circle cx="52" cy="54" r="15" fill={C.shape} />
    <circle cx="279" cy="204" r="9" fill={C.shape} />
    <path
      d="M24 196 q22 -16 44 -4"
      fill="none"
      stroke={C.shape}
      strokeWidth="3"
      strokeLinecap="round"
    />
  </>
);

/** Project lead — the planning side of the product. */
export const KhushiIllustration = ({ className = '' }: Props) => (
  <svg
    viewBox="0 0 320 250"
    className={className}
    role="img"
    aria-label="Illustrated portrait of Khushi Saroha"
  >
    <Field />

    {/* A planning board, behind the figure so she stands in front of it. */}
    <g transform="rotate(-9 66 130)">
      <rect
        x="34"
        y="94"
        width="64"
        height="76"
        rx="11"
        fill={C.paper}
        stroke={C.ink}
        strokeWidth="2.5"
      />
      <rect x="46" y="108" width="26" height="6" rx="3" fill={C.accent} />
      <rect x="46" y="123" width="40" height="4.5" rx="2.25" fill={C.shape} />
      <rect x="46" y="134" width="33" height="4.5" rx="2.25" fill={C.shape} />
      <circle cx="51" cy="153" r="5.5" fill="none" stroke={C.accent} strokeWidth="2.4" />
      <path
        d="M48.4 153 l2 2.6 l4.4 -5.2"
        fill="none"
        stroke={C.accent}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>

    {/* long hair, drawn before the face so it frames it */}
    <ellipse cx="160" cy="138" rx="47" ry="56" fill={C.ink} />

    <Face>
      <path
        d="M123 120 C123 95 140 82 160 82 C180 82 197 95 197 120 C197 120 186 102 160 102 C134 102 123 120 123 120 Z"
        fill={C.ink}
      />
    </Face>
  </svg>
);

/** Technical lead — the build side of the product. */
export const TanmayIllustration = ({ className = '' }: Props) => (
  <svg
    viewBox="0 0 320 250"
    className={className}
    role="img"
    aria-label="Illustrated portrait of Tanmay Tyagi"
  >
    <Field />

    {/* An editor panel, behind the figure for the same reason. */}
    <g transform="rotate(8 252 120)">
      <rect
        x="218"
        y="86"
        width="74"
        height="60"
        rx="11"
        fill={C.paper}
        stroke={C.ink}
        strokeWidth="2.5"
      />
      <circle cx="230" cy="99" r="3.2" fill={C.shape} />
      <circle cx="241" cy="99" r="3.2" fill={C.shape} />
      <path
        d="M240 118 l-9 8 l9 8"
        fill="none"
        stroke={C.accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M270 118 l9 8 l-9 8"
        fill="none"
        stroke={C.accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M261 114 l-12 24" stroke={C.shape} strokeWidth="3" strokeLinecap="round" />
    </g>

    {/* cropped hair */}
    <circle cx="160" cy="117" r="40" fill={C.ink} />

    <Face>
      <path
        d="M125 116 C127 93 141 82 160 82 C179 82 193 93 195 116 C195 116 181 98 160 98 C139 98 125 116 125 116 Z"
        fill={C.ink}
      />
    </Face>
  </svg>
);
