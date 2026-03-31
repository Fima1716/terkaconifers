/**
 * Animated counter: smoothly counts from 0 to target value.
 * Uses requestAnimationFrame for smooth 60fps animation.
 */
export function useAnimatedCount(target: Ref<number> | ComputedRef<number>, duration = 1200) {
  const display = ref(0)
  let animId = 0

  function animate(from: number, to: number) {
    if (animId) cancelAnimationFrame(animId)
    if (to === 0) { display.value = 0; return }
    const start = performance.now()
    const diff = to - from

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      display.value = Math.round(from + diff * eased)
      if (progress < 1) animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
  }

  watch(target, (newVal, oldVal) => {
    animate(oldVal || 0, newVal)
  }, { immediate: true })

  return display
}
