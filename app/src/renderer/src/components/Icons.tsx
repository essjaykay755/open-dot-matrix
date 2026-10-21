import type { JSX, SVGProps } from 'react'

export type IconName =
  | 'matrix'
  | 'bluetooth'
  | 'bolt'
  | 'power'
  | 'power-off'
  | 'flip'
  | 'clock'
  | 'image'
  | 'gif'
  | 'text'
  | 'sliders'
  | 'upload'
  | 'close'
  | 'check'
  | 'refresh'
  | 'chevron'
  | 'play'
  | 'stop'
  | 'reset'
  | 'monitor'
  | 'spark'
  | 'palette'
  | 'timer'
  | 'scoreboard'
  | 'menu'
  | 'sun'
  | 'activity'
  | 'cloud'
  | 'search'
  | 'pin'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, ...props }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths(name)}
    </svg>
  )
}

function paths(name: IconName): JSX.Element {
  switch (name) {
    case 'matrix':
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <path d="M14 17.5h7" />
        </>
      )
    case 'bluetooth':
      return <path d="m7 7 10 10-5 4V3l5 4L7 17" />
    case 'bolt':
      return <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    case 'power':
      return (
        <>
          <path d="M12 2v9" />
          <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
        </>
      )
    case 'power-off':
      return (
        <>
          <path d="M12 2v9" />
          <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
          <path d="m4 4 16 16" />
        </>
      )
    case 'flip':
      return (
        <>
          <path d="M8 3 3 8l5 5" />
          <path d="M3 8h11a6 6 0 0 1 6 6v3" />
          <path d="m17 14 3 3 3-3" />
        </>
      )
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )
    case 'image':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="m4 18 5-5 4 4 3-3 4 4" />
        </>
      )
    case 'gif':
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
          <path d="M12 10v4" />
          <path d="M15 14v-4h3" />
          <path d="M15 12h2" />
        </>
      )
    case 'text':
      return (
        <>
          <path d="M5 5h14" />
          <path d="M12 5v14" />
          <path d="M8 19h8" />
        </>
      )
    case 'sliders':
      return (
        <>
          <path d="M4 6h10" />
          <path d="M18 6h2" />
          <circle cx="16" cy="6" r="2" />
          <path d="M4 12h2" />
          <path d="M10 12h10" />
          <circle cx="8" cy="12" r="2" />
          <path d="M4 18h9" />
          <path d="M17 18h3" />
          <circle cx="15" cy="18" r="2" />
        </>
      )
    case 'upload':
      return (
        <>
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
        </>
      )
    case 'close':
      return (
        <>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </>
      )
    case 'check':
      return <path d="m5 12 4 4L19 6" />
    case 'refresh':
      return (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M6.1 9A7 7 0 0 1 19 12" />
          <path d="M17.9 15A7 7 0 0 1 5 12" />
        </>
      )
    case 'chevron':
      return <path d="m9 6 6 6-6 6" />
    case 'play':
      return <path d="m7 4 13 8-13 8V4Z" />
    case 'stop':
      return <rect x="6" y="6" width="12" height="12" rx="1" />
    case 'reset':
      return (
        <>
          <path d="M4 4v6h6" />
          <path d="M5 10a8 8 0 1 0 2.3-5.7L4 10" />
        </>
      )
    case 'monitor':
      return (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8" />
          <path d="M12 16v4" />
        </>
      )
    case 'spark':
      return (
        <>
          <path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
          <path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z" />
        </>
      )
    case 'palette':
      return (
        <>
          <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H13a2 2 0 0 1 0-4h4.5A3.5 3.5 0 0 0 21 8.5C21 5.5 17 3 12 3Z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
        </>
      )
    case 'timer':
      return (
        <>
          <path d="M10 2h4" />
          <path d="M12 14v-4" />
          <circle cx="12" cy="14" r="8" />
          <path d="m19 5 2 2" />
        </>
      )
    case 'scoreboard':
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M12 5v14" />
          <path d="M7 10h2v4H7" />
          <path d="M16 10h1v4h-1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
        </>
      )
    case 'menu':
      return (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </>
      )
    case 'activity':
      return <path d="M3 12h4l3-8 4 16 3-8h4" />
    case 'cloud':
      return <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.8 8.5 4.75 4.75 0 0 1 17.25 18H7Z" />
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.4-4.4" />
        </>
      )
    case 'pin':
      return (
        <>
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10" r="2.3" />
        </>
      )
  }
}

