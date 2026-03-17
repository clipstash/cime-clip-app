<script lang="ts">
  let { active = '' }: { active?: string } = $props();
</script>

<nav>
  <div class="nav-left">
    <a href="/">ClipDown</a>
  </div>
  <div class="nav-right">
    <a href="/" class={active === '' ? 'nav-active' : ''}>Download</a>
  </div>
</nav>
