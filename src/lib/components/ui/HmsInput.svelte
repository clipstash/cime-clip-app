<script lang="ts">
  type Props = {
    h: number;
    m: number;
    s: number;
    ariaPrefix: string;
    fieldPrefix: string;
    onFocus: (field: string) => void;
    onClamp: (field: string) => void;
    onStep: (delta: number) => void;
  };

  let { h = $bindable(), m = $bindable(), s = $bindable(), ariaPrefix, fieldPrefix, onFocus, onClamp, onStep }: Props = $props();
</script>

<div class="hms-inputs">
  <input type="number" bind:value={h} min="0" aria-label="{ariaPrefix} 시" onfocus={() => onFocus(`${fieldPrefix}H`)} oninput={() => onClamp(`${fieldPrefix}H`)} />
  <span class="hms-sep">:</span>
  <input type="number" bind:value={m} min="0" max="59" aria-label="{ariaPrefix} 분" onfocus={() => onFocus(`${fieldPrefix}M`)} oninput={() => onClamp(`${fieldPrefix}M`)} />
  <span class="hms-sep">:</span>
  <input type="number" bind:value={s} min="0" max="59" aria-label="{ariaPrefix} 초" onfocus={() => onFocus(`${fieldPrefix}S`)} oninput={() => onClamp(`${fieldPrefix}S`)} />
  <div class="hms-stepper">
    <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); onStep(1); }}>▲</button>
    <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); onStep(-1); }}>▼</button>
  </div>
</div>
