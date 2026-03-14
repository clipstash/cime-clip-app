<script lang="ts">
  let { active = '' }: { active?: 'clips' | 'videos' | 'recording' | 'schedule' | '' } = $props();
</script>

<nav>
  <div class="nav-left">
    <a href="/">ClipDown</a>
  </div>
  <div class="nav-right">
    <a href="/clips" class={active === 'clips' || active === 'videos' || active === 'recording' ? 'nav-active' : ''}>Download</a>
    <a href="/schedule" class={active === 'schedule' ? 'nav-active' : ''}>Schedule</a>
  </div>
</nav>
