/*
 * Plinko's own config: defaults, normalizer and config-panel fields.
 * Static equivalent of config-kit's game.defaults.js + normalize.js +
 * devmenu.fields.js. Load after assets/config.js, before assets/plinko.js.
 *
 * Adding a new option:
 *   1. default here (DEFAULT_CONFIG) and in config.json;
 *   2. validate it in normalizeGameConfig();
 *   3. read it in assets/plinko.js (render() or the Game class);
 *   4. optionally a row in gameFields().
 *
 * Multipliers, pin counts, ball speed and other timings are deliberately NOT
 * here — they are hardcoded in assets/plinko.js.
 */
(function () {
	'use strict'

	var LC = window.LandingConfig
	var toNumber = LC.toNumber
	var clampInt = LC.clampInt

	var DEFAULT_CONFIG = {
		version: 1,

		game: {
			currency: 'USD',
			// Starting balance.
			balance: 3000,
			// Bet stepper: starts at min, +/- by step, capped at max.
			bet: { min: 10, max: 100, step: 10 },
			// Popup shows after this many drops (or earlier on a big win — the
			// multipliers and that threshold are hardcoded in assets/plinko.js).
			ctaAfterDrops: 3
		},

		cta: {
			url: 'https://www.google.com/',
			target: '_self'
		},

		texts: {
			logo: 'PLINKO',
			pinsLabel: 'Pins:',
			maxWinLabel: 'Max win:',
			betLabel: 'Bet',
			popupTitle: 'Congratulations!',
			popupText: 'Ready to continue playing?',
			ctaButton: 'Download Now'
		},

		dev: {
			watch: false,
			watchInterval: 1500,
			menu: true
		}
	}

	var DEFAULT_GAME = DEFAULT_CONFIG.game

	var str = function (value, fallback) {
		return typeof value === 'string' ? value : fallback
	}

	function normalizeGameConfig(config) {
		var g = config.game
		var t = config.texts

		g.currency = str(g.currency, DEFAULT_GAME.currency)
		g.balance = Math.max(0, toNumber(g.balance, DEFAULT_GAME.balance))

		var bet = g.bet || {}
		var betMin = Math.max(0.01, toNumber(bet.min, DEFAULT_GAME.bet.min))
		var betMax = Math.max(betMin, toNumber(bet.max, DEFAULT_GAME.bet.max))
		var betStep = Math.max(0.01, toNumber(bet.step, DEFAULT_GAME.bet.step))
		g.bet = { min: betMin, max: betMax, step: betStep }

		g.ctaAfterDrops = clampInt(g.ctaAfterDrops, DEFAULT_GAME.ctaAfterDrops, 1, 1000)

		Object.keys(DEFAULT_CONFIG.texts).forEach(function (key) {
			t[key] = str(t[key], DEFAULT_CONFIG.texts[key])
		})
		config.cta.url = str(config.cta.url, DEFAULT_CONFIG.cta.url)

		return config
	}

	// Config-panel fields. Labels in Ukrainian, same as the core kit's panel.
	function gameFields() {
		return [
			['Гра', [
				{ path: 'game.balance', label: 'Стартовий баланс', type: 'number', min: 0, step: 100 },
				{ path: 'game.currency', label: 'Валюта', type: 'text' },
				{ path: 'game.bet.min', label: 'Ставка: мін', type: 'number', min: 0, step: 1 },
				{ path: 'game.bet.max', label: 'Ставка: макс', type: 'number', min: 0, step: 1 },
				{ path: 'game.bet.step', label: 'Ставка: крок', type: 'number', min: 0, step: 1 },
				{ path: 'game.ctaAfterDrops', label: 'Попап після N кидків', type: 'number', min: 1, step: 1 }
			]],
			['Тексти', [
				{ path: 'texts.logo', label: 'Логотип', type: 'text' },
				{ path: 'texts.pinsLabel', label: 'Підпис пінів', type: 'text' },
				{ path: 'texts.maxWinLabel', label: 'Підпис Max win', type: 'text' },
				{ path: 'texts.betLabel', label: 'Підпис ставки', type: 'text' },
				{ path: 'texts.popupTitle', label: 'Заголовок вікна', type: 'text' },
				{ path: 'texts.popupText', label: 'Текст вікна', type: 'text' },
				{ path: 'texts.ctaButton', label: 'Кнопка CTA', type: 'text' }
			]],
			['CTA', [
				{ path: 'cta.url', label: 'Посилання', type: 'text' },
				{ path: 'cta.target', label: 'Target', type: 'text', hint: '_self або _blank' }
			]]
		]
	}

	LC.setDefaults(DEFAULT_CONFIG)
	LC.setGameNormalizer(normalizeGameConfig)

	window.PlinkoConfig = {
		DEFAULT_CONFIG: DEFAULT_CONFIG,
		gameFields: gameFields
	}
})()
