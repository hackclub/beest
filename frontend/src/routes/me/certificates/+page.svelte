<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let certificates = $derived(data.certificates);

  const navItems = [
    { label: 'Projects', href: '/projects', mobile: true, icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
    { label: 'Shop', href: '/shop', mobile: true, icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>' },
    { label: 'Events', href: '/events', mobile: true, icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { label: 'Explore', href: '/explore', mobile: true, icon: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>' },
    { label: 'Leaderboard', href: '/leaderboard', mobile: false, icon: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>' },
    { label: 'FAQ', href: '/FAQ', mobile: false, icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>' },
    { label: 'Me', href: '/me', mobile: true, icon: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
    { label: 'Devlogs', href: '/devlogs', mobile: false, icon: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
    { label: 'Certificates', href: '/me/certificates', mobile: false, icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/><path d="m16 16 1.5 1.5L20 15"/>' },
    { label: 'Tutorial', href: '/tutorial', mobile: false, icon: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>' }
  ];

  function viewCertificate(id: string) {
    window.open(`/api/certificates/${id}/view`, '_blank', 'noopener');
  }

  function downloadCertificate(id: string) {
    window.location.href = `/api/certificates/${id}/download`;
  }

  function formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>My Certificates · Beest</title>
</svelte:head>

<aside class="sidebar pinned" aria-label="Main navigation">
  <div class="sidebar-panel">
    <div class="sidebar-content">
      <a href="/" class="sidebar-brand"><img src="/images/beest-logo.webp" alt="Beest" class="sidebar-logo" /></a>
      <ul class="sidebar-nav">
        {#each navItems as item}
          <li class:mobile-only-hide={!item.mobile}>
            <a class="nav-btn" class:active={item.href === '/me/certificates'} href={item.href} aria-current={item.href === '/me/certificates' ? 'page' : undefined}>
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html item.icon}</svg>
              <span class="nav-label">{item.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
  <div class="teeth outer" aria-hidden="true"></div><div class="teeth inner" aria-hidden="true"></div>
</aside>

<main class="page">
  <header class="hero">
    <p class="eyebrow">Beest by Hack Club</p>
    <h1>My certificates</h1>
    <p>Proof of the things you earned through Beest. Each certificate is issued when an eligible shop order is fulfilled.</p>
  </header>

  <section class="certificate-grid" aria-label="Your certificates">
    {#if certificates.length}
      {#each certificates as cert (cert.id)}
        <article class="certificate-card">
          <div class="card-top">
            <span class="seal" aria-hidden="true">✦</span>
            <span class="issued">Issued {formatDate(cert.createdAt)}</span>
          </div>
          <div class="card-body">
            <p class="kicker">Certificate of achievement</p>
            <h2>{cert.awardItem}</h2>
            <p class="recipient">Awarded to <strong>{cert.recipientName}</strong></p>
            <dl>
              <div><dt>Item price</dt><dd>{cert.approvedHours} Pipes</dd></div>
              <div><dt>Certificate no.</dt><dd class="number">{cert.certificateNumber}</dd></div>
            </dl>
          </div>
          <footer>
            <button class="secondary" onclick={() => viewCertificate(cert.id)}>View</button>
            <button class="primary" onclick={() => downloadCertificate(cert.id)}>Download PDF</button>
          </footer>
        </article>
      {/each}
    {:else}
      <div class="empty-state">
        <div class="empty-mark" aria-hidden="true">✦</div>
        <h2>No certificates yet</h2>
        <p>Certificates appear here after an eligible shop order is fulfilled.</p>
        <a class="button" href="/shop">Visit the shop</a>
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) { background: #635a4e; color: #e6f4fe; }
  .sidebar { position: fixed; inset: 0 auto 0 0; width: 220px; z-index: 100; }
  .sidebar-panel { position:absolute; inset:0 auto 0 0; width:165px; height:100%; background:#4b4840; overflow:hidden; }
  .sidebar-content { display:flex; flex-direction:column; width:100%; height:100%; padding:28px 20px 20px; overflow-y:auto; }
  .sidebar-brand { display:block; margin-bottom:24px; line-height:0; } .sidebar-logo { width:100%; max-width:170px; }
  .sidebar-nav { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
  .nav-btn { display:flex; align-items:center; gap:12px; width:100%; padding:5px 12px; border:3px solid transparent; border-bottom-width:6px; border-radius:6px; background:transparent; color:#cbc1ae; font-family:'Stone Breaker','Courier New',monospace; font-size:17px; letter-spacing:.03em; text-align:left; transition:color 150ms ease, transform .1s ease; }
  .nav-btn:hover,.nav-btn.active { color:#e6f4fe; text-decoration:underline; text-decoration-color:#c48382; text-underline-offset:4px; } .nav-btn:active { transform:translateY(3px); border-bottom-width:3px; }
  .nav-icon { width:18px; height:18px; flex-shrink:0; opacity:.85; }.nav-btn:hover .nav-icon,.nav-btn.active .nav-icon { opacity:1; }
  .teeth { position:absolute; top:0; right:0; height:100%; pointer-events:none; }.teeth.inner { width:30px; background:#6c6659; z-index:3; clip-path:polygon(0 0,65% 0,80% 10%,55% 22%,90% 35%,50% 48%,85% 60%,58% 72%,95% 85%,70% 100%,0 100%); }.teeth.outer { width:60px; background:#4b4840; z-index:4; clip-path:polygon(0 0,70% 0,55% 15%,88% 28%,60% 42%,92% 55%,52% 68%,82% 80%,58% 92%,65% 100%,0 100%); }
  .page { min-height: 100vh; margin-left: 170px; padding: clamp(36px, 7vw, 92px) clamp(22px, 6vw, 96px); background: linear-gradient(135deg, rgba(197,173,128,.10), transparent 36%), #635a4e; }
  .hero { max-width: 690px; margin-bottom: 38px; }
  .eyebrow, .kicker { color: #d5b87d; text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 800; }
  h1 { margin: 8px 0 12px; font-family: 'Stone Breaker', 'Courier New', monospace; font-size: clamp(42px, 7vw, 72px); line-height: .95; color: #f4e7cf; }
  .hero > p:last-child { margin: 0; color: #d5cabb; line-height: 1.6; max-width: 56ch; }
  .certificate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 18px; max-width: 1100px; }
  .certificate-card, .empty-state { background: #eee4d3; color: #38362f; border: 2px solid #c9ae77; box-shadow: 6px 7px 0 rgba(35,33,29,.28); }
  .certificate-card { display: flex; flex-direction: column; min-height: 310px; }
  .card-top { display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; border-bottom: 1px solid rgba(75,72,64,.22); }
  .seal { display: grid; place-items: center; width: 28px; height: 28px; background: #c48382; color: #fff6e6; border-radius: 50%; }
  .issued { color: #756e61; font-size: 11px; font-weight: 700; }
  .card-body { padding: 25px 20px 18px; flex: 1; }
  .demo-badge { display:inline-block; margin:2px 0 0; padding:3px 7px; border-radius:999px; background:#c48382; color:#fff6e6; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.09em; }
  .card-body h2 { margin: 9px 0 18px; color: #38362f; font-size: 25px; line-height: 1.08; }
  .recipient { color: #635a4e; margin: 0 0 23px; line-height: 1.5; }
  dl { display: grid; gap: 10px; margin: 0; }
  dl div { display: flex; justify-content: space-between; gap: 12px; border-top: 1px dashed rgba(75,72,64,.28); padding-top: 10px; font-size: 12px; }
  dt { color: #756e61; } dd { margin: 0; font-weight: 800; text-align: right; } .number { font-size: 10px; letter-spacing: .04em; }
  footer { display: flex; gap: 9px; padding: 14px; background: rgba(201,174,119,.16); border-top: 1px solid rgba(75,72,64,.2); }
  button, .button { border: 2px solid #4b4840; border-radius: 3px; padding: 10px 12px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; text-align: center; }
  button { flex: 1; } .secondary { background: transparent; color: #4b4840; } .primary, .button { background: #c48382; color: #fff6e6; box-shadow: 2px 2px 0 #4b4840; } button:hover, .button:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .empty-state { max-width: 600px; padding: 44px 28px; text-align: center; } .empty-mark { color: #c48382; font-size: 36px; } .empty-state h2 { margin: 10px 0; } .empty-state p { color: #635a4e; margin: 0 auto 24px; max-width: 40ch; line-height: 1.5; }
  @media (max-width: 900px) { .sidebar { position:fixed; top:auto; width:100%; height:auto; bottom:0; background:#4b4840; border-top:1px solid rgba(230,244,254,.1); } .sidebar-panel { position:static; width:100%; height:auto; background:transparent; } .sidebar-content { padding:0; height:auto; overflow:visible; } .sidebar-brand,.teeth { display:none; } .sidebar-nav { flex-direction:row; justify-content:space-around; width:100%; padding:6px 4px; gap:0; } .sidebar-nav li { flex:1 1 0; min-width:0; display:flex; } .mobile-only-hide { display:none; } .nav-btn { flex-direction:column; justify-content:center; gap:4px; padding:10px 2px 12px; font-size:clamp(10px,2.6vw,13px); line-height:1; letter-spacing:.02em; border-width:2px; border-bottom-width:4px; white-space:nowrap; min-width:0; } .nav-icon { width:20px; height:20px; } .page { margin-left:0; padding:36px 18px 96px; } }
</style>
