<script>
  import { Link } from "svelte-navigator";
  import { sysinfoStore } from "./DataStores.js";
  import { upgrade, upgradeWarningText } from "./UpgradeHelper";
  import {
    boardtype,
    isBusPowered,
    wiki,
    bcol,
    wifiStateFromRssi,
  } from "./Helpers.js";
  import { translationsStore } from "./TranslationService.js";
  import NeasLogo from "./../assets/neas_logotype_white.svg";
  import FavIco from "./../assets/favicon.svg";
  import Uptime from "./Uptime.svelte";
  import Badge from "./Badge.svelte";
  import Clock from "./Clock.svelte";
  import GearIcon from "./GearIcon.svelte";
  import InfoIcon from "./InfoIcon.svelte";
  import HelpIcon from "./HelpIcon.svelte";
  import WifiLowIcon from "./../assets/wifi-low-light.svg";
  import WifiMediumIcon from "./../assets/wifi-medium-light.svg";
  import WifiHighIcon from "./../assets/wifi-high-light.svg";
  import WifiOffIcon from "./../assets/wifi-off-light.svg";

  const WIFI_ICON_MAP = {
    high: WifiHighIcon,
    medium: WifiMediumIcon,
    low: WifiLowIcon,
    off: WifiOffIcon,
  };

  let wifiIcon = WIFI_ICON_MAP.off;
  let wifiTitle = "Wi-Fi offline";

  export const basepath = "/";
  export let data = {};
  let sysinfo = {};

  function askUpgrade() {
    if (
      confirm(
        ("Oppdater til {0}?").replace(
          "{0}",
          sysinfo.upgrade.n,
        ),
      )
    ) {
      upgrade(sysinfo.upgrade.n);
      sysinfoStore.update((s) => {
        s.upgrade.t = sysinfo.upgrade.n;
        s.upgrade.p = 0;
        s.upgrading = true;
        return s;
      });
    }
  }

  let progress;
  sysinfoStore.subscribe((update) => {
    sysinfo = update;
  });

  let translations = {};
  translationsStore.subscribe((update) => {
    translations = update;
  });

  $: {
    progress = Math.max(0, sysinfo.upgrade.p);
  }

  $: {
    const { level, label } = wifiStateFromRssi(data?.r);
    wifiIcon = WIFI_ICON_MAP[level] ?? WIFI_ICON_MAP.off;
    wifiTitle = label;
  }
</script>

<nav class="bg-neas-green-90 rounded-md">
  <div class="flex flex-wrap space-x-4 text-l text-neas-gray">
    <div class="flex text-xl text-neas-gray p-2 flex-auto">
      <Link to="/" class="flex items-center">
        <img class="w-36 h-auto" alt="Neas logo" src={NeasLogo} />
      </Link>
    </div>
    <div class="flex-none my-auto p-2 flex space-x-4">
      <div class="flex-none my-auto"><Uptime epoch={data.u} /></div>
      {#if data.t > -50}
        <div class="flex-none my-auto">
          {data.t > -50 ? data.t.toFixed(1) : "-"}&deg;C
        </div>
      {/if}
    </div>
    <div class="flex-auto flex-wrap my-auto justify-center p-2">
      <Badge
        title="Han-port"
        text="Han-port"
        color={bcol(sysinfo.booting ? 9 : data.hm)}
      />
      <Badge
        title="Minside"
        text="Minside"
        color={bcol(sysinfo.booting ? 9 : data.mm)}
      />
    </div>
    {#if data.he < 0 || data.he > 0}
      <div class="bd-red">
        {(translations.header?.han ?? "Han-port") +
          ": " +
          (translations.errors?.han?.[data.he] ?? data.he)}
      </div>
    {/if}
    {#if data.me < 0}
      <div class="bd-red">
        {(translations.header?.mqtt ?? "Minside") +
          ": " +
          (translations.errors?.mqtt?.[data.me] ?? data.me)}
      </div>
    {/if}a
    {#if data.ee > 0 || data.ee < 0}
      <div class="bd-red">
        {(translations.header?.price ?? "PS") +
          ": " +
          (translations.errors?.price?.[data.ee] ?? data.ee)}
      </div>
    {/if}
    <div class="flex-auto p-2 flex flex-row-reverse flex-wrap">
      <div class="flex-none flex text-xl text-neas-gray p-2 flex-auto">
        <img class="h-10 w-10" src={wifiIcon} alt={wifiTitle} />
      </div>
      <div class="flex-none my-auto px-2">
        <Clock
          timestamp={data.c ? new Date(data.c * 1000) : new Date(0)}
          offset={sysinfo.clock_offset}
          fullTimeColor="text-red-500"
        />
      </div>
  {#if sysinfo.usrcfg}
        <div
          class="flex-none px-1 mt-1 pt-[0.5rem]"
          title={translations.header?.config ?? ""}
        >
          <Link to="/configuration"><GearIcon /></Link>
        </div>
        <div
          class="flex-none px-1 mt-1 pt-[0.5rem]"
          title={translations.header?.status ?? ""}
        >
          <Link to="/status"><InfoIcon /></Link>
        </div>
      {/if}

      {#if sysinfo.upgrading}
        <div class="flex-none mr-3 my-auto">
          <div class="bg-neas-lightgreen-50/20 border border-neas-lightgreen-70/30 rounded-full px-4 py-2 backdrop-blur-sm">
            <div class="flex items-center gap-2">
              <div class="w-4 h-4">
                <svg class="animate-spin text-neas-lightgreen-70" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <span class="text-sm font-medium text-neas-lightgreen-70">
                Oppdaterer til {sysinfo.upgrade.t}, {progress.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      {:else if sysinfo.fwconsent === 1 && sysinfo.upgrade.n}
        <div class="flex-none mr-3 my-auto" title={"Ny oppdatering" + ": " + sysinfo.upgrade.n}>
          {#if sysinfo.security == 0 || data.a}
            <button 
              on:click={askUpgrade} 
              class="bg-neas-lightgreen-50/20 hover:bg-neas-lightgreen-50/30 border border-neas-lightgreen-70/30 hover:border-neas-lightgreen-70/50 rounded-full px-4 py-2 backdrop-blur-sm transition-all duration-200 hover:shadow-sm"
            >
              <div class="flex items-center gap-2">
                <div class="w-4 h-4">
                  <svg class="text-neas-lightgreen-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
                  </svg>
                </div>
                <span class="text-sm font-medium text-neas-lightgreen-70">
                  {"Ny oppdatering"}: {sysinfo.upgrade.n}
                </span>
              </div>
            </button>
          {:else}
            <div class="bg-neas-lightgreen-50/20 border border-neas-lightgreen-70/30 rounded-full px-4 py-2 backdrop-blur-sm">
              <div class="flex items-center gap-2">
                <div class="w-4 h-4">
                  <svg class="text-neas-lightgreen-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <span class="text-sm font-medium text-neas-lightgreen-70">
                  {"Ny oppdatering"}: {sysinfo.upgrade.n}
                </span>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</nav>
