/*
 * Runtime config engine — static (production) build of config-kit/core
 * (src/js/config/config.js + defaults.js), without Vite.
 *
 * The page reads config.json (next to index.html) on every load, so texts,
 * payouts, timings and the CTA link change WITHOUT any build step.
 *
 * Exposes window.LandingConfig. The game registers its own defaults and
 * normalizer (assets/plinko.config.js) before calling loadConfig().
 *
 * Differences from the Vite version of the kit:
 * - no dev server, so there is no POST /__config writer: the config panel always
 *   works in "prod" mode and persists edits to this browser's localStorage;
 * - setDefaults(): the game's own DEFAULT_CONFIG is what config.json is merged
 *   onto, so a missing/partial config.json still yields a complete `game` block.
 */
(function () {
	'use strict'

	// Core shape only: fields every landing needs regardless of mechanic. The game
	// replaces this through setDefaults() (dropping the core keys it doesn't use).
	var CORE_DEFAULTS = {
		version: 1,
		cta: {
			url: 'https://example.com/',
			target: '_self'
		},
		texts: {
			popupTitle: 'Congratulations!',
			popupText: 'Ready to continue playing?',
			ctaButton: 'Continue'
		},
		dev: {
			watch: false,
			watchInterval: 1500,
			menu: true
		}
	}

	// Resolved relative to <base>, so the landing keeps working when it is
	// deployed into a subfolder or embedded in the PWA shell.
	var CONFIG_URL = new URL('config.json', document.baseURI).href
	var LOCAL_STORAGE_KEY = 'config:local'

	var clone = function (value) {
		return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
	}

	var isPlainObject = function (value) {
		return value !== null && typeof value === 'object' && !Array.isArray(value)
	}

	// Deep merge: objects merge key-by-key, arrays are replaced wholesale — a
	// config that lists 4 entries means 4, not "the first 4 of the defaults".
	function mergeConfig(base, patch) {
		if (!isPlainObject(patch)) return clone(base)

		var out = clone(base)
		Object.keys(patch).forEach(function (key) {
			var value = patch[key]
			if (key.charAt(0) === '$') return
			if (isPlainObject(value) && isPlainObject(out[key])) {
				out[key] = mergeConfig(out[key], value)
			} else if (isPlainObject(value) && Array.isArray(out[key])) {
				// Index-keyed patch ({ "0": [...] }) built by the config panel for a
				// path like `game.multipliers.14.0` — merge entry by entry.
				out[key] = mergeArray(out[key], value)
			} else if (value !== undefined) {
				out[key] = clone(value)
			}
		})
		return out
	}

	function mergeArray(base, patch) {
		var out = clone(base)
		Object.keys(patch).forEach(function (key) {
			var index = Number(key)
			var value = patch[key]
			if (!Number.isInteger(index) || index < 0 || value === undefined) return
			out[index] = isPlainObject(value) && isPlainObject(out[index])
				? mergeConfig(out[index], value)
				: clone(value)
		})
		return out
	}

	var toNumber = function (value, fallback) {
		var n = Number(value)
		return Number.isFinite(n) ? n : fallback
	}

	var clampInt = function (value, fallback, min, max) {
		var n = Math.round(toNumber(value, fallback))
		return Math.min(max, Math.max(min, n))
	}

	var defaults = CORE_DEFAULTS
	var setDefaults = function (value) { defaults = value }
	var getDefaults = function () { return defaults }

	// Game-specific validation hook, runs last. Identity until the game sets it.
	var normalizeGameConfig = function (config) { return config }
	var setGameNormalizer = function (fn) { normalizeGameConfig = fn }

	function normalizeConfig(input) {
		var config = mergeConfig(defaults, input)

		config.cta.target = config.cta.target === '_blank' ? '_blank' : '_self'
		config.dev.watch = config.dev.watch === true
		config.dev.menu = config.dev.menu !== false
		config.dev.watchInterval = clampInt(config.dev.watchInterval, 1500, 500, 60000)

		if (config.sound) {
			config.sound.volume = Math.min(1, Math.max(0, toNumber(config.sound.volume, 1)))
			config.sound.enabled = config.sound.enabled !== false
		}

		return normalizeGameConfig(config)
	}

	function fetchConfig(url) {
		// no-store: an edited config.json is picked up on the next load instead of
		// being served from the HTTP cache.
		return fetch(url, { cache: 'no-store' }).then(function (response) {
			if (!response.ok) throw new Error(response.status + ' ' + response.statusText)
			return response.json()
		})
	}

	function loadLocalConfig() {
		try {
			var raw = localStorage.getItem(LOCAL_STORAGE_KEY)
			return raw ? JSON.parse(raw) : null
		} catch (e) {
			// Private browsing / storage disabled / corrupted entry — treat as absent.
			return null
		}
	}

	function saveLocalConfig(raw) {
		try {
			localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(raw))
			return { ok: true }
		} catch (error) {
			return { ok: false, error: error.message }
		}
	}

	function clearLocalConfig() {
		try { localStorage.removeItem(LOCAL_STORAGE_KEY) } catch (e) { /* nothing to clear */ }
	}

	/**
	 * Resolves the config for this page load.
	 *
	 * Priority: window.<injectGlobal> (injected by a PWA host)
	 *        -> ?config=<url> (per-link override)
	 *        -> this browser's local config-panel edits (localStorage)
	 *        -> config.json
	 *        -> built-in defaults
	 */
	function loadConfig(options) {
		var injectGlobal = (options && options.injectGlobal) || 'LANDING_CONFIG'

		var injected = window[injectGlobal]
		if (isPlainObject(injected)) return Promise.resolve(normalizeConfig(injected))

		var override = new URLSearchParams(window.location.search).get('config')
		if (override) {
			var url = new URL(override, document.baseURI).href
			return fetchConfig(url).then(normalizeConfig, function (error) {
				console.warn('[config] falling back to defaults, could not load ' + url + ':', error.message)
				return normalizeConfig({})
			})
		}

		var local = loadLocalConfig()
		if (isPlainObject(local)) return Promise.resolve(normalizeConfig(local))

		return fetchConfig(CONFIG_URL).then(normalizeConfig, function (error) {
			console.warn('[config] falling back to defaults, could not load ' + CONFIG_URL + ':', error.message)
			return normalizeConfig({})
		})
	}

	/**
	 * Polls config.json and calls back whenever the file changes (dev.watch), so
	 * an edit on the host re-renders open pages without a reload. Off by default
	 * in production — it is a request every watchInterval ms per open page.
	 * Returns a stop function.
	 */
	function watchConfig(config, onChange, options) {
		var injectGlobal = (options && options.injectGlobal) || 'LANDING_CONFIG'
		if (!config.dev.watch || window[injectGlobal]) return function () {}
		// Local panel edits win over the server file — don't let the watcher fight them.
		if (loadLocalConfig()) return function () {}

		var baseline = null
		var stopped = false

		var tick = function () {
			fetchConfig(CONFIG_URL).then(function (raw) {
				if (stopped) return
				var serialized = JSON.stringify(raw)
				if (baseline !== null && serialized !== baseline) onChange(normalizeConfig(raw))
				baseline = serialized
			}).catch(function () { /* transient read error — next tick retries */ })
		}

		tick()
		var timer = setInterval(tick, config.dev.watchInterval)
		return function () {
			stopped = true
			clearInterval(timer)
		}
	}

	window.LandingConfig = {
		CONFIG_URL: CONFIG_URL,
		CORE_DEFAULTS: CORE_DEFAULTS,
		clone: clone,
		mergeConfig: mergeConfig,
		normalizeConfig: normalizeConfig,
		toNumber: toNumber,
		clampInt: clampInt,
		setDefaults: setDefaults,
		getDefaults: getDefaults,
		setGameNormalizer: setGameNormalizer,
		loadConfig: loadConfig,
		watchConfig: watchConfig,
		loadLocalConfig: loadLocalConfig,
		saveLocalConfig: saveLocalConfig,
		clearLocalConfig: clearLocalConfig
	}
})()
