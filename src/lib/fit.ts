import { useThree } from '@react-three/fiber'

/** Scale factor that keeps a ~5-unit-wide centred object inside narrow (portrait) viewports. */
export function usePortraitScale(k = 1.15) {
  const { width, height } = useThree((s) => s.size)
  return Math.min(1, (width / height) * k)
}
