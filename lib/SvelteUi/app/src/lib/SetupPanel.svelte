<script>
    import { onMount, onDestroy } from "svelte";
    import { sysinfoStore, networksStore } from "./DataStores.js";
    import { get } from "svelte/store";
    import { configurationStore, getConfiguration } from "./ConfigurationStore";
    import { translationsStore } from "./TranslationService.js";
    import Mask from "./Mask.svelte";
    import SubnetOptions from "./SubnetOptions.svelte";
    import {
        scanForDevice,
        charAndNumPattern,
        asciiPatternExt,
        ipPattern,
        wifiStateFromRssi,
    } from "./Helpers.js";
    import WifiLowIcon from "./../assets/wifi-low.svg";
    import WifiMediumIcon from "./../assets/wifi-medium.svg";
    import WifiHighIcon from "./../assets/wifi-high.svg";
    import WifiOffIcon from "./../assets/wifi-off.svg";
    import {
        meterPresets,
        getMeterPresetById,
        buildMeterStateFromPreset,
        createMeterStateFromConfiguration,
        describePresetSummary,
    } from "./meterPresets.js";
    import {
        detectMeterType,
        getBestPresetRecommendation,
    } from "./MeterDetectionService.js";
    import NeasLogo from "./../assets/neas_logotype_white.svg";
    import NeasLogoGreen from "./../assets/neas_logo_green.svg";

    const WIFI_ICON_MAP = {
        high: WifiHighIcon,
        medium: WifiMediumIcon,
        low: WifiLowIcon,
        off: WifiOffIcon,
    };

    let wifiIcon = WIFI_ICON_MAP.off;
    let wifiTitle = "Wi-Fi frakoblet";

    let translations = {};
    translationsStore.subscribe((update) => {
        translations = update;
    });

    let configuration;
    let meterState;
    let meterStateInitialized = false;
    let selectedMeterPresetId = "";
    let selectedMeterPreset = null;
    let autoDetectionResults = null;
    let showAutoDetection = false;

    const unsubscribeConfiguration = configurationStore.subscribe((update) => {
        configuration = update;
        if (update?.m && !meterStateInitialized) {
            meterState = createMeterStateFromConfiguration(update.m);
            meterStateInitialized = true;
        }
    });

    onMount(() => {
        getConfiguration();

        setTimeout(() => {
            attemptAutoDetection();
        }, 3000);
    });

    // Monitor data changes for automatic detection
    $: if (data && data.mt !== undefined && !showAutoDetection) {
        // Re-run detection when new data arrives
        setTimeout(() => attemptAutoDetection(), 500);
    }

    onDestroy(() => {
        if (typeof unsubscribeConfiguration === "function") {
            unsubscribeConfiguration();
        }
    });

    function ensureMeterState() {
        if (!meterStateInitialized && configuration?.m) {
            meterState = createMeterStateFromConfiguration(configuration.m);
            meterStateInitialized = true;
        }
        if (!meterState && configuration?.m) {
            meterState = createMeterStateFromConfiguration(configuration.m);
        }
    }

    function handlePresetSelection(presetId) {
        ensureMeterState();
        selectedMeterPresetId = presetId;
        const preset = getMeterPresetById(presetId);
        selectedMeterPreset = preset ?? null;
        if (preset) {
            meterState = buildMeterStateFromPreset(meterState, preset);
        } else if (configuration?.m) {
            meterState = createMeterStateFromConfiguration(configuration.m);
        }
    }

    function clearPresetSelection() {
        selectedMeterPresetId = "";
        selectedMeterPreset = null;
        if (configuration?.m) {
            meterState = createMeterStateFromConfiguration(configuration.m);
        }
    }

    function attemptAutoDetection() {
        if (!data) return;

        const meterData = {
            meterId: data.id || "",
            meterModel: data.model || "",
        };

        const commConfig = configuration?.m
            ? {
                  baud: configuration.m.b || 0,
                  parity: getParityString(configuration.m.p || 0),
                  invert: configuration.m.i || false,
              }
            : null;

        // Use the live payload data for enhanced detection
        autoDetectionResults = detectMeterType(meterData, commConfig, data);

        if (
            autoDetectionResults.confidence > 50 &&
            autoDetectionResults.suggestedPresets.length > 0
        ) {
            showAutoDetection = true;
        }
    }

    function getParityString(parityCode) {
        const parityMap = {
            2: "7N1",
            3: "8N1",
            7: "8N2",
            10: "7E1",
            11: "8E1",
        };
        return parityMap[parityCode] || "8E1";
    }

    function applyAutoDetectedPreset() {
        if (
            autoDetectionResults &&
            autoDetectionResults.suggestedPresets.length > 0
        ) {
            const recommendedPresetId =
                autoDetectionResults.suggestedPresets[0];
            handlePresetSelection(recommendedPresetId);
            showAutoDetection = false;
        }
    }

    function dismissAutoDetection() {
        showAutoDetection = false;
    }

    function buildMeterPayload() {
        ensureMeterState();
        const state =
            meterState ?? createMeterStateFromConfiguration(configuration?.m);
        if (!state) {
            return null;
        }
        const cfg = configuration?.m ?? {};
        return {
            source: state.source ?? cfg.o ?? 1,
            parser: state.parser ?? cfg.a ?? 0,
            baud: state.baud ?? cfg.b ?? 0,
            parity: state.parity ?? cfg.p ?? 3,
            invert: state.invert ?? cfg.i ?? false,
            distributionSystem: state.distributionSystem ?? cfg.d ?? 2,
            mainFuse: state.mainFuse ?? cfg.f ?? 0,
            production: state.production ?? cfg.r ?? 0,
            buffer: state.buffer ?? cfg.s ?? 256,
            encrypted: state.encrypted ?? cfg?.e?.e ?? false,
            encryptionKey: state.encryptionKey ?? cfg?.e?.k ?? "",
            authenticationKey: state.authenticationKey ?? cfg?.e?.a ?? "",
            multipliers: {
                watt: state.multipliers?.watt ?? cfg?.m?.w ?? 1,
                volt: state.multipliers?.volt ?? cfg?.m?.v ?? 1,
                amp: state.multipliers?.amp ?? cfg?.m?.a ?? 1,
                kwh: state.multipliers?.kwh ?? cfg?.m?.c ?? 1,
            },
        };
    }

    let manual = false;
    let networks = {};
    networksStore.subscribe((update) => {
        networks = update;
    });

    export let sysinfo = {};
    export let data = {};

    let staticIp = false;
    let connectionMode = 1;
    let loadingOrSaving = false;
    let reconnectTargets = [];
    let networkSignalInfos = [];
    let selectedSsid = "";

    function updateSysinfo(url) {
        sysinfoStore.update((s) => {
            s.trying = url;
            return s;
        });
    }

    async function handleSubmit(e) {
        loadingOrSaving = true;
        const formData = new FormData(e.target);
        const data = new URLSearchParams();
        for (let field of formData) {
            const [key, value] = field;
            data.append(key, typeof value === "string" ? value : String(value));
        }

        const meterPayload = buildMeterPayload();
        if (meterPayload) {
            data.set("m", "true");
            data.set("mo", String(meterPayload.source ?? 1));
            data.set("ma", String(meterPayload.parser ?? 0));
            data.set("mb", String(meterPayload.baud ?? 0));
            data.set("mp", String(meterPayload.parity ?? 3));
            data.set("mi", meterPayload.invert ? "true" : "false");
            data.set("md", String(meterPayload.distributionSystem ?? 2));
            data.set("mf", String(meterPayload.mainFuse ?? 0));
            data.set("mr", String(meterPayload.production ?? 0));
            data.set("ms", String(meterPayload.buffer ?? 256));
            if (meterPayload.encrypted) {
                data.set("me", "true");
                data.set("mek", meterPayload.encryptionKey ?? "");
                data.set("mea", meterPayload.authenticationKey ?? "");
            }
            data.set("mmw", String(meterPayload.multipliers?.watt ?? 1));
            data.set("mmv", String(meterPayload.multipliers?.volt ?? 1));
            data.set("mma", String(meterPayload.multipliers?.amp ?? 1));
            data.set("mmc", String(meterPayload.multipliers?.kwh ?? 1));
        }

        data.set("fwa", "true");
        data.set("fws", data.get("fws") ?? "2");
        data.set("fwe", data.get("fwe") ?? data.get("fws") ?? "2");
        data.set("sf", "1");
        data.set("ulang", "no");

        const response = await fetch("save", {
            method: "POST",
            body: data,
        });
        let res = await response.json();
        loadingOrSaving = false;

        const hostFromForm = String(formData.get("sh") ?? "").trim();
        const message = typeof res.message === "string" ? res.message : "";
        const hintParts = message.split("|").map((part) => part.trim());
        const hintHost = hintParts[0] ?? "";
        const hintMdns = hintParts[1] ?? "";
        const hintIp = hintParts[2] ?? "";
        const fallbackHostname =
            hintHost ||
            hostFromForm ||
            sysinfo.hostname ||
            (sysinfo?.chipId ? `ams-${sysinfo.chipId}` : "ams-reader");
        const fallbackMdns =
            hintMdns ||
            (fallbackHostname &&
            fallbackHostname.indexOf(".") === -1 &&
            fallbackHostname.indexOf(":") === -1
                ? `${fallbackHostname}.local`
                : fallbackHostname);
        const staticIpValue = staticIp
            ? String(formData.get("si") ?? "").trim()
            : hintIp;
        const uniqueTargets = Array.from(
            new Set(
                [staticIpValue, fallbackHostname, fallbackMdns].filter(
                    (val) => val && val.length > 0,
                ),
            ),
        );
        reconnectTargets = res.reboot ? [...uniqueTargets] : [];

        sysinfoStore.update((s) => {
            if (!s.net) s.net = {};
            const computedHostname =
                fallbackHostname || s.hostname || hostFromForm;
            s.hostname = computedHostname;
            if (!s.upgrade || typeof s.upgrade !== "object") {
                s.upgrade = { x: -1, e: 0, f: null, t: null, m: false };
            }
            s.upgrade.auto = true;
            s.fwconsent = 1;
            if (!s.ui || typeof s.ui !== "object") {
                s.ui = {};
            }
            s.ui.lang = "no";
            if (staticIp) {
                s.net.ip = staticIpValue;
                s.net.mask = formData.get("su");
                s.net.gw = formData.get("sg");
                s.net.dns1 = formData.get("sd");
            } else if (hintIp) {
                s.net.ip = hintIp;
            }
            s.targets = [...uniqueTargets];
            s.usrcfg = res.success;
            s.booting = res.reboot;
            return s;
        });

        const latestSysinfo = get(sysinfoStore);
        sysinfo = latestSysinfo;
        if (res.reboot) {
            setTimeout(() => scanForDevice(latestSysinfo, updateSysinfo), 5000);
        }
    }
    $: {
        const { level, label } = wifiStateFromRssi(data?.r);
        wifiIcon = WIFI_ICON_MAP[level] ?? WIFI_ICON_MAP.off;
        wifiTitle = label;
    }

    $: networkSignalInfos = Array.isArray(networks?.n)
        ? networks.n.map((net) => {
              const { level, label } = wifiStateFromRssi(net?.r);
              return {
                  icon: WIFI_ICON_MAP[level] ?? WIFI_ICON_MAP.off,
                  title: label,
                  rssi: typeof net?.r === "undefined" ? null : net.r,
              };
          })
        : [];
</script>

<div
    class="min-h-screen bg-white sm:bg-neas-green flex flex-col items-center p-0 sm:p-4"
>
    <!-- Neas Logo -->
    <div class="mb-4 sm:mb-8 mt-8 sm:mt-0">
        <img
            alt="Neas logo"
            src={NeasLogoGreen}
            class="w-36 h-auto sm:hidden"
        />
        <img
            alt="Neas logo"
            src={NeasLogo}
            class="w-36 h-auto hidden sm:block"
        />
    </div>

    <!-- Main Card -->
    <div
        class="bg-white dark:white border-0 sm:border sm:border-neas-lightgreen-30 shadow-none sm:shadow-xl sm:shadow-black/10 rounded-none sm:rounded-3xl max-w-none sm:max-w-md w-full flex-1 sm:flex-none p-6 sm:p-8"
    >
        <form on:submit|preventDefault={handleSubmit}>
            <input type="hidden" name="s" value="true" />
            <input type="hidden" name="fw" value="true" />
            <input type="hidden" name="sf" value="1" />
            <input type="hidden" name="ulang" value="no" />
            <input type="hidden" name="fwa" value="true" />
            <input type="hidden" name="fws" value="2" />
            <input type="hidden" name="fwe" value="2" />

            <!-- Title -->
            <div class="text-center mb-8">
                <h1 class="text-2xl font-semibold text-neas-green mb-2">
                    {translations.setup?.title ?? "WiFi-oppsett"}
                </h1>
                <p class="text-sm text-black">
                    {translations.setup?.subtitle ??
                        "Koble enheten til internett"}
                </p>
            </div>

            <!-- WiFi Network Selection -->
            <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                    <span
                        class="block text-sm font-medium text-neas-green dark:text-neas-green"
                    >
                        {translations.conf?.connection?.ssid ?? "Velg nettverk"}
                    </span>
                </div>
                {#if networks?.c == -1}
                    <div
                        class="flex items-center justify-center py-8 text-black dark:text-black"
                    >
                        <div
                            class="animate-spin rounded-full h-6 w-6 border-b-2 border-neas-green mr-3"
                        ></div>
                        <span class="text-sm font-medium"
                            >{translations.conf?.connection?.searching ??
                                "Søker etter nettverk..."}</span
                        >
                    </div>
                {/if}
                {#if networks?.n?.length}
                    <div class="space-y-3 max-h overflow-y-auto">
                        {#each networks.n as network, index (network.s ?? index)}
                            <label
                                class="group flex items-center justify-between gap-4 rounded-2xl border-2 border-transparent bg-neas-gray px-5 py-4 shadow-sm transition hover:border-neas-lightgreen-70 hover:bg-white dark:bg-neas-gray dark:hover:bg-neas-lightgreen-70 cursor-pointer"
                                class:border-neas-green={selectedSsid ===
                                    network.s}
                                class:border-transparent={selectedSsid !==
                                    network.s}
                                class:bg-white={selectedSsid === network.s}
                                class:shadow-lg={selectedSsid === network.s}
                            >
                                <span
                                    class="flex items-center gap-3 flex-1 min-w-0"
                                >
                                    <input
                                        type="radio"
                                        class="sr-only"
                                        name="ss"
                                        value={network.s}
                                        bind:group={selectedSsid}
                                        required={connectionMode == 1 ||
                                            connectionMode == 2}
                                    />
                                    <span
                                        class="min-w-0 flex-1 text-neas-green dark:text-neas-green font-medium truncate"
                                    >
                                        {network.s ||
                                            (translations.conf?.connection
                                                ?.hidden_ssid ??
                                                "Skjult nettverk")}
                                    </span>
                                </span>
                                <div
                                    class="flex items-center gap-3 flex-shrink-0"
                                >
                                    <img
                                        class="h-10 w-10"
                                        src={networkSignalInfos[index]?.icon ??
                                            WIFI_ICON_MAP.off}
                                        alt={networkSignalInfos[index]?.title ??
                                            "Wi-Fi frakoblet"}
                                        title={networkSignalInfos[index]
                                            ?.rssi != null
                                            ? `${networkSignalInfos[index]?.title ?? "Wi-Fi frakoblet"} (${networkSignalInfos[index].rssi} dBm)`
                                            : (networkSignalInfos[index]
                                                  ?.title ?? "Wi-Fi frakoblet")}
                                    />
                                </div>
                            </label>
                        {/each}
                    </div>
                {:else if networks?.c != -1}
                    <div
                        class="text-center py-8 text-neas-green dark:text-neas-green"
                    >
                        <svg
                            class="mb-3 opacity-100"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                            />
                        </svg>
                        <p class="text-sm font-medium">
                            {translations.conf?.connection?.no_networks ??
                                "Ingen nettverk funnet"}
                        </p>
                    </div>
                {/if}
            </div>
            <!-- WiFi Password -->
            <div class="mb-6">
                <label
                    for="wifi-password"
                    class="block text-sm font-medium text-neas-green dark:text-neas-green mb-2"
                >
                    {translations.conf?.connection?.psk ?? "WiFi-passord"}
                </label>
                <input
                    id="wifi-password"
                    name="sp"
                    type="password"
                    pattern={asciiPatternExt}
                    class="w-full px-4 py-3 rounded-xl bg-neas-gray dark:bg-neas-gray text-neas-green dark:text-neas-green border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-neas-green focus:border-neas-green transition-colors shadow-sm"
                    placeholder={translations.conf?.connection
                        ?.password_placeholder ?? "Skriv inn WiFi-passord"}
                    autocomplete="off"
                    required={connectionMode == 2}
                />
            </div>

            <!-- Auto-Detection Results -->
            {#if showAutoDetection && autoDetectionResults}
                <div
                    class="mb-6 rounded-2xl bg-green-50 border border-green-200 p-5 shadow-sm"
                >
                    <div class="flex items-start gap-3">
                        <div class="flex-shrink-0">
                            <svg
                                class="w-6 h-6 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-sm font-medium text-green-800 mb-2">
                                Måler oppdaget automatisk!
                            </h3>
                            <p class="text-sm text-green-700 mb-3">
                                Vi har oppdaget en {autoDetectionResults.detectedManufacturer ||
                                    "ukjent"} måler
                                {#if autoDetectionResults.detectedModel}
                                    (modell: {autoDetectionResults.detectedModel})
                                {/if}
                                med {autoDetectionResults.confidence}%
                                sikkerhet.
                            </p>
                            {#if data?.mt}
                                <p class="text-xs text-green-600 mb-2">
                                    Målertype fra payload: {data.mt}
                                    {#if data?.ds}
                                        | Distribusjonssystem: {data.ds}{/if}
                                    {#if data?.hm !== undefined}
                                        | HAN-status: {data.hm}{/if}
                                </p>
                            {/if}
                            {#if autoDetectionResults.reasoning.length > 0}
                                <details class="text-xs text-green-600 mb-3">
                                    <summary
                                        class="cursor-pointer hover:text-green-800"
                                        >Vis detaljer</summary
                                    >
                                    <ul class="mt-2 space-y-1 pl-4">
                                        {#each autoDetectionResults.reasoning as reason}
                                            <li>• {reason}</li>
                                        {/each}
                                    </ul>
                                </details>
                            {/if}
                            <div class="flex gap-2">
                                <button
                                    type="button"
                                    class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-full transition-colors"
                                    on:click={applyAutoDetectedPreset}
                                >
                                    Bruk anbefalte innstillinger
                                </button>
                                <button
                                    type="button"
                                    class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-full transition-colors"
                                    on:click={dismissAutoDetection}
                                >
                                    Avvis
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Submit Button -->
            <div class="text-center">
                <button
                    type="submit"
                    class="w-full bg-neas-green hover:bg-neas-green-90 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                >
                    {"Koble til og fortsett"}
                </button>
            </div>
            {#if reconnectTargets.length}
                <div
                    class="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                >
                    <div class="flex items-start">
                        <svg
                            class="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 mr-3 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <div>
                            <h4
                                class="text-sm font-medium text-green-800 dark:text-green-200 mb-2"
                            >
                                {translations.setup?.reconnect?.title ??
                                    "Oppsett fullført!"}
                            </h4>
                            <p
                                class="text-sm text-green-700 dark:text-green-300 mb-3"
                            >
                                {translations.setup?.reconnect?.info ??
                                    "Enheten starter på nytt og prøver å koble til på følgende adresser:"}
                            </p>
                            <div class="space-y-1">
                                {#each reconnectTargets as target}
                                    <div class="flex items-center">
                                        <code
                                            class="text-xs bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200 px-2 py-1 rounded font-mono"
                                        >
                                            {target.startsWith("http://") ||
                                            target.startsWith("https://")
                                                ? target
                                                : `http://${target}`}
                                        </code>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </form>
    </div>
</div>

<Mask
    active={loadingOrSaving}
    message={translations.setup?.mask ?? "Kobler til..."}
/>
