<script lang="ts">
  type VerificationResult = {
    certificateNumber: string;
    recipientName: string;
    approvedHours: number;
    awardItem: string;
    certificateText: string;
    createdAt: string;
  } | null;

  let certificateNumber = '';
  let loading = false;
  let result: VerificationResult = null;
  let error = '';

  async function verifyCertificate() {
    const key = certificateNumber.trim();
    if (!key) {
      error = 'Enter a certificate number to verify it.';
      result = null;
      return;
    }

    loading = true;
    error = '';
    result = null;

    try {
      const response = await fetch(`/api/certificates/verify/${encodeURIComponent(key)}`);
      if (!response.ok) {
        error = 'No certificate was found for that number.';
        return;
      }

      result = await response.json();
    } catch {
      error = 'Verification failed. Try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Verify Certificate - Beest</title>
  <meta
    name="description"
    content="Verify a Beest by Hack Club certificate by entering its certificate number."
  />
</svelte:head>

<div class="verify-page">
  <div class="verify-card">
    <div class="eyebrow">Beest by Hack Club</div>
    <h1>Verify Certificate</h1>
    <p class="lead">
      Enter a certificate number to confirm the recipient, fulfilled shop item, and its price in Pipes.
    </p>

    <form class="verify-form" onsubmit={(event) => { event.preventDefault(); verifyCertificate(); }}>
      <input
        bind:value={certificateNumber}
        placeholder="CERT-2026-ABC123DEF456"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify'}</button>
    </form>

    {#if error}
      <div class="message error">{error}</div>
    {/if}

    {#if result}
      <div class="message success">
        <h2>{result.recipientName}</h2>
        <p><strong>Certificate No.</strong> {result.certificateNumber}</p>
        <p><strong>Item price:</strong> {result.approvedHours} Pipes</p>
        <p><strong>Item:</strong> {result.awardItem}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .verify-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(circle at top left, rgba(239, 51, 64, 0.12), transparent 24%),
      radial-gradient(circle at bottom right, rgba(17, 17, 20, 0.1), transparent 24%),
      linear-gradient(135deg, #f7efe6 0%, #fcfbf8 55%, #f2ede6 100%);
    color: #111114;
  }

  .verify-card {
    width: min(760px, 100%);
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(17, 17, 20, 0.1);
    border-radius: 24px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.12);
    padding: 32px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.24em;
    font-size: 12px;
    color: #ef3340;
    font-weight: 800;
  }

  h1 {
    margin-top: 8px;
    font-size: clamp(2rem, 5vw, 3.4rem);
    line-height: 0.95;
  }

  .lead {
    margin-top: 14px;
    color: rgba(17, 17, 20, 0.72);
    line-height: 1.5;
    max-width: 60ch;
  }

  .verify-form {
    display: flex;
    gap: 12px;
    margin-top: 22px;
  }

  input {
    flex: 1;
    border: 1px solid rgba(17, 17, 20, 0.16);
    border-radius: 999px;
    padding: 14px 18px;
    font: inherit;
    font-weight: 700;
    letter-spacing: 0.05em;
    outline: none;
  }

  input:focus {
    border-color: rgba(239, 51, 64, 0.55);
    box-shadow: 0 0 0 4px rgba(239, 51, 64, 0.14);
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 14px 22px;
    background: linear-gradient(135deg, #d61f31, #ef3340);
    color: white;
    font: inherit;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.7;
    cursor: progress;
  }

  .message {
    margin-top: 18px;
    border-radius: 18px;
    padding: 18px;
    line-height: 1.5;
  }

  .message.error {
    border: 1px solid rgba(17, 17, 20, 0.14);
    background: rgba(17, 17, 20, 0.04);
  }

  .message.success {
    border: 1px solid rgba(239, 51, 64, 0.16);
    background: rgba(239, 51, 64, 0.06);
  }

  .message h2 {
    font-size: 1.5rem;
    margin-bottom: 8px;
  }

  .message p {
    margin: 4px 0;
  }

  @media (max-width: 720px) {
    .verify-card {
      padding: 22px;
    }

    .verify-form {
      flex-direction: column;
    }
  }
</style>
