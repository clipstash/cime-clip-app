<script lang="ts">
  let { url, onClose }: {
    url: string;
    onClose: () => void;
  } = $props();
</script>

<div class="modal-backdrop" onclick={onClose} role="presentation">
  <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }} role="dialog" tabindex="-1">
    <button class="modal-close" onclick={onClose} aria-label="닫기">×</button>
    <video class="modal-video" src={url} controls autoplay><track kind="captions" /></video>
  </div>
</div>
