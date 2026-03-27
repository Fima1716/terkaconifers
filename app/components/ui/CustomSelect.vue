<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const current = computed(() => props.options.find(o => o.value === props.modelValue))

function select(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function onBlur() {
  setTimeout(() => { open.value = false }, 150)
}
</script>

<template>
  <div class="cs" :class="{ open }" tabindex="0" @blur="onBlur">
    <button class="cs-btn" @click="open = !open">
      <span class="cs-text">{{ current?.label || 'Выберите...' }}</span>
      <svg class="cs-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div v-if="open" class="cs-menu">
      <button
        v-for="opt in options"
        :key="opt.value"
        class="cs-item"
        :class="{ active: opt.value === modelValue }"
        @click="select(opt.value)"
      >
        {{ opt.label }}
        <svg v-if="opt.value === modelValue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cs { position: relative; }

.cs-btn {
  display: flex; align-items: center; gap: 6px;
  height: 44px; padding: 0 14px;
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: 22px; color: var(--text);
  font-size: 13px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  transition: border-color 0.15s;
}
.cs-btn:hover, .cs.open .cs-btn { border-color: var(--primary); }

.cs-text { flex: 1; text-align: left; }

.cs-chevron {
  color: var(--text-muted);
  transition: transform 0.15s;
  flex-shrink: 0;
}
.cs.open .cs-chevron { transform: rotate(180deg); }

.cs-menu {
  position: absolute; top: calc(100% + 4px); right: 0;
  min-width: 100%; width: max-content;
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 20; overflow: hidden;
  padding: 4px;
}

.cs-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 10px 14px; min-height: 44px;
  background: none; border: none; border-radius: 8px;
  font-size: 13px; color: var(--text); text-align: left;
  cursor: pointer; transition: background 0.1s;
  white-space: nowrap;
}
.cs-item:hover { background: var(--bg-alt); }
.cs-item.active { color: var(--primary); font-weight: 600; }
.cs-item.active svg { color: var(--primary); }
</style>
