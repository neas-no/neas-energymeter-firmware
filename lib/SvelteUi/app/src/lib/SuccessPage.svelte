<script>
  import NeasLogoGreen from "./../assets/neas_logo_green.svg";
  import NeasLogo from "./../assets/neas_logotype_white.svg";

  const MIN_SIDE_URL = "https://minside.neas.no/dashboard/home";
</script>

<div class="min-h-screen bg-white sm:bg-neas-green flex flex-col items-center p-0 sm:p-4">
  <div class="mb-4 sm:mb-8 mt-8 sm:mt-0">
    <img alt="Neas logo" src={NeasLogoGreen} class="w-36 h-auto sm:hidden" />
    <img alt="Neas logo" src={NeasLogo} class="w-36 h-auto hidden sm:block" />
  </div>

  <div class="bg-white dark:white border-0 sm:border sm:border-neas-lightgreen-30 shadow-none sm:shadow-xl sm:shadow-black/10 rounded-none sm:rounded-3xl max-w-none sm:max-w-md w-full flex-1 sm:flex-none p-6 sm:p-8">
    <div class="space-y-6 text-center">
      <div class="space-y-3">
        <h1 class="text-2xl font-semibold text-neas-green">Gratulerer!</h1>
        <p class="text-m text-black">
          Enheten kobler nå til hjemmenettverket ditt og sender data automatisk.
        </p>
        <p class="text-m text-black">
          Koble telefonen eller PC-en til hjemmenettverket ditt og åpne <strong>Min side</strong> for å følge strømforbruket.
        </p>
      </div>

      <a
        href={MIN_SIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center w-full bg-neas-green hover:bg-neas-green-90 text-white font-large py-3 px-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
      >
        Gå til Min side
      </a>
    </div>
  </div>
</div>
