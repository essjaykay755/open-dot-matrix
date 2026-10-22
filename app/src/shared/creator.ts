export const CREATOR_NAME = 'Subhojit Karmakar'
export const CREATOR_HANDLE = 'essjaykay755'

export const CREATOR_PROFILES = {
  github: { label: 'GitHub', url: `https://github.com/${CREATOR_HANDLE}` },
  x: { label: 'X / Twitter', url: `https://x.com/${CREATOR_HANDLE}` }
} as const

export type CreatorProfile = keyof typeof CREATOR_PROFILES
