<script lang="ts">
  type Props = {
    progress: number;
    label: string;
  };
  const { progress, label }: Props = $props();
</script>

<div class="dl-progress">
  <div class="progress-bar"><div class="progress-fill" style="width: {progress}%"></div></div>
  <span class="progress-label">{label}</span>
</div>
