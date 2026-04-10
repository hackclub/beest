<!-- src/routes/FAQ/+page.svelte -->
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

<script lang="ts">
  import { resolve } from '$app/paths';

  let openIndex: number | null = $state(null);

  function toggle(i: number) {
    openIndex = openIndex === i ? null : i;
  }

  let gearAngle = $derived(openIndex !== null ? (openIndex + 1) * 45 : 0);


  const faqs = [
    {
      q: 'What is Beest?',
      a: 'Beest is a Hack Club hackathon/event in the Netherlands! Participants qualify by building any project and documenting the process, and those who qualify fly to the Netherlands to build their own beests (mechanical animals!). The event is themed around Strandbeests, a kinetic sculpture developed in the netherlands by Theo Jansen. Participants will have the opportunity to go to a strandbeest exhibit!'
    },
    {
      q: 'Who can participate?',
      a: 'Any teens 13-19 or in high school can participate. We can also provide flight stipends for international students to get to the event.'
    },
    {
      q: 'How much does it cost?',
      a: 'Beest is completely free to participate in! All costs for the event are covered, including food, accomodation, day-off travel and merchandise. Additionally participants can earn stipends for visa application fees and flight costs.'
    },
    {
      q: 'Where and when does Beest take place?',
      a: '[TBD]'
    },
    {
      q: 'How will the event run?',
      a: 'Participants are invited to arrive on July 7th to watch the exhibition of the Beest - then in teams of three they will make walking mechanisms over a week, before exhibiting them on Scheveningen beach.'
    },
    {
      q: 'How do I qualify?',
      a: 'Build an open source coding or hardware project! Anything you can dream up is possible, just make the project you want to exist. Please don\'t AI generate the project, instead focus on making something fun, silly, useful to you or a project that forces you to learn something new. 40 hours of tracked work will automatically qualify you, and working for additional hours will contribute $10/hr toward your flight cost or visa application fees.'
    },
    {
      q: 'What should I bring?',
      a: 'A laptop, a sleeping bag, clothes, a charger, a mobile phone... A more conclusive list will be sent out closer to the event.'
    },
    {
      q: 'Do I need prior engineering or building experience?',
      a: 'No! Hack Club is all about learning by doing, so we welcome builders of all experience levels. We will provide resources and support to help you build your mechanical animal, and we can help you in the #beest channel on Slack!'
    },
    {
      q: 'What is a Strandbeest?',
      a: 'A Strandbeest is a kinetic sculpture that walks using wind power. They are made from lightweight materials like PVC pipe and can range in size from small tabletop models to large structures that can walk on the beach.'
    },
    {
      q: 'I have more questions — how do I get in touch?',
      a: 'Contact us in the #beest channel on Hack Club Slack or email euan@hackclub.com!'
    }
  ];
</script>

<div class="faq-page">
  <!-- Side gears — desktop only, rotate based on open question -->
  <svg class="side-gear side-gear-l1" style="transform: rotate({gearAngle * 0.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="side-gear side-gear-l2" style="transform: rotate({-gearAngle * 1.8 + 22.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="side-gear side-gear-l3" style="transform: rotate({gearAngle * 2.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>

  <svg class="side-gear side-gear-r1" style="transform: rotate({-gearAngle * 1.3}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="side-gear side-gear-r2" style="transform: rotate({gearAngle * 0.3 + 22.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>

  <h1>Frequently Asked Questions</h1>
  <p class="faq-intro">I'm sure you have lots of questions! Below is the most common ones I see, but if you need more help please email euan@hackclub.com or use the dedicated slack channel #beest-help</p>

  <div class="faq-list">
    {#each faqs as faq, i (faq.q)}
      <button
        class="faq-item"
        class:open={openIndex === i}
        onclick={() => toggle(i)}
        aria-expanded={openIndex === i}
      >
        <div class="faq-question">
          <span>{faq.q}</span>
          <span class="faq-icon" class:rotated={openIndex === i}>+</span>
        </div>
        {#if openIndex === i}
          <div class="faq-answer">
            <p>{faq.a}</p>
          </div>
        {/if}
      </button>
    {/each}
  </div>

  <a href={resolve('/home')} class="back-btn">Back to main site</a>
</div>

<style>
  @font-face {
    font-family: "Stone Breaker";
    src: url("/fonts/Stone Breaker.woff2") format("woff2");
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "Sunny Mood";
    src: url("/fonts/SunnyMood.woff2") format("woff2");
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #4b4840;
    overflow-x: hidden;
  }

  .faq-page {
    background: #4b4840;
    min-height: 100vh;
    padding: 2rem 1.5rem;
    position: relative;
    overflow-x: clip;
  }

  .faq-page::after {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/images/tile.webp') repeat;
    opacity: 0.06;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  .faq-page > * {
    position: relative;
    z-index: 1;
  }

  h1 {
    font-family: "Stone Breaker", "Courier New", monospace;
    color: #cbc1ae;
    font-size: 3rem;
    text-align: center;
    margin: 0 0 1rem;
  }

  .faq-intro {
    font-family: "Courier New", monospace;
    color: #cbc1ae;
    text-align: center;
    max-width: 600px;
    margin: 0 auto 2.5rem;
    font-size: 1.05rem;
    line-height: 1.6;
    opacity: 0.85;
  }

  .faq-list {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .faq-item {
    background: #3a3530;
    border: 2px solid #2e2a26;
    border-radius: 8px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
    font-family: inherit;
    color: inherit;
    transition: background 0.2s, box-shadow 0.2s;
    box-shadow:
      0 4px 8px rgba(0, 0, 0, 0.3),
      0 8px 20px rgba(0, 0, 0, 0.25);
  }

  .faq-item:hover {
    background: #4b4840;
    box-shadow:
      0 6px 12px rgba(0, 0, 0, 0.35),
      0 12px 28px rgba(0, 0, 0, 0.3);
  }

  .faq-item.open {
    background: #3a3530;
    border-color: #cbc1ae;
    box-shadow:
      0 8px 16px rgba(0, 0, 0, 0.4),
      0 16px 36px rgba(0, 0, 0, 0.3);
  }

  .faq-question {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 1.2rem;
    color: #e6e2da;
    gap: 1rem;
  }

  .faq-icon {
    font-family: "Courier New", monospace;
    font-size: 1.5rem;
    color: #e6e2da;
    flex-shrink: 0;
    transition: transform 0.25s ease;
    line-height: 1;
  }

  .faq-icon.rotated {
    transform: rotate(45deg);
  }

  .faq-answer {
    padding: 0 1.25rem 1rem;
  }

  .faq-answer p {
    font-family: "Courier New", monospace;
    color: #e6e2da;
    font-size: 0.9rem;
    line-height: 1.7;
    margin: 0;
  }

  .back-btn {
    display: block;
    width: fit-content;
    margin: 1.5rem auto 0;
    padding: 0.75rem 2rem;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 1.3rem;
    color: #e6e2da;
    background: #3a3530;
    border: 2px solid #2e2a26;
    border-radius: 8px;
    text-decoration: none;
    text-align: center;
    transition: background 0.2s;
    box-shadow:
      0 4px 8px rgba(0, 0, 0, 0.3),
      0 8px 20px rgba(0, 0, 0, 0.25);
  }

  .back-btn:hover {
    background: #4b4840;
  }

  .side-gear {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    width: 200px;
    height: 200px;
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Left side gears — embedded in the left edge */
  .side-gear-l1 {
    left: -115px;
    top: 10%;
  }

  .side-gear-l2 {
    left: -130px;
    top: 40%;
    width: 240px;
    height: 240px;
  }

  .side-gear-l3 {
    left: -115px;
    top: 72%;
  }

  /* Right side gears — embedded in the right edge */
  .side-gear-r1 {
    right: -115px;
    top: 20%;
  }

  .side-gear-r2 {
    right: -130px;
    top: 53%;
    width: 240px;
    height: 240px;
  }


  @media (max-width: 600px) {
    .side-gear {
      display: none;
    }
    h1 {
      font-size: 2rem;
    }

    .faq-intro {
      font-size: 0.95rem;
    }

    .faq-page {
      padding: 2.5rem 1rem;
    }

    .faq-question {
      font-size: 1rem;
      padding: 0.85rem 1rem;
    }

    .faq-answer {
      padding: 0 1rem 0.85rem;
    }

    .faq-item {
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.25),
        0 4px 10px rgba(0, 0, 0, 0.2);
    }
  }
</style>
