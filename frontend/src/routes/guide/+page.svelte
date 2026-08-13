<!-- src/routes/guide/+page.svelte -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';

  let { data } = $props();

  type ReviewStat = { projectType: string; avgSeconds: number; sampleCount: number };

  const reviewStats: ReviewStat[] = data?.reviewStats ?? [];

  const statByType: Record<string, ReviewStat> = Object.fromEntries(
    reviewStats.map((s) => [s.projectType, s]),
  );

  /** Format a duration in seconds as a short human-friendly string. */
  function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const minutes = seconds / 60;
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
    const days = hours / 24;
    return `${days.toFixed(days < 10 ? 1 : 0)} d`;
  }

  // Disable the global custom cursor on this page (it's a plain document).
  onMount(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const wasOn = html.classList.contains('custom-cursor');
    html.classList.remove('custom-cursor');
    return () => {
      if (wasOn) html.classList.add('custom-cursor');
    };
  });

  let darkMode = $state(true);

  onMount(() => {
    try {
      const saved = localStorage.getItem('guide-dark-mode');
      if (saved === '0') darkMode = false;
      else if (saved === '1') darkMode = true;
    } catch {}
  });

  function toggleDark() {
    darkMode = !darkMode;
    try { localStorage.setItem('guide-dark-mode', darkMode ? '1' : '0'); } catch {}
  }

  type Pill = { label: string; tone: 'good' | 'meh' | 'bad'; note: string };
  type Rejection = { reason: string; count: number };
  type Guide = {
    type: string;
    label: string;
    icon: keyof typeof iconPaths;
    intro: string;
    pillsTitle?: string;
    pills?: Pill[];
    steps: string[];
    tips?: string[];
    warning?: string;
    /**
     * Hand-paraphrased common rejection reasons, with counts from a one-time
     * read of project_reviews on 2026-05-05. These are not recomputed at load.
     */
    commonRejections?: Rejection[];
  };

  // Supercons icons (https://supercons.vercel.app) plus Tux from Simple Icons.
  // Inner SVG content rendered inside a shared <svg viewBox="0 0 32 32">.
  const iconPaths = {
    web: '<path d="M15 6.122c-.8.205-1.461.664-2 1.324-.36.441-.667.973-.922 1.58-.467 1.107-.767 2.463-.93 3.974-.068.641-.112 1.31-.133 2H15V6.122zM17 15h3.985a26.403 26.403 0 0 0-.134-2c-.162-1.51-.462-2.867-.929-3.974A6.447 6.447 0 0 0 19 7.446c-.539-.66-1.2-1.119-2-1.324V15zm5.541-3.607c.11.518.202 1.055.273 1.607.083.647.139 1.315.166 2h2.97a9.953 9.953 0 0 0-1.54-4.412 10.053 10.053 0 0 0-3.325-3.2c.643 1.127 1.133 2.487 1.456 4.005zm.01-5.449a12.012 12.012 0 0 1 5.202 7.621c.162.787.247 1.6.247 2.435 0 .834-.085 1.648-.247 2.435a12.012 12.012 0 0 1-9.318 9.318 12 12 0 0 1-3.435.206 11.932 11.932 0 0 1-5.55-1.903 12.012 12.012 0 0 1-5.203-7.621C4.085 17.648 4 16.835 4 16c0-.834.085-1.649.247-2.435a12.012 12.012 0 0 1 9.318-9.318A11.99 11.99 0 0 1 16 4a12.156 12.156 0 0 1 2.435.247c1.492.308 2.882.892 4.116 1.697zm-12.032 1.69a10.053 10.053 0 0 0-2.93 2.954A9.953 9.953 0 0 0 6.05 15h2.97c.028-.685.084-1.353.167-2a19.91 19.91 0 0 1 .273-1.607c.323-1.518.813-2.878 1.455-4.005a10 10 0 0 0-.395.246zM6.049 17a9.951 9.951 0 0 0 1.54 4.412 10.053 10.053 0 0 0 3.325 3.2c-.642-1.127-1.132-2.487-1.455-4.005A19.914 19.914 0 0 1 9.186 19a22.895 22.895 0 0 1-.166-2H6.05zm4.966 0c.021.69.065 1.359.134 2 .162 1.51.462 2.867.929 3.974.255.607.561 1.139.922 1.58.539.66 1.2 1.119 2 1.324V17h-3.985zM17 17v8.878c.8-.205 1.461-.664 2-1.324.36-.441.667-.973.922-1.58.467-1.107.767-2.463.93-3.974.068-.641.112-1.31.133-2H17zm5.98 0a22.914 22.914 0 0 1-.166 2 19.905 19.905 0 0 1-.273 1.607c-.323 1.518-.813 2.878-1.455 4.005a10.053 10.053 0 0 0 3.325-3.2A9.954 9.954 0 0 0 25.95 17h-2.97z"/>',
    laptop: '<path d="M16 7.75C15.2887 7.75 14.623 7.75745 14 7.77362C5.7919 7.98651 5 9.70856 5 15.75C5 19.0577 5.23738 21.0706 6.79932 22.25H5C4.448 22.25 4 22.698 4 23.25C4 23.802 4.448 24.25 5 24.25H27C27.552 24.25 28 23.802 28 23.25C28 22.698 27.552 22.25 27 22.25H25.2007C26.7626 21.0706 27 19.0577 27 15.75C27 9.25 26.0833 7.75 16 7.75ZM7.24951 19.2923C7.03903 18.4178 6.99951 17.3314 7 15.75C6.99951 14.1686 7.03903 13.0822 7.24951 12.2077C7.41556 11.409 7.50861 11.1888 7.96548 10.8763C8.3237 10.5908 8.99329 10.2783 10.3453 10.0605C11.7291 9.83453 13.5027 9.75055 15.9492 9.75H16C18.4727 9.74945 20.2614 9.83295 21.6547 10.0605C23.0067 10.2783 23.6763 10.5908 24.0345 10.8763C24.4914 11.1888 24.5844 11.409 24.7505 12.2077C24.961 13.0822 25.0005 14.1686 25 15.75C25.0005 17.3314 24.961 18.4178 24.7505 19.2923C24.5844 20.091 24.4914 20.3112 24.0345 20.6237C23.6763 20.9092 23.0067 21.2217 21.6547 21.4395C20.2614 21.6671 18.4727 21.7505 16 21.75H15.9492C13.5027 21.7495 11.7291 21.6655 10.3453 21.4395C8.99329 21.2217 8.3237 20.9092 7.96548 20.6237C7.50861 20.3112 7.41556 20.091 7.24951 19.2923Z"/>',
    'app-store': '<path d="M9 18H11.1906L14.8453 11.6699L14.134 10.4379C13.8578 9.95957 14.0217 9.34798 14.5 9.07184C14.9783 8.7957 15.5899 8.95957 15.866 9.43787L16 9.6699L16.134 9.43783C16.4101 8.95954 17.0217 8.79567 17.5 9.07181C17.9783 9.34795 18.1422 9.95954 17.866 10.4378L13.5 18H17.3458L18.5005 20H9C8.44772 20 8 19.5523 8 19C8 18.4477 8.44772 18 9 18Z"/><path d="M21.9641 20H23C23.5523 20 24 19.5523 24 19C24 18.4477 23.5523 18 23 18H20.8094L17.7315 12.6689L16.5768 14.6689L21.134 22.5622C21.4101 23.0405 22.0217 23.2044 22.5 22.9282C22.9783 22.6521 23.1422 22.0405 22.866 21.5622L21.9641 20Z"/><path d="M9.13396 21.5622C8.85782 22.0405 9.02169 22.6521 9.49998 22.9282C9.97828 23.2044 10.5899 23.0405 10.866 22.5622L11.7679 21H9.45854L9.13396 21.5622Z"/><path d="M16 4C26 4 28 6 28 16C28 26 26 28 16 28C6 28 4 26 4 16C4 6 6 4 16 4ZM24.336 7.665C23.247 6.576 21.1 6 16 6C10.9 6 8.753 6.576 7.664 7.665C6.575 8.753 6 10.9 6 16C6 21.1 6.575 23.247 7.664 24.336C8.753 25.425 10.9 26 16 26C21.1 26 23.247 25.425 24.336 24.336C25.425 23.247 26 21.1 26 16C26 10.9 25.425 8.754 24.336 7.665Z"/>',
    apps: '<path d="M13 11C13 11.9336 12.9339 12.4739 12.8623 12.7763C12.8563 12.8018 12.8504 12.8247 12.8449 12.8449C12.8247 12.8504 12.8018 12.8563 12.7763 12.8623C12.4739 12.9339 11.9336 13 11 13C10.0664 13 9.52605 12.9339 9.22373 12.8623C9.19815 12.8563 9.17535 12.8504 9.15511 12.8449C9.14958 12.8247 9.14374 12.8018 9.13768 12.7763C9.06609 12.4739 9 11.9336 9 11C9 10.0664 9.06609 9.52605 9.13768 9.22373C9.14374 9.19815 9.14958 9.17535 9.15511 9.15511C9.17535 9.14958 9.19815 9.14374 9.22373 9.13768C9.52605 9.06609 10.0664 9 11 9C11.9336 9 12.4739 9.06609 12.7763 9.13768C12.8018 9.14374 12.8247 9.14958 12.8449 9.15511C12.8504 9.17535 12.8563 9.19815 12.8623 9.22373C12.9339 9.52605 13 10.0664 13 11ZM14.293 14.293C14.725 13.861 15 13.007 15 11C15 8.993 14.725 8.139 14.293 7.707C13.861 7.275 13.007 7 11 7C8.993 7 8.139 7.275 7.707 7.707C7.275 8.139 7 8.993 7 11C7 13.007 7.275 13.861 7.707 14.293C8.139 14.725 8.993 15 11 15C13.007 15 13.861 14.725 14.293 14.293ZM13 21C13 21.9336 12.9339 22.4739 12.8623 22.7763C12.8563 22.8018 12.8504 22.8247 12.8449 22.8449C12.8247 22.8504 12.8018 22.8563 12.7763 22.8623C12.4739 22.9339 11.9336 23 11 23C10.0664 23 9.52605 22.9339 9.22373 22.8623C9.19815 22.8563 9.17535 22.8504 9.15511 22.8449C9.14958 22.8247 9.14374 22.8018 9.13768 22.7763C9.06609 22.4739 9 21.9336 9 21C9 20.0664 9.06609 19.5261 9.13768 19.2237C9.14374 19.1982 9.14958 19.1753 9.15511 19.1551C9.17535 19.1496 9.19815 19.1437 9.22373 19.1377C9.52605 19.0661 10.0664 19 11 19C11.9336 19 12.4739 19.0661 12.7763 19.1377C12.8018 19.1437 12.8247 19.1496 12.8449 19.1551C12.8504 19.1753 12.8563 19.1982 12.8623 19.2237C12.9339 19.5261 13 20.0664 13 21ZM14.293 24.293C14.725 23.861 15 23.007 15 21C15 18.993 14.725 18.139 14.293 17.707C13.861 17.275 13.007 17 11 17C8.993 17 8.139 17.275 7.707 17.707C7.275 18.139 7 18.993 7 21C7 23.007 7.275 23.861 7.707 24.293C8.139 24.725 8.993 25 11 25C13.007 25 13.861 24.725 14.293 24.293ZM22.8623 22.7763C22.9339 22.4739 23 21.9336 23 21C23 20.0664 22.9339 19.5261 22.8623 19.2237C22.8563 19.1982 22.8504 19.1753 22.8449 19.1551C22.8247 19.1496 22.8018 19.1437 22.7763 19.1377C22.4739 19.0661 21.9336 19 21 19C20.0664 19 19.5261 19.0661 19.2237 19.1377C19.1982 19.1437 19.1753 19.1496 19.1551 19.1551C19.1496 19.1753 19.1437 19.1982 19.1377 19.2237C19.0661 19.5261 19 20.0664 19 21C19 21.9336 19.0661 22.4739 19.1377 22.7763C19.1437 22.8018 19.1496 22.8247 19.1551 22.8449C19.1753 22.8504 19.1982 22.8563 19.2237 22.8623C19.5261 22.9339 20.0664 23 21 23C21.9336 23 22.4739 22.9339 22.7763 22.8623C22.8018 22.8563 22.8247 22.8504 22.8449 22.8449C22.8504 22.8247 22.8563 22.8018 22.8623 22.7763ZM25 21C25 23.007 24.725 23.861 24.293 24.293C23.861 24.725 23.007 25 21 25C18.993 25 18.139 24.725 17.707 24.293C17.275 23.861 17 23.007 17 21C17 18.993 17.275 18.139 17.707 17.707C18.139 17.275 18.993 17 21 17C23.007 17 23.861 17.275 24.293 17.707C24.725 18.139 25 18.993 25 21ZM20.9994 7C20.4479 7 20.0003 7.4476 19.9995 7.99985V9.99955L18.0006 10.0003C17.4483 9.99955 17 10.4479 17 10.9994C17 11.5524 17.4483 11.9992 18.0006 12L19.9995 11.9992L20.0003 13.9996C19.9995 14.5519 20.4471 14.9995 21.0001 14.9995C21.5516 14.9995 21.9992 14.5519 22 13.9996V12L23.9989 11.9992C24.5512 12 24.9995 11.5516 24.9995 11.0001C24.9995 10.4471 24.5512 10.0003 23.9989 9.99955L21.9992 9.99955V7.99985C22 7.4476 21.5524 7 20.9994 7Z"/>',
    code: '<path d="M18.634,9.438c0.276,-0.478 0.888,-0.642 1.366,-0.366c0.478,0.276 0.642,0.888 0.366,1.366l-7,12.124c-0.276,0.478 -0.888,0.642 -1.366,0.366c-0.478,-0.276 -0.642,-0.888 -0.366,-1.366l7,-12.124Zm4.348,11.452c-0.354,-0.424 -0.296,-1.055 0.128,-1.408l0.245,-0.205c1.478,-1.236 2.216,-1.854 3.529,-3.277c-1.338,-1.451 -2.052,-2.045 -3.612,-3.347l-0.162,-0.135c-0.424,-0.353 -0.482,-0.984 -0.128,-1.408c0.353,-0.424 0.942,-0.423 1.409,-0.128c1.609,1.018 2.609,2.018 4.2,3.964c0.219,0.312 0.409,0.664 0.409,1.054c0,0.39 -0.19,0.742 -0.409,1.053c-1.591,1.947 -2.591,2.947 -4.2,3.964l-0.001,0.001c-0.424,0.354 -1.055,0.296 -1.408,-0.128Zm-14.092,-1.408c0.424,0.353 0.482,0.984 0.128,1.408c-0.353,0.424 -0.984,0.482 -1.408,0.128l-0.001,-0.001c-1.609,-1.017 -2.609,-2.017 -4.2,-3.964c-0.219,-0.311 -0.409,-0.663 -0.409,-1.053c0,-0.39 0.19,-0.742 0.409,-1.054c1.591,-1.946 2.591,-2.946 4.2,-3.964c0.467,-0.295 1.056,-0.296 1.409,0.128c0.354,0.424 0.296,1.055 -0.128,1.408l-0.162,0.135c-1.56,1.302 -2.274,1.896 -3.612,3.347c1.313,1.423 2.051,2.041 3.529,3.277l0.245,0.205Z"/>',
    phone: '<path d="M8.02362 18C8.00745 17.377 8 16.7113 8 16C8 5.9167 9.5 5 16 5C22.5 5 24 5.9167 24 16C24 16.7113 23.9926 17.377 23.9764 18C23.7635 26.2081 22.0414 27 16 27C9.95856 27 8.23651 26.2081 8.02362 18ZM16 25C17.5814 25.0005 18.6678 24.961 19.5423 24.7505C20.341 24.5844 20.5612 24.4914 20.8737 24.0345C21.1592 23.6763 21.4717 23.0067 21.6895 21.6547C21.9155 20.2709 21.9995 18.4973 22 16.0508V16C22.0005 13.5273 21.9171 11.7386 21.6895 10.3453C21.4717 8.9933 21.1592 8.3237 20.8737 7.9655C20.5612 7.50861 20.341 7.4156 19.5423 7.2495C18.6678 7.039 17.5814 6.9995 16 7C14.4186 6.9995 13.3322 7.039 12.4577 7.2495C11.659 7.4156 11.4388 7.50861 11.1263 7.9655C10.8408 8.3237 10.5283 8.9933 10.3105 10.3453C10.0829 11.7386 9.99945 13.5273 10 16V16.0508C10.0005 18.4973 10.0845 20.2709 10.3105 21.6547C10.5283 23.0067 10.8408 23.6763 11.1263 24.0345C11.4388 24.4914 11.659 24.5844 12.4577 24.7505C13.3322 24.961 14.4186 25.0005 16 25Z"/><path d="M13 9C13 8.448 13.448 8 14 8H18C18.552 8 19 8.448 19 9C19 9.552 18.552 10 18 10H14C13.448 10 13 9.552 13 9Z"/>',
    'bounding-box': '<path d="M27.7122 10.9133C27.2139 10.9739 26.6459 11 26 11C25.8982 11 25.7984 10.9994 25.7004 10.998C25.8986 12.2382 26 13.8588 26 16C26 18.141 25.8987 19.7616 25.7005 21.002C25.7984 21.0006 25.8982 21 26 21C26.6459 21 27.2139 21.0261 27.7122 21.0867C27.92 19.679 28 17.9994 28 16C28 14.0006 27.92 12.321 27.7122 10.9133ZM21.0867 27.7122C21.0261 27.2139 21 26.6459 21 26C21 25.8982 21.0006 25.7984 21.002 25.7005C19.7616 25.8987 18.141 26 16 26C13.859 26 12.2384 25.8987 10.998 25.7005C10.9994 25.7984 11 25.8982 11 26C11 26.6459 10.9739 27.2139 10.9133 27.7122C12.321 27.92 14.0006 28 16 28C17.9994 28 19.679 27.92 21.0867 27.7122ZM6 16C6 18.141 6.10134 19.7616 6.2995 21.002C6.20158 21.0006 6.10176 21 6 21C5.35406 21 4.78608 21.0261 4.28781 21.0867C4.07995 19.679 4 17.9994 4 16C4 14.0006 4.07995 12.321 4.28781 10.9133C4.78608 10.9739 5.35406 11 6 11C6.10176 11 6.20159 10.9994 6.29951 10.998C6.10134 12.2383 6 13.8589 6 16ZM21.0867 4.28781C19.679 4.07995 17.9994 4 16 4C14.0006 4 12.321 4.07995 10.9133 4.28781C10.9739 4.78608 11 5.35406 11 6C11 6.10189 10.9994 6.20184 10.998 6.29988C12.2384 6.10151 13.859 6 16 6C18.141 6 19.7616 6.10151 21.002 6.29988C21.0006 6.20184 21 6.10189 21 6C21 5.35406 21.0261 4.78609 21.0867 4.28781Z"/><path d="M30 6C30 8.007 29.725 8.861 29.293 9.293C28.861 9.725 28.007 10 26 10C23.993 10 23.139 9.725 22.707 9.293C22.275 8.861 22 8.007 22 6C22 3.993 22.275 3.139 22.707 2.707C23.139 2.275 23.993 2 26 2C28.007 2 28.861 2.275 29.293 2.707C29.725 3.139 30 3.993 30 6Z"/><path d="M30 26C30 28.007 29.725 28.861 29.293 29.293C28.861 29.725 28.007 30 26 30C23.993 30 23.139 29.725 22.707 29.293C22.275 28.861 22 28.007 22 26C22 23.993 22.275 23.139 22.707 22.707C23.139 22.275 23.993 22 26 22C28.007 22 28.861 22.275 29.293 22.707C29.725 23.139 30 23.993 30 26Z"/><path d="M10 26C10 28.007 9.725 28.861 9.293 29.293C8.861 29.725 8.007 30 6 30C3.993 30 3.139 29.725 2.707 29.293C2.275 28.861 2 28.007 2 26C2 23.993 2.275 23.139 2.707 22.707C3.139 22.275 3.993 22 6 22C8.007 22 8.861 22.275 9.293 22.707C9.725 23.139 10 23.993 10 26Z"/><path d="M10 6C10 8.007 9.725 8.861 9.293 9.293C8.861 9.725 8.007 10 6 10C3.993 10 3.139 9.725 2.707 9.293C2.275 8.861 2 8.007 2 6C2 3.993 2.275 3.139 2.707 2.707C3.139 2.275 3.993 2 6 2C8.007 2 8.861 2.275 9.293 2.707C9.725 3.139 10 3.993 10 6Z"/>',
    dice: '<path d="M16 6C21.1 6 23.247 6.576 24.336 7.665C25.425 8.754 26 10.9 26 16C26 21.1 25.425 23.247 24.336 24.336C23.247 25.425 21.1 26 16 26C10.9 26 8.753 25.425 7.664 24.336C6.575 23.247 6 21.1 6 16C6 10.9 6.575 8.753 7.664 7.665C8.753 6.576 10.9 6 16 6ZM28 16C28 6 26 4 16 4C6 4 4 6 4 16C4 26 6 28 16 28C26 28 28 26 28 16Z"/><circle cx="21" cy="11" r="2.5"/><circle cx="16" cy="16" r="2.5"/><circle cx="11" cy="21" r="2.5"/>',
    sam: '<path d="M 14 2C 14 2.74028 13.5978 3.38663 13 3.73244L 13 6L 11 6L 11 3.73244C 10.4022 3.38663 10 2.74028 10 2C 10 0.895432 10.8954 0 12 0C 13.1046 0 14 0.895432 14 2ZM 11 7.00577L 11 7L 13 7L 13 7.00577C 22.1347 7.11594 24 8.8546 24 16.5C 24 24.4167 22 26 12 26C 2 26 0 24.4167 0 16.5C 0 8.8546 1.8653 7.11594 11 7.00577ZM 5.5 17C 6.32843 17 7 16.3284 7 15.5C 7 14.6716 6.32843 14 5.5 14C 4.67157 14 4 14.6716 4 15.5C 4 16.3284 4.67157 17 5.5 17ZM 18.5 17C 19.3284 17 20 16.3284 20 15.5C 20 14.6716 19.3284 14 18.5 14C 17.6716 14 17 14.6716 17 15.5C 17 16.3284 17.6716 17 18.5 17ZM 12.0008 21C 13.9558 21 15.6185 19.7531 15.9905 18.0909C 16.176 17.262 13.597 17 12.0011 17C 10.4053 17 7.80522 17.1678 8.01158 18.0909C 8.38356 19.7531 10.0457 21 12.0008 21Z" transform="translate(4 2)"/>',
    tux: '<g transform="scale(1.3333)"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z"/></g>'
  } as const;

  const guides: Guide[] = [
    {
      type: 'web',
      label: 'Web Playable',
      icon: 'web',
      intro: 'A project that runs in a browser: websites, web apps, browser games, demos.',
      pillsTitle: 'Where to host',
      pills: [
        { label: 'Vercel', tone: 'good', note: 'Generous free tier, instant git deploys, edge functions cover most backend needs. Double-check you\'re sending the public *.vercel.app URL, not your internal vercel.com/<you>/<project> dashboard link.' },
        { label: 'Hack Club Nest', tone: 'good', note: 'Free Linux shell from Hack Club, runs anything including long-lived backends.' },
        { label: 'GitHub Pages', tone: 'good', note: 'Super fast to set up, native to GitHub, free, but won\'t run a backend.' },
        { label: 'itch.io', tone: 'good', note: 'Drag-and-drop a zip; perfect for browser games and jam-style projects.' },
        { label: 'Netlify', tone: 'good', note: 'Git-based deploys with a generous static-site free tier, similar feel to Vercel.' },
        { label: 'Streamlit Community Cloud', tone: 'meh', note: 'Zero-config for Streamlit/Python apps, but takes minutes to start up which is a pain to review.' },
        { label: 'localhost only', tone: 'bad', note: 'Your site must stay indefinitely reachable; localhost is only up while your machine is. Not acceptable.' },
        { label: 'Tunnels (bore, ngrok, Cloudflare Tunnel)', tone: 'bad', note: 'Same problem as localhost: the tunnel dies when your laptop sleeps. Your site must stay indefinitely reachable. Not acceptable.' }
      ],
      steps: [
        'Push your source code to a public GitHub (or GitLab) repo.',
        'Deploy somewhere from the recommended list above.',
        'Open the deployed link in a fresh / incognito window to test it works without sign in.',
        'Paste the deployed URL into Demo URL, and the repo into Code URL.',
        'Add 1 or 2 screenshots and a README that says what it does, how to use it and how it works. Ideally include that it is a project for #beest.'
      ],
      commonRejections: [
        { reason: 'README is missing the basics: real description, screenshots, tech stack, motivation, and how-it-works section', count: 28 },
        { reason: 'Project was already shipped to another Hack Club program (double-dipping is not allowed without significant new work)', count: 11 },
        { reason: 'README appears to have been written by AI', count: 10 },
        { reason: 'Project relies on AI beyond the 30% limit', count: 8 },
        { reason: 'All code committed in one go: reviewers cannot see incremental progress', count: 7 },
        { reason: 'A visible feature is broken in the deployed demo (dead button, 404 asset, navbar, etc.)', count: 7 },
        { reason: 'Project pre-dates the Beest start window (August 2 2026) and was not updated meaningfully', count: 6 },
        { reason: 'Wrong or unrelated Hackatime project linked, or the same Hackatime project re-used across submissions', count: 5 },
        { reason: 'Under the 3-hour minimum', count: 5 }
      ]
    },
    {
      type: 'windows',
      label: 'Windows Playable',
      icon: 'laptop',
      intro: 'A native Windows app or game (.exe or installer).',
      pillsTitle: 'Where to host the build',
      pills: [
        { label: 'GitHub Release', tone: 'good', note: 'Trusted, version-tagged, and free; the default reviewers expect.' },
        { label: 'itch.io', tone: 'good', note: 'Listing page with screenshots, builds, and download counts in one place.' },
        { label: 'Google Drive (link share)', tone: 'bad', note: 'Your build needs to live somewhere indefinite and trusted. Drive links can be revoked, throttled, or quietly disappear, so they don\'t meet that bar. Stick to standard development practice and ship from a GitHub Release.' },
        { label: 'random file host', tone: 'bad', note: 'Same problem: the file source must be indefinite and trustworthy. Anonymous file lockers fail both tests. Use the standard developer workflow and host the build on a GitHub Release.' }
      ],
      steps: [
        'Build a release binary (dotnet publish, cargo build --release, your engine\'s Windows export, etc).',
        'Zip the build folder so reviewers get the .exe plus any required DLLs and assets in one shot.',
        'Upload the zip to a GitHub Release.',
        'Put the download link in Demo URL and your source in Code URL.',
        'In your README, list system requirements and any first-run steps (unblocking the .exe, allowing through SmartScreen).'
      ],
      tips: [
        'Test on a clean virtual machine or a friend\'s laptop that doesn\'t have your dev tools installed, to catch missing dependencies.'
      ],
      commonRejections: [
        { reason: 'README appears to have been written by AI', count: 4 },
        { reason: 'Project was already shipped to another Hack Club program', count: 2 },
        { reason: 'README is missing screenshots, motivation, and details', count: 1 }
      ]
    },
    {
      type: 'mac',
      label: 'Mac Playable',
      icon: 'app-store',
      intro: 'A native macOS app (.app bundle or .dmg).',
      pillsTitle: 'Build format',
      pills: [
        { label: 'Universal (arm64 + x86_64)', tone: 'good', note: 'Runs on every Mac sold in the last decade; friendliest for reviewers.' },
        { label: 'Apple Silicon only', tone: 'good', note: 'Fine for M-series Macs (2020+); label it clearly so Intel users know.' },
        { label: 'Intel only', tone: 'good', note: 'Works on older Macs and runs under Rosetta on M-series; label the arch.' }
      ],
      steps: [
        'Build a release .app bundle and zip it, or package as a .dmg.',
        'Upload to a GitHub Release.',
        'Add the download link as Demo URL and the repo as Code URL.',
        'Document the unsigned-app workaround: right-click then Open the first time (you almost certainly won\'t have a paid Apple Dev cert).',
        'Note in the README whether the build is Intel, Apple Silicon, or universal.'
      ]
    },
    {
      type: 'linux',
      label: 'Linux Playable',
      icon: 'tux',
      intro: 'A native Linux build: AppImage, .deb, .tar.gz, or a build script.',
      pillsTitle: 'Format choice',
      pills: [
        { label: 'AppImage', tone: 'good', note: 'Single executable that bundles its own deps; runs on most modern distros.' },
        { label: 'Tarball + launcher', tone: 'good', note: 'Works anywhere with the right runtime, but reviewers do more setup.' },
        { label: '.deb / .rpm', tone: 'good', note: 'Native package install on Debian/Ubuntu (deb) or Fedora/RHEL (rpm); distro-locked.' },
        { label: 'Build from source only', tone: 'bad', note: 'Reviewers won\'t install your toolchain just to try it.' }
      ],
      steps: [
        'Produce a runnable artifact. AppImage is easiest because it bundles its own deps.',
        'Upload to a GitHub Release.',
        'Add the download link as Demo URL and the repo as Code URL.',
        'In your README, list the distro you tested on and any system packages reviewers need.',
        'Make sure the file is executable (chmod +x) before zipping if relevant.'
      ],
      commonRejections: [
        { reason: 'README appears to have been written by AI', count: 1 },
        { reason: 'Demo URL points to the GitHub repo instead of an actual demo', count: 1 },
        { reason: 'Under the minimum-hours threshold', count: 1 }
      ]
    },
    {
      type: 'cross-platform',
      label: 'Cross Platform Compatible',
      icon: 'apps',
      intro: 'You ship builds for more than one OS. Reviewers only need at least one of them to actually work, so pick the platforms you can confidently test and don\'t spread yourself thin.',
      pillsTitle: 'Distribution',
      pills: [
        { label: 'Single GitHub Release', tone: 'good', note: 'All builds in one place so reviewers can compare and grab the right one.' },
        { label: 'GitHub Actions matrix build', tone: 'good', note: 'Reproducible cross-compile that proves your CI works; free for public repos.' }
      ],
      steps: [
        'Produce a build for each OS you want to advertise. As long as one of them runs cleanly for reviewers, you\'re fine.',
        'Upload every build to a single GitHub Release.',
        'Label each download clearly (myproject-win64.zip, myproject-mac-universal.dmg, myproject-linux.AppImage).',
        'Link the Release page in Demo URL.',
        'In your README, write a tiny table: platform, arch, tested OS version, and which one you tested most thoroughly.',
        'If you cross-compiled with GitHub Actions, link the workflow file. Reviewers love that.'
      ],
      tips: [
        'You don\'t need to ship every OS. Two builds you actually tested beats three you guessed at.'
      ],
      commonRejections: [
        { reason: 'Demo link is broken or unreachable (cannot SSH, cannot open in a browser, video link broken)', count: 4 },
        { reason: 'README is AI-written or missing the basics (description, tech stack, motivation)', count: 4 },
        { reason: 'Wrong or unrelated Hackatime project linked', count: 2 },
        { reason: 'Hackatime account is banned (referred to the Fraud Squad)', count: 2 },
        { reason: 'Project pre-dates the Beest start window', count: 2 },
        { reason: 'Under the 3-hour minimum', count: 2 },
        { reason: 'Repo is empty or only contains a README', count: 1 }
      ]
    },
    {
      type: 'python',
      label: 'Python',
      icon: 'code',
      intro: 'A standalone Python script, CLI tool, or desktop app. Reviewers won\'t install Python, your dependencies, or set up a virtualenv just to try your project, so you must ship a compiled binary they can double-click.',
      warning: 'Got a web app with a Python backend (Flask, FastAPI, Django, Streamlit)? That belongs under Web Playable, not here. The compile-to-binary path is for standalone scripts and desktop apps only.',
      pillsTitle: 'How to compile to a binary',
      pills: [
        { label: 'auto-py-to-exe (Windows)', tone: 'good', note: 'Friendly GUI on top of PyInstaller; produces a Windows .exe. Easiest first-time packager. pypi.org/project/auto-py-to-exe' },
        { label: 'PyInstaller (Windows / macOS / Linux)', tone: 'good', note: 'The underlying tool auto-py-to-exe wraps. Run it on Windows for .exe, macOS for .app, Linux for an ELF binary. Does not cross-compile.' },
        { label: 'py2app (macOS)', tone: 'good', note: 'macOS-native packager that builds proper .app bundles.' },
        { label: 'Nuitka (Windows / macOS / Linux)', tone: 'good', note: 'Compiles Python source to C and then to a native binary. Faster runtime and smaller surface area than the freezers.' },
        { label: 'cx_Freeze (Windows / macOS / Linux)', tone: 'good', note: 'Alternative freezer; cross-platform but again must be run on each target OS.' },
        { label: 'Briefcase / BeeWare (cross-platform + mobile)', tone: 'good', note: 'Targets desktop and mobile (iOS / Android) from a single Python codebase.' },
        { label: 'Shipping the raw .py file', tone: 'bad', note: 'Reviewers won\'t install Python or pip your deps. Always compile to a binary.' }
      ],
      steps: [
        'Pick a packager for your target OS from the list above.',
        'Run it on each OS you want to support. PyInstaller, py2app, Nuitka, and cx_Freeze do not cross-compile.',
        'Upload the binaries to a GitHub Release, one zip per platform.',
        'Put the Release link in Demo URL and your repo in Code URL.',
        'In the README, list each binary\'s OS and arch, plus any first-run steps (unblocking on Windows, right-click-Open on macOS).'
      ],
      tips: [
        'Test each binary on a clean virtual machine or a friend\'s laptop that doesn\'t have Python or your dev tools installed.'
      ],
      commonRejections: [
        { reason: 'README appears to have been written by AI', count: 3 },
        { reason: 'Project relies on AI beyond the 30% limit', count: 2 },
        { reason: 'All code committed in one go: reviewers cannot see incremental progress', count: 2 },
        { reason: 'Project was already shipped to another Hack Club program', count: 2 },
        { reason: 'Wrong or unrelated Hackatime project linked', count: 1 },
        { reason: 'Script needs to be shipped as a compiled binary (PyInstaller, py2app, etc.) instead of a raw .py file', count: 1 }
      ]
    },
    {
      type: 'android',
      label: 'Android Playable',
      icon: 'phone',
      intro: 'An Android app: APK or AAB.',
      pillsTitle: 'How reviewers install it',
      pills: [
        { label: 'GitHub Release APK', tone: 'good', note: 'Trusted distribution path with version tags; what reviewers expect.' },
        { label: 'Google Drive APK', tone: 'bad', note: 'Drive triggers "scan for harmful files" warnings, throttles big downloads, and can revoke the link. Use a GitHub Release for the APK.' },
        { label: 'Play Store upload', tone: 'meh', note: 'Great if you already have it set up, but the $25 developer fee plus review wait is not required for Beest. A GitHub Release APK is enough.' }
      ],
      steps: [
        'Build a release APK. Signed with a debug key is fine for review.',
        'Upload the APK to a GitHub Release.',
        'Put the APK link in Demo URL and your repo in Code URL.',
        'In your README, list the minSdk and any permissions the app requests.',
        'Mention "install from unknown sources" must be allowed. This is normal for sideloading.'
      ],
      tips: [
        'Record a short screen capture of the app running and link it from the README.'
      ],
      commonRejections: [
        { reason: 'README is AI-written or missing screenshots, motivation, and details', count: 2 }
      ]
    },
    {
      type: 'ios',
      label: 'iOS Playable',
      icon: 'app-store',
      intro: 'An iOS app. The trickiest to ship because Apple doesn\'t allow easy sideloading. A demo video linked in your README is always required, no exceptions.',
      pillsTitle: 'How reviewers see it',
      pills: [
        { label: 'Demo video linked in README', tone: 'good', note: 'Required for every iOS submission. Reviewers can\'t install unsigned builds, so the video is the only way they see your app working.' },
        { label: 'Reproducible Xcode project', tone: 'good', note: 'Required alongside the video: reviewers clone, open in Xcode, run on Simulator to verify the code matches what\'s in the video.' },
        { label: 'TestFlight invite', tone: 'good', note: 'Nice extra if you have it set up; lets reviewers test on real hardware. Does not replace the README demo video.' },
        { label: 'Just an .ipa link', tone: 'bad', note: 'Useless without a paid Dev cert; reviewers can\'t install unsigned builds.' }
      ],
      steps: [
        'Record a screen capture or device video showing the app running, and host it (YouTube, Vimeo, direct link).',
        'Embed (or link to) that video in your README. This is required for every iOS ship.',
        'Push the full Xcode project to a public GitHub repo.',
        'Write README build instructions: clone, open in Xcode, run on Simulator.',
        'Use Demo URL for the same video link.',
        'TestFlight is a nice extra but the README video + reproducible Xcode project is the required path.'
      ],
      tips: [
        'iOS Simulator is fine for review. No physical device needed.',
        'Make sure the project builds without a paid Apple Dev account (no signing-required entitlements).'
      ]
    },
    {
      type: 'hardware',
      label: 'Hardware',
      icon: 'sam',
      intro: 'A physical build: PCB, electronics, robot, sensor rig, anything you can hold.',
      pillsTitle: 'What goes in the repo',
      pills: [
        { label: 'Schematic PDF', tone: 'good', note: 'Lets reviewers skim your circuit without installing CAD software.' },
        { label: 'Board files (KiCad / EasyEDA)', tone: 'good', note: 'Source files prove you designed the board and let others remix it.' },
        { label: 'Bill of Materials', tone: 'good', note: 'Shows you understand what you built and roughly what it costs.' },
        { label: 'Firmware source', tone: 'good', note: 'Required so reviewers can read the code and reflash if needed.' },
        { label: 'Photos of the assembled build and it working', tone: 'good', note: 'Required. Reviewers want to see the hardware in front of you and the moment it actually does its thing (LED on, motor spinning, sensor read-out).' },
        { label: 'Gerbers (if PCB ordered)', tone: 'good', note: 'Manufacturing files that make the design fully reproducible.' },
        { label: 'Photos but no design source', tone: 'bad', note: 'Photos alone are not enough. Without schematics, board files, or firmware, reviewers cannot tell if you designed the build or bought it pre-assembled.' }
      ],
      steps: [
        'Push schematics, board files, firmware, and a Bill of Materials to GitHub.',
        'Export schematic and PCB layout as PDFs or PNGs so reviewers do not need KiCad or EasyEDA installed to skim the design.',
        'Write a Steps to Reproduce section in the README. A stranger should be able to follow it end-to-end: sourcing parts from the BoM, assembling, flashing the firmware, and verifying it works.',
        'Include a complete Bill of Materials with quantities, exact part numbers where they matter, and approximate costs.',
        'Commit progress as frequently as possible. Many small commits are required so reviewers can see the build evolve, not appear in a single dump.',
        'Record your build sessions with a timelapse tool. <a href="https://lapse.hackclub.com" target="_blank" rel="noopener">lapse.hackclub.com</a> is built for this and links straight into your submission.',
        'Keep a devlog with an entry roughly every hour of work.',
        'Take photos of the assembled build and of it actually working (LED on, motor spinning, sensor reading on a screen).',
        'Record a short demo video and link it as Demo URL.',
        'In the README also cover what it does, flashing instructions, and any safety notes (lipo, mains voltage, lasers).'
      ],
      tips: [
        'A complete Bill of Materials is non-negotiable. It is how reviewers verify you understand what you built and what it costs to reproduce.',
        'Hours count for soldering, debugging firmware, and PCB layout. Log all of it with <a href="https://lapse.hackclub.com" target="_blank" rel="noopener">lapse.hackclub.com</a>.'
      ]
    },
    {
      type: 'cad',
      label: 'CAD Models',
      icon: 'bounding-box',
      intro: 'Designs whose deliverable is a CAD file: 3D-printed parts, laser-cut designs, or mechanical assemblies. Review takes longer for this category because reviewers physically reproduce the design (printing, cutting, assembling), so the bar for documentation and reproducibility is higher than for software submissions.',
      pillsTitle: 'File formats',
      pills: [
        { label: 'Slicer-ready export (.stl / .3mf, or .dxf for laser cut)', tone: 'good', note: 'Required. This is the file reviewers drop straight into a slicer or laser-cutter workflow to reproduce your design.' },
        { label: 'STEP source (.step / .stp)', tone: 'good', note: 'Universal interchange format that stays fully editable in any CAD tool.' },
        { label: 'Native CAD source (.f3d, .scad, .ipt, .blend)', tone: 'good', note: 'Commit alongside the slicer-ready export so the design remains editable and remixable.' },
        { label: 'Source files only, with no slicer-ready export', tone: 'bad', note: 'Reviewers cannot open .blend, .f3d, or similar source files in a slicer. Without an .stl, .3mf, or .dxf export the design cannot be reproduced.' }
      ],
      steps: [
        'Commit a slicer-ready export (.stl or .3mf for 3D printing, .dxf for laser cutting). This is the file reviewers will actually use to reproduce your design.',
        'Commit the native CAD source alongside it so the design remains editable and remixable.',
        'Write a detailed README. Document all production settings that apply to your process: layer height, infill, supports, orientation, material, and kerf.',
        'Provide assembly instructions for any multi-part design. A labelled exploded view, photo sequence, or short build video are all acceptable.',
        'For mechanisms, prefer 3D-printed components over fasteners. Where fasteners are unavoidable, specify standard sizes (for example M3 or M4) so reviewers can source them.',
        'Commit progress regularly. Aim for roughly one commit per hour of work so reviewers can see the design evolve rather than appear in a single dump.',
        'Add 2 to 3 renders to the README and a photograph of the physical result next to the digital model. Use Demo URL for an exploded view or turntable video.'
      ],
      tips: [
        'Because CAD reviews require physical reproduction, ship everything a stranger would need to print or cut your project from scratch with no follow-up questions.',
        'If your CAD tool offers free public sharing (Onshape public documents, Fusion 360 web viewer), link that as well.'
      ]
    },
    {
      type: 'other',
      label: 'Other / Not Sure',
      icon: 'dice',
      intro: 'For projects that don\'t fit any of the categories above. The bar here is simple: write a good README, and if you aren\'t sure your project is shippable, ask in #beest-help on Hack Club Slack before submitting.',
      steps: [
        'Write a detailed README that clearly explains what the project is, how it works, and how a stranger would experience it.',
        'If you aren\'t sure the project qualifies, post a quick description in #beest-help on Hack Club Slack and a reviewer will let you know before you ship.'
      ]
    }
  ];
</script>

<svelte:head>
  <title>Shipping Guide — Beest</title>
</svelte:head>

<svelte:body class:guide-dark={darkMode} />

<button
  type="button"
  class="theme-toggle"
  class:dark={darkMode}
  onclick={toggleDark}
  aria-pressed={darkMode}
  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
>
  <span class="theme-toggle-icon" aria-hidden="true">{darkMode ? '☀' : '☾'}</span>
</button>

<div class="page" class:dark={darkMode}>
  <aside class="sidebar">
    <div class="sidebar-inner">
      <a href={resolve('/home')} class="back-btn sidebar-back-btn">← Back to main site</a>
      <div class="toc-title">Contents</div>
      <nav aria-label="Table of contents">
        <ol class="toc">
          {#each guides as g}
            <li><a href="#guide-{g.type}">{g.label}</a></li>
          {/each}
        </ol>
      </nav>
    </div>
  </aside>

  <main class="content">
    <h1 id="guide-top">Shipping Guide</h1>
    <p class="intro">Hey all! As of 05/05/2026, more than half of projects on #beest are being sent back for changes needed. I wrote this guide to document requirements for each project type, so that rejections shouldn't come as a surprise!</p>

    <div class="callout callout-warning">
      <span class="callout-icon" aria-hidden="true">!</span>
      <span>Record your work sessions with <a href="https://lapse.hackclub.com" target="_blank" rel="noopener">lapse.hackclub.com</a>. This is required alongside Hackatime for every submission, not just hardware and CAD builds, and reviewers use it to sanity-check claimed hours.</span>
    </div>

    {#each guides as guide (guide.type)}
      <section id="guide-{guide.type}" class="guide">
        <h2 class="guide-title">
          <svg class="sc-icon" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">{@html iconPaths[guide.icon]}</svg>
          <span class="guide-title-text">{guide.label}</span>
          {#if statByType[guide.type] && statByType[guide.type].sampleCount > 0}
            <span
              class="review-stat"
              title="Average time from submission to first review across {statByType[guide.type].sampleCount} {statByType[guide.type].sampleCount === 1 ? 'submission' : 'submissions'}"
            >
              ~{formatDuration(statByType[guide.type].avgSeconds)} avg review
            </span>
          {/if}
        </h2>

        <p class="guide-intro">{guide.intro}</p>

        {#if guide.warning}
          <div class="callout callout-warning">
            <span class="callout-icon" aria-hidden="true">!</span>
            <span>{guide.warning}</span>
          </div>
        {/if}

        {#if guide.pills && guide.pills.length > 0}
          {#if guide.pillsTitle}<h3 class="section-heading">{guide.pillsTitle}</h3>{/if}
          <ul class="check-list">
            {#each guide.pills as p}
              <li class="check-item check-{p.tone}">
                <span class="check-mark" aria-hidden="true">{p.tone === 'good' ? '✓' : p.tone === 'meh' ? '−' : '✗'}</span>
                <span class="check-body">
                  <span class="check-label">{p.label}</span>
                  <span class="check-note">{p.note}</span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}

        <h3 class="section-heading">Steps</h3>
        <ol class="steps">
          {#each guide.steps as step, idx}
            <li>
              <span class="step-num">{idx + 1}</span>
              <span>{@html step}</span>
            </li>
          {/each}
        </ol>

        {#if guide.commonRejections && guide.commonRejections.length > 0}
          <h3 class="section-heading">Common rejection reasons</h3>
          <ul class="rejection-list">
            {#each guide.commonRejections as r}
              <li class="rejection-item">
                <span class="rejection-count">×{r.count}</span>
                <span class="rejection-text">{r.reason}</span>
              </li>
            {/each}
          </ul>
        {/if}

        {#if guide.tips && guide.tips.length > 0}
          <div class="callout callout-tip">
            <ul class="callout-list">
              {#each guide.tips as tip}<li>{@html tip}</li>{/each}
            </ul>
          </div>
        {/if}
      </section>
    {/each}

  </main>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    transition: background-color 0.2s ease;
  }

  :global(body.guide-dark) {
    background-color: #0f0f10;
  }

  /* Force the system cursor inside the guide regardless of whether the
     layout's custom-cursor class is set. Beats the global `html.custom-cursor *`
     rule by specificity and !important. */
  :global(html.custom-cursor) .page,
  :global(html.custom-cursor) .page * {
    cursor: auto !important;
  }
  :global(html.custom-cursor) .page a,
  :global(html.custom-cursor) .page button,
  :global(html.custom-cursor) .page .toc a {
    cursor: pointer !important;
  }

  .page {
    --bg: #ffffff;
    --bg-soft: #fafafa;
    --bg-hover: #eeeeee;
    --bg-chip: #f5f5f5;
    --bg-chip-strong: #f5f5f5;
    --border: #e5e5e5;
    --border-strong: #888;
    --border-input: #1a1a1a;
    --text: #111111;
    --text-strong: #000000;
    --text-body: #1a1a1a;
    --text-muted: #333333;
    --text-dim: #4a4a4a;
    --text-soft: #666666;
    --text-faint: #888888;
    --step-bg: #000000;
    --step-fg: #ffffff;
    --link: #0a58c7;
    --link-hover: #003d8a;
    --good: #1a7a3a;
    --bad: #b91c1c;
    --rejection-bg: #fef2f2;
    --rejection-text: #4a1f1f;
    --warning-bg: #fef2f2;
    --warning-text: #7f1d1d;
    --tip-bg: #f5f5f5;
    --tip-border: #000000;

    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .page.dark {
    --bg: #0f0f10;
    --bg-soft: #161618;
    --bg-hover: #232327;
    --bg-chip: #1c1c1f;
    --bg-chip-strong: #232327;
    --border: #2a2a2d;
    --border-strong: #3a3a3e;
    --border-input: #44444a;
    --text: #e8e8ec;
    --text-strong: #f5f5f7;
    --text-body: #d8d8dc;
    --text-muted: #b8b8be;
    --text-dim: #9a9aa0;
    --text-soft: #888890;
    --text-faint: #6e6e75;
    --step-bg: #f1f1f3;
    --step-fg: #0f0f10;
    --link: #6ea8ff;
    --link-hover: #a9caff;
    --good: #4ade80;
    --bad: #f87171;
    --rejection-bg: rgba(248, 113, 113, 0.1);
    --rejection-text: #f3b4b4;
    --warning-bg: rgba(248, 113, 113, 0.12);
    --warning-text: #f3b4b4;
    --tip-bg: #1c1c1f;
    --tip-border: #f1f1f3;
  }

  /* Fixed sidebar */
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 240px;
    background: var(--bg-soft);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    z-index: 2;
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .theme-toggle {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 10;
    width: 2.75rem;
    height: 2.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: #1a1a1a;
    background: #ffffff;
    border: 1px solid #1a1a1a;
    border-radius: 50%;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }

  .theme-toggle.dark {
    color: #f5f5f7;
    background: #161618;
    border-color: #44444a;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  }

  .theme-toggle:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .theme-toggle.dark:hover {
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  }

  .theme-toggle:active {
    transform: translateY(0);
  }

  .theme-toggle-icon {
    font-size: 1.15rem;
    line-height: 1;
  }

  .sidebar-inner {
    display: flex;
    flex-direction: column;
    padding: 1.75rem 1.25rem;
    gap: 1rem;
  }

  .sidebar-back-btn {
    margin: 0 0 0.25rem;
    padding: 0.5rem 0.85rem;
    font-size: 0.85rem;
    text-align: center;
  }

  .toc-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-soft);
    margin: 0 0 0.75rem;
  }

  .toc {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    counter-reset: tocnum;
  }

  .toc li {
    counter-increment: tocnum;
  }

  .toc a {
    display: block;
    padding: 0.35rem 0.5rem;
    font-size: 0.88rem;
    color: var(--text-body);
    text-decoration: none;
    border-radius: 3px;
    line-height: 1.35;
  }

  .toc a::before {
    content: counter(tocnum) ". ";
    color: var(--text-faint);
  }

  .toc a:hover {
    background: var(--bg-hover);
    color: var(--text-strong);
  }

  /* Main content */
  .content {
    margin-left: 240px;
    padding: 3.5rem clamp(1.5rem, 5vw, 4rem) 4rem;
    max-width: 820px;
    box-sizing: border-box;
  }

  h1 {
    font-weight: 700;
    color: var(--text-strong);
    font-size: 2.25rem;
    margin: 0 0 0.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
  }

  .intro {
    color: var(--text-muted);
    margin: 0 0 2.5rem;
    font-size: 1rem;
    line-height: 1.6;
  }

  .guide {
    padding-bottom: 3rem;
    margin-bottom: 3rem;
    scroll-margin-top: 1rem;
    border-bottom: 1px solid var(--border-strong);
  }

  .guide:last-of-type {
    border-bottom: 0;
    margin-bottom: 1.5rem;
  }

  .guide-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-weight: 700;
    font-size: 1.5rem;
    color: var(--text-strong);
    border-bottom: 1px solid var(--border);
    margin: 0 0 0.85rem;
    padding-bottom: 0.4rem;
  }

  .guide-title-text {
    flex: 0 1 auto;
  }

  .review-stat {
    margin-left: auto;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-dim);
    background: var(--bg-chip-strong);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .sc-icon {
    width: 1.9rem;
    height: 1.9rem;
    flex-shrink: 0;
    color: var(--text-strong);
  }

  .guide-intro {
    color: var(--text-muted);
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 0 0 1rem;
  }

  .section-heading {
    font-size: 0.78rem;
    color: var(--text-strong);
    margin: 1.25rem 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  /* Checklist */
  .check-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .check-item {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    color: var(--text-body);
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .check-mark {
    flex-shrink: 0;
    width: 1.1rem;
    text-align: center;
    font-weight: 700;
  }

  .check-good .check-mark { color: var(--good); }
  .check-meh  .check-mark { color: var(--text-faint); }
  .check-bad  .check-mark { color: var(--bad); }

  .check-body {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    min-width: 0;
  }

  .check-label {
    color: var(--text-strong);
    font-weight: 600;
  }

  .check-note {
    color: var(--text-dim);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .check-bad .check-label {
    color: var(--text-dim);
    text-decoration: line-through;
    text-decoration-color: var(--bad);
  }

  .check-meh .check-label {
    color: var(--text-dim);
  }

  /* Inline links inside steps and callout text. The link markup comes from
     {@html step} / {@html tip}, which Svelte's scoper can't see — use :global. */
  .steps :global(a),
  .callout-list :global(a) {
    color: var(--link);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .steps :global(a:hover),
  .callout-list :global(a:hover) {
    color: var(--link-hover);
  }

  /* Steps */
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    color: var(--text-body);
    font-size: 0.95rem;
    line-height: 1.55;
  }

  .steps li {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
  }

  .step-num {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--step-bg);
    color: var(--step-fg);
    font-size: 0.8rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    margin-top: 0.05rem;
  }

  /* Common rejection reasons */
  .rejection-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .rejection-item {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    background: var(--rejection-bg);
    border-left: 3px solid var(--bad);
    border-radius: 4px;
    padding: 0.45rem 0.65rem;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-body);
  }

  .rejection-count {
    flex-shrink: 0;
    font-weight: 700;
    color: var(--bad);
    font-variant-numeric: tabular-nums;
    min-width: 1.6rem;
  }

  .rejection-text {
    color: var(--rejection-text);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Callouts */
  .callout {
    display: flex;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem;
    border-radius: 4px;
    margin: 0.6rem 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .callout-icon {
    flex-shrink: 0;
    font-weight: 700;
    line-height: 1.5;
    margin-top: 0.05rem;
  }

  .callout-tip {
    background: var(--tip-bg);
    border-left: 3px solid var(--tip-border);
    color: var(--text-body);
  }

  .callout-warning {
    background: var(--warning-bg);
    border-left: 3px solid var(--bad);
    color: var(--warning-text);
  }

  .callout-warning .callout-icon {
    color: var(--bad);
  }

  .callout-list {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  /* Back button */
  .back-btn {
    display: inline-block;
    margin: 2rem 0 0;
    padding: 0.55rem 1.25rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-body);
    background: var(--bg);
    border: 1px solid var(--border-input);
    border-radius: 4px;
    text-decoration: none;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .back-btn:hover {
    background: var(--bg-hover);
  }

  @media (max-width: 860px) {
    .sidebar {
      position: static;
      width: auto;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-inner {
      padding: 1rem 1.25rem;
    }
    .content {
      margin-left: 0;
      padding: 2rem 1.25rem 3rem;
    }
    h1 {
      font-size: 1.75rem;
    }
    .guide-title {
      font-size: 1.2rem;
    }
  }
</style>
