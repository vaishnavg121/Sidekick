export function Icon({
  name,
  size = 18,
}: {
  name:
    | 'search'
    | 'plus'
    | 'settings'
    | 'collapse'
    | 'close'
    | 'star'
    | 'pin'
    | 'arrow'
    | 'globe';
  size?: number;
}) {
  const paths = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    settings: (
      <>
        <path d="m9 4 1-2h4l1 2 2 1 2-.1 2 3-1 2v3l1 2-2 3-2-.1-2 1-1 2h-4l-1-2-2-1-2 .1-2-3 1-2v-3L3 8l2-3 2 .1Z" />
        <circle cx="12" cy="11.5" r="3" />
      </>
    ),
    collapse: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M9 4v16m7-12-4 4 4 4" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
    ),
    pin: (
      <>
        <path d="m9 3 9 9-3 1-2 5-3-3-5-5 5-2Z" />
        <path d="m8 16-5 5" />
      </>
    ),
    arrow: <path d="m8 5 7 7-7 7" />,
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
