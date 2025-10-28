<script>
  import { onDestroy, onMount } from "svelte";
  import NeasLogoGreen from "./../assets/neas_logo_green.svg";
  import NeasLogo from "./../assets/neas_logotype_white.svg";

  export let basepath = "/";

  let setupUrl = "http://192.168.4.1/setup";
  let isCaptivePortal = false;
  let isIosPortal = false;
  let isMacPortal = false;
  let isAndroidPortal = false;
  let copyState = "idle";
  let closeInstructionsVisible = false;
  let closeAttempted = false;
  let closeSucceeded = false;

  onMount(() => {
    setupUrl = resolveSetupUrl();

    detectCaptivePortal();
  });

  onDestroy(() => {
  });

  function resolveSetupUrl() {
    const fallbackSetup = "http://192.168.4.1/setup";

    try {
      const base = new URL(basepath || "/", window.location.href);
      const setup = new URL("./setup", base).href;
      return setup;
    } catch (err) {
      return fallbackSetup;
    }
  }

  function detectCaptivePortal() {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const patterns = [
      /CaptiveNetworkSupport/i,
      /CaptivePortalLogin/i,
      /WISPr/i,
      /Microsoft\s?NCSI/i,
      /MiniBrowser/i,
      /PortalApp/i,
      /CaptiveNetworkWebSheet/i,
    ];

    isIosPortal = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    isMacPortal = /Macintosh|Mac OS X/.test(ua);
    isAndroidPortal = /Android/.test(ua);

    isCaptivePortal = patterns.some((pattern) => pattern.test(ua));
    isIosPortal = isCaptivePortal && isIosPortal;
    isMacPortal = isCaptivePortal && isMacPortal && !isIosPortal;
    isAndroidPortal = isCaptivePortal && isAndroidPortal;

    return isCaptivePortal;
  }

  async function copySetupUrl(event) {
    event?.preventDefault?.();
    copyState = "pending";

    const fallbackCopy = () => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = setupUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        return success;
      } catch (err) {
        return false;
      }
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(setupUrl);
        copyState = "success";
      } else if (fallbackCopy()) {
        copyState = "success";
      } else {
        copyState = "error";
      }
    } catch (error) {
      if (fallbackCopy()) {
        copyState = "success";
      } else {
        copyState = "error";
      }
    }

    if (copyState === "success") {
      if (isCaptivePortal) {
        attemptCloseCaptiveWindow();
        closeInstructionsVisible = true;
      }

      setTimeout(() => {
        copyState = "idle";
      }, 3000);
    }
  }

  function attemptCloseCaptiveWindow() {
    if (!isCaptivePortal || closeAttempted) {
      return;
    }

    closeAttempted = true;

    let wasClosed = false;

    try {
      window.close();
      wasClosed = window.closed;
    } catch (err) {
      wasClosed = false;
    }

    if (!wasClosed) {
      // Try a common workaround where the captive window allows replacing itself first.
      try {
        window.open("", "_self");
        window.close();
        wasClosed = window.closed;
      } catch (err) {
        wasClosed = false;
      }
    }

    if (wasClosed) {
      closeSucceeded = true;
      return;
    }

    setTimeout(() => {
      if (window.closed || document.visibilityState === "hidden") {
        closeSucceeded = true;
      }
    }, 400);
  }
</script>

<div class="min-h-screen bg-white sm:bg-neas-green flex flex-col items-center p-0 sm:p-4">
    <!-- Neas Logo -->
    <div class="mb-4 sm:mb-8 mt-8 sm:mt-0">
        <img alt="Neas logo" src={NeasLogoGreen} class="w-36 h-auto sm:hidden" />
        <img alt="Neas logo" src={NeasLogo} class="w-36 h-auto hidden sm:block" />
    </div>

    <!-- Main Card -->
    <div class="bg-white dark:white border-0 sm:border sm:border-neas-lightgreen-30 shadow-none sm:shadow-xl sm:shadow-black/10 rounded-none sm:rounded-3xl max-w-none sm:max-w-md w-full flex-1 sm:flex-none p-6 sm:p-8">
        <div class="text-center mb-8">
            <h1 class="text-2xl font-semibold text-neas-green mb-2">
                Gå til oppsettet i nettleseren din
            </h1>
            <p class="text-sm text-black">
                Dette vinduet er bare tilkoblingshjelp. Kopier adressen under, lukk vinduet, og lim den inn i nettleseren du vil bruke.
            </p>
        </div>

        <div class="space-y-6">
            <div class="rounded-2xl bg-neas-gray p-5 shadow-sm">
                <p class="font-medium text-neas-green mb-3">1. Kopier adressen</p>
                <p class="text-sm text-black mb-3">
                    Adressen er <code class="rounded bg-white px-2 py-1 font-mono text-sm text-neas-green shadow-sm">{setupUrl}</code> og virker mens du er tilkoblet <strong>NEAS-WATTUP</strong>.
                </p>
                <div class="flex flex-wrap items-center gap-3">
                    <button
                        class="bg-neas-green hover:bg-neas-green-90 text-white font-medium py-2 px-4 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neas-green focus:ring-offset-2"
                        on:click={copySetupUrl}
                    >
                        {#if copyState === "pending"}
                            Kopierer…
                        {:else if copyState === "success"}
                            Kopiert!
                        {:else if copyState === "error"}
                            Kopier mislyktes
                        {:else}
                            Kopier til utklippstavlen
                        {/if}
                    </button>
                    <span class="text-xs text-black">
                        {#if copyState === "success"}
                            Lim adressen inn i nettleserens adresselinje.
                        {:else if copyState === "error"}
                            Marker adressen og kopier manuelt (for eksempel med ⌘+C).
                        {:else}
                            Trykk knappen, eller marker og kopier adressen manuelt.
                        {/if}
                    </span>
                    {#if closeAttempted && !closeSucceeded}
                        <span class="text-xs text-black">
                            Vi forsøker å lukke vinduet automatisk. Hvis det fortsatt er åpent, lukk det selv og følg stegene under.
                        </span>
                    {/if}
                    {#if closeSucceeded}
                        <span class="text-xs text-black">
                            Vinduet skal lukke seg automatisk om et øyeblikk.
                        </span>
                    {/if}
                </div>
            </div>

            <div class="rounded-2xl bg-neas-gray p-5 shadow-sm">
                <p class="font-medium text-neas-green mb-3">2. Åpne den i nettleseren</p>
                <div class="space-y-2">
                    {#if isIosPortal}
                        <ol class="list-decimal space-y-1 pl-5 text-sm text-black">
                            <li>Kopier adressen.</li>
                            <li>Trykk <strong>Ferdig</strong> øverst til høyre.</li>
                            <li>Velg <strong>Behold tilkoblingen</strong>.</li>
                            <li>Åpne Safari og lim inn adressen i adresselinjen.</li>
                        </ol>
                    {:else if isMacPortal}
                        <ol class="list-decimal space-y-1 pl-5 text-sm text-black">
                            <li>Kopier adressen.</li>
                            <li>Lukk vinduet.</li>
                            <li>Når dialogen dukker opp, velg <strong>Fortsett uten internett</strong>.</li>
                            <li>Åpne Safari og lim inn adressen (⌘+V).</li>
                        </ol>
                    {:else if isAndroidPortal}
                        <ol class="list-decimal space-y-1 pl-5 text-sm text-black">
                            <li>Kopier adressen.</li>
                            <li>Trykk tilbakeknappen for å lukke vinduet.</li>
                            <li>Åpne Chrome (eller ønsket nettleser) og lim inn adressen.</li>
                        </ol>
                    {:else}
                        <p class="text-sm text-black">Kopier adressen, lukk dette vinduet, velg <strong>Fortsett uten nettverk/internet (Continue without network)</strong> og lim adressen inn i nettleseren du foretrekker.</p>
                    {/if}
                </div>
            </div>

            {#if isCaptivePortal && closeInstructionsVisible}
                <div class="rounded-2xl bg-neas-gray p-5 shadow-sm">
                    <p class="font-medium text-neas-green mb-3">Tips når du lukker vinduet</p>
                    <p class="text-sm text-black">
                        Velg <strong>Behold tilkoblingen</strong> eller <strong>Fortsett uten internett</strong> dersom du får spørsmål. Unngå «Koble fra nettverket», ellers mister du forbindelsen til enheten.
                    </p>
                </div>
            {/if}
        </div>
    </div>
</div>
