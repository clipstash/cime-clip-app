<script lang="ts">
  let { active = '' }: { active?: 'clips' | 'recording' | 'videos' | '' } = $props();
</script>

<nav>
  <div class="nav-left">
    <a href="/">ClipDown</a>
  </div>
  <div class="nav-right">
    <a href="/clips" class={active === 'clips' ? 'nav-active' : ''}>Clips</a>
    <a href="/recording" class={active === 'recording' ? 'nav-active' : ''}>Recording</a>
    <a href="/videos" class={active === 'videos' ? 'nav-active' : ''}>Videos</a>
  </div>
</nav>
