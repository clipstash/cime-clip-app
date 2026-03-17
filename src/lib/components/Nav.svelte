<script lang="ts">
  let { active = '' }: { active?: 'clips' | '' } = $props();
</script>

<nav>
  <div class="nav-left">
    <a href="/">ClipDown</a>
  </div>
  <div class="nav-right">
    <a href="/clips" class={active === 'clips' ? 'nav-active' : ''}>Download</a>
  </div>
</nav>
