<script lang="ts">
  let { data } = $props();
</script>

<div class="page">
  <h1>Welcome, {data.user.name ?? 'Hacker'}!</h1>
  <p>You've successfully RSVP'd for #BEEST. Tutorial stuff here, then move on to <a href="/home">/home</a>.</p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: sans-serif;
    color: #e8e0d4;
    background: #4b4840;
  }

  h1 {
    margin-bottom: 0.5rem;
  }
</style>
