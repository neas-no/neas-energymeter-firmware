<script>
  import { Router, Route, navigate } from "svelte-navigator";
  import {
    getTariff,
    tariffStore,
    sysinfoStore,
    dataStore,
    pricesStore,
    dayPlotStore,
    monthPlotStore,
    temperaturesStore,
    getSysinfo,
  } from "./lib/DataStores.js";
  import {
    translationsStore,
    getTranslations,
  } from "./lib/TranslationService.js";
  import Favicon from "./assets/favicon.svg"; // Need this for the build
  import NeasLogo from "./assets/neas_logotype_white.svg";
  import WifiLowIcon from "./assets/wifi-low-light.svg";
  import WifiMediumIcon from "./assets/wifi-medium-light.svg";
  import WifiHighIcon from "./assets/wifi-high-light.svg";
  import WifiOffIcon from "./assets/wifi-off-light.svg";
  import Header from "./lib/Header.svelte";
  import Dashboard from "./lib/Dashboard.svelte";
  import ConfigurationPanel from "./lib/ConfigurationPanel.svelte";
  import StatusPage from "./lib/StatusPage.svelte";
  import SetupPanel from "./lib/SetupPanel.svelte";
  import SuccessPage from "./lib/SuccessPage.svelte";
  import Mask from "./lib/Mask.svelte";
  import FileUploadComponent from "./lib/FileUploadComponent.svelte";
  import PriceConfig from "./lib/PriceConfig.svelte";
  import DataEdit from "./lib/DataEdit.svelte";
  import { updateRealtime } from "./lib/RealtimeStore.js";
  import { onMount, onDestroy } from "svelte";

  let basepath = document.getElementsByTagName("base")[0].getAttribute("href");
  if (!basepath) basepath = "/";

  let developerMode = false;
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      developerMode = params.get("developer") === "1";
    } catch (err) {
      developerMode = false;
    }
  }

  getTranslations("no");

  let prices;
  pricesStore.subscribe((update) => {
    prices = update;
  });

  let dayPlot;
  dayPlotStore.subscribe((update) => {
    dayPlot = update;
  });

  let monthPlot;
  monthPlotStore.subscribe((update) => {
    monthPlot = update;
  });

  let temperatures;
  temperaturesStore.subscribe((update) => {
    temperatures = update;
  });

  let translations = {};
  translationsStore.subscribe((update) => {
    translations = update;
  });

  let sito;
  let data = {};
  let sysinfo = {};
  let currentVersion;
  const normalizePathname = (pathname = "") => {
    if (typeof pathname !== "string") {
      return "/";
    }

    let normalized = pathname || "/";

    if (basepath && basepath !== "/" && normalized.startsWith(basepath)) {
      normalized = normalized.slice(basepath.length);
      if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
      }
    }

    if (!normalized.startsWith("/")) {
      normalized = `/${normalized}`;
    }

    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, "");
    }

    return normalized || "/";
  };

  const headerFriendlyPaths = [
    "/dashboard",
    "/configuration",
    "/status",
    "/priceconfig",
    "/mqtt-ca",
    "/mqtt-cert",
    "/mqtt-key",
  ];

  sysinfoStore.subscribe((update) => {
    sysinfo = update;
    const currentPath = (() => {
      if (typeof window === "undefined") return "";
      const normalized = normalizePathname(window.location.pathname ?? "/");
      return normalized.replace(/^\/+/, "");
    })();

    const isConfigured = sysinfo?.usrcfg === true;

    if (!developerMode) {
      if (sysinfo?.usrcfg === false) {
        if (currentPath !== "setup") {
          navigate(basepath + "setup", { replace: true });
        }
      } else if (isConfigured && (currentPath === "" || currentPath === "/" || currentPath === "setup")) {
        navigate(basepath + "velkommen", { replace: true });
      }
    }

    if (sysinfo.ui.k === 1) {
      document.documentElement.classList.add("dark");
    } else if (sysinfo.ui.k === 0) {
      document.documentElement.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    if (sysinfo.ui.lang && sysinfo.ui.lang != translations?.language?.code) {
      getTranslations(sysinfo.ui.lang);
    }

    if (
      sysinfo.version &&
      currentVersion &&
      sysinfo.version != currentVersion
    ) {
      window.location.reload();
    }

    currentVersion = sysinfo.version;

    if (sito) clearTimeout(sito);
    sito = setTimeout(
      getSysinfo,
      !data || !data.u || data.u < 30 || sysinfo?.upgrading ? 10000 : 300000,
    );
  });

  dataStore.subscribe((update) => {
    data = update;
    updateRealtime(update);
  });

  let tariffData = {};
  tariffStore.subscribe((update) => {
    tariffData = update;
  });
  getTariff();

  let currentPathname =
    typeof window !== "undefined"
      ? normalizePathname(window.location.pathname ?? "/")
      : "/";

  const shouldHideHeaderPath = (pathname = "/") => {
    if (developerMode) {
      return pathname === "/setup" || pathname === "/velkommen";
    }
    return !headerFriendlyPaths.includes(pathname);
  };

  const updateCurrentPathname = () => {
    if (typeof window !== "undefined") {
      currentPathname = normalizePathname(window.location.pathname ?? "/");
    }
  };

  $: hideHeader = shouldHideHeaderPath(currentPathname);

  onMount(() => {
    updateCurrentPathname();

    const handlePopState = () => updateCurrentPathname();
    window.addEventListener("popstate", handlePopState);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      updateCurrentPathname();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      updateCurrentPathname();
    };

    return () => {
      window.removeEventListener("popstate", handlePopState);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  onDestroy(() => {
    updateCurrentPathname();
  });
</script>

<div class="container mx-auto m-3">
  <Router {basepath}>
    {#if !hideHeader}
      <Header {data} {basepath} {developerMode} />
    {/if}
    {#if developerMode}
      <Route path="/">
        <Dashboard
          {data}
          {sysinfo}
          {prices}
          {dayPlot}
          {monthPlot}
          {temperatures}
          {translations}
          {tariffData}
        />
      </Route>
        <Route path="/dashboard">
          <Dashboard
            {data}
            {sysinfo}
            {prices}
            {dayPlot}
            {monthPlot}
            {temperatures}
            {translations}
            {tariffData}
          />
        </Route>
      <Route path="/configuration">
        <ConfigurationPanel {sysinfo} {basepath} {data} />
      </Route>
      <Route path="/priceconfig">
        <PriceConfig {basepath} />
      </Route>
      <Route path="/status">
        <StatusPage {sysinfo} {data} />
      </Route>
      <Route path="/mqtt-ca">
        <FileUploadComponent title="CA" action="/mqtt-ca" />
      </Route>
      <Route path="/mqtt-cert">
        <FileUploadComponent title="certificate" action="/mqtt-cert" />
      </Route>
      <Route path="/mqtt-key">
        <FileUploadComponent title="private key" action="/mqtt-key" />
      </Route>
      <Route path="/setup">
        <SetupPanel {sysinfo} {data} />
      </Route>
      <Route path="/velkommen">
        <SuccessPage />
      </Route>
      <Route path="/edit-day">
        <DataEdit prefix="UTC Hour" data={dayPlot} url="/dayplot" {basepath} />
      </Route>
      <Route path="/edit-month">
        <DataEdit prefix="Day" data={monthPlot} url="/monthplot" {basepath} />
      </Route>
    {:else}
      <Route path="/setup">
        <SetupPanel {sysinfo} {data} />
      </Route>
      <Route path="/dashboard">
        <Dashboard
          {data}
          {sysinfo}
          {prices}
          {dayPlot}
          {monthPlot}
          {temperatures}
          {translations}
          {tariffData}
        />
      </Route>
      <Route path="/configuration">
        <ConfigurationPanel {sysinfo} {basepath} {data} />
      </Route>
      <Route path="/status">
        <StatusPage {sysinfo} {data} />
      </Route>
      <Route path="/velkommen">
        <SuccessPage />
      </Route>
      <Route path="*">
        <Dashboard
          {data}
          {sysinfo}
          {prices}
          {dayPlot}
          {monthPlot}
          {temperatures}
          {translations}
          {tariffData}
        />
      </Route>
    {/if}
  </Router>

  {#if sysinfo.booting}
    {#if sysinfo.trying}
      <Mask
        active="true"
        message="Device is booting, please wait. Trying to reach it on {sysinfo.trying}"
      />
    {:else}
      <Mask active="true" message="Device is booting, please wait" />
    {/if}
  {/if}
</div>
