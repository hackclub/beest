<!-- src/routes/+page.svelte -->
 <!-- Color Pallet
  #c48382 - Light Red
  #93b4cd - Light Blue
  #4b4840 - Dark Gray
  #6c6659 - Medium Gray
  #7f796d - Light Gray
  #cbc1ae - Beige
  #809fb7 - Light Steel Blue
  #e6f4fe - Light Cyan
  #ffffff - White
 
 -->



<div class="page-wrap">


<div class="top-bg">
<img src="/images/FAQ-Header.webp" alt="Hero" class="hero-image" loading="eager" decoding="async" />

</div>
<div>
<h1>Frequently Asked Questions</h1>
<p>Here are some of the most common questions we receive about Beest. If you have
any other questions, feel free to reach out to us! We have a dedicated help channel in the slack, but if aren't on slack you can email euan@hackclub.com</p>
</div>










</div>

<style>
  .top-bg {
    background: #e7a285;
  }

  /* ── decorative pipes ───────────────────────────── */
  .page-wrap {
    position: relative;
    overflow-x: clip;
  }

  .hero-image {
    display: block;
    width: 100%;
    height: auto;
    border: none;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #e7a285;
    filter: saturate(1.5);
  }

</style>
