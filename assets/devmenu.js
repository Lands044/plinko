/*
 * Config editor panel — static (production) build of config-kit/core
 * src/js/config/devmenu.js. Loaded on demand by assets/plinko.js only when
 * config.dev.menu is true (the equivalent of the lazy devmenu chunk in a Vite
 * build).
 *
 * There is no dev server behind a static page, so the panel always works in
 * "prod" mode: edits apply live and are saved to this browser's localStorage
 * only. "Скачати" exports the edited config.json — replace the file on the
 * host to publish the change for everyone. Set "dev.menu": false in
 * config.json to hide the panel.
 *
 * Exposes window.LandingDevMenu.initDevMenu(config, onApply, { fields, title }).
 */
(function () {
	'use strict'

	var LC = window.LandingConfig

	const CSS = `
	.devmenu {
		position: fixed;
		top: 12px;
		right: 12px;
		z-index: 99999;
		width: 320px;
		max-width: calc(100vw - 24px);
		max-height: calc(100vh - 24px);
		display: flex;
		flex-direction: column;
		font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
		color: #e8e8ea;
		background: rgba(24, 24, 28, 0.94);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(8px);
	}
	.devmenu__head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		cursor: pointer;
		user-select: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	.devmenu__title { flex: 1; font-weight: 700; letter-spacing: 0.04em; }
	.devmenu__badge {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 99px;
		background: #3a6df0;
		color: #fff;
	}
	.devmenu__body { overflow-y: auto; padding: 4px 12px 12px; }
	.devmenu.is--collapsed .devmenu__body,
	.devmenu.is--collapsed .devmenu__foot { display: none; }
	.devmenu__group { margin-top: 12px; }
	.devmenu__group > legend,
	.devmenu__legend {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #8f8f9c;
		margin-bottom: 6px;
	}
	.devmenu__row {
		display: grid;
		grid-template-columns: 1fr 150px;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.devmenu__row label { color: #c9c9d4; overflow-wrap: anywhere; }
	.devmenu__row input[type="text"],
	.devmenu__row input[type="number"] {
		width: 100%;
		padding: 5px 7px;
		font: inherit;
		color: #fff;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 5px;
	}
	.devmenu__row input:focus { outline: 1px solid #3a6df0; }
	.devmenu__row input[type="checkbox"] { justify-self: start; width: 16px; height: 16px; }
	.devmenu__row input[type="range"] { width: 100%; }
	.devmenu__hint { color: #74748a; font-size: 10px; margin: 8px 0 0; }
	.devmenu__fieldhint { color: #74748a; font-size: 10px; margin: -2px 0 8px; line-height: 1.3; }
	.devmenu__status { font-size: 10px; margin: 4px 0 0; color: #8f8f9c; }
	.devmenu__status[data-tone="ok"] { color: #56c271; }
	.devmenu__status[data-tone="error"] { color: #f0736a; }
	.devmenu__foot {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 10px 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.devmenu__foot button {
		flex: 1 1 auto;
		padding: 6px 8px;
		font: inherit;
		color: #e8e8ea;
		background: rgba(255, 255, 255, 0.09);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 5px;
		cursor: pointer;
	}
	.devmenu__foot button:hover { background: rgba(255, 255, 255, 0.16); }
	.devmenu__foot button.is--primary { background: #3a6df0; border-color: #3a6df0; color: #fff; }
	`

	var getPath = function (object, path) {
		return path.split('.').reduce(function (acc, key) { return acc == null ? undefined : acc[key] }, object)
	}

	var setPath = function (object, path, value) {
		var keys = path.split('.')
		var last = keys.pop()
		var target = keys.reduce(function (acc, key) {
			if (acc[key] == null) acc[key] = {}
			return acc[key]
		}, object)
		target[last] = value
	}

	function readInput(field, input) {
		switch (field.type) {
			case 'checkbox': return input.checked
			case 'number':
			case 'range': {
				// undefined leaves the stored value alone (mergeConfig skips it), so
				// clearing a box to retype it doesn't persist a clamped minimum.
				var value = Number(input.value)
				return input.value.trim() === '' || !Number.isFinite(value) ? undefined : value
			}
			case 'list': return input.value.split(',').map(function (item) { return item.trim() }).filter(Boolean)
			default: return input.value
		}
	}

	function writeInput(field, input, value) {
		if (field.type === 'checkbox') input.checked = Boolean(value)
		else if (field.type === 'list') input.value = (value || []).join(', ')
		else input.value = value == null ? '' : value
	}

	var storage = {
		get: function (key) { try { return localStorage.getItem(key) } catch (e) { return null } },
		set: function (key, value) { try { localStorage.setItem(key, value) } catch (e) { /* ignore */ } }
	}

	function fetchServerConfig(fallback) {
		return fetch(LC.CONFIG_URL, { cache: 'no-store' })
			.then(function (r) { if (!r.ok) throw new Error(r.status); return r.json() })
			.catch(function () { return LC.clone(fallback) })
	}

	function initDevMenu(initialConfig, onApply, options) {
		var fields = (options && options.fields) || []
		var panelTitle = (options && options.title) || 'НАЛАШТУВАННЯ'
		var config = initialConfig
		var inputs = []

		// The file as written (not the normalized config): saving it back keeps
		// $comment docs and keys the panel does not manage. This browser's own
		// local edits take precedence — same source loadConfig() reads first.
		var local = LC.loadLocalConfig()
		var rawReady = local ? Promise.resolve(local) : fetchServerConfig(config)

		return rawReady.then(function (raw) {
			var style = document.createElement('style')
			style.textContent = CSS
			document.head.appendChild(style)

			var panel = document.createElement('div')
			panel.className = 'devmenu'
			if (storage.get('devmenu:collapsed') !== '0') panel.classList.add('is--collapsed')

			var head = document.createElement('div')
			head.className = 'devmenu__head'
			head.innerHTML = '<span class="devmenu__title"></span><span class="devmenu__badge">prod</span><span>▾</span>'
			head.querySelector('.devmenu__title').textContent = panelTitle
			head.addEventListener('click', function () {
				panel.classList.toggle('is--collapsed')
				storage.set('devmenu:collapsed', panel.classList.contains('is--collapsed') ? '1' : '0')
			})

			var body = document.createElement('div')
			body.className = 'devmenu__body'

			var saveTimer = null
			var status = null

			var setStatus = function (text, tone) {
				if (!status) return
				status.textContent = text
				status.dataset.tone = tone || ''
			}

			var scheduleSave = function () {
				setStatus('збереження…')
				clearTimeout(saveTimer)
				saveTimer = setTimeout(function () {
					var result = LC.saveLocalConfig(raw)
					if (result.ok) setStatus('збережено локально (лише цей браузер) ' + new Date().toLocaleTimeString(), 'ok')
					else setStatus('не збережено: ' + result.error, 'error')
				}, 300)
			}

			var sync = function (next) {
				config = next
				inputs.forEach(function (entry) {
					if (entry.field.maxPath) entry.input.max = getPath(config, entry.field.maxPath)
					writeInput(entry.field, entry.input, getPath(config, entry.field.path))
				})
			}

			var apply = function () {
				var patch = {}
				inputs.forEach(function (entry) { setPath(patch, entry.field.path, readInput(entry.field, entry.input)) })
				raw = LC.mergeConfig(raw, patch)
				config = LC.normalizeConfig(raw)
				// Normalization may pad/clamp values — mirror the result into the inputs.
				sync(config)
				onApply(config)
				scheduleSave()
			}

			fields.forEach(function (groupDef) {
				var group = document.createElement('div')
				group.className = 'devmenu__group'

				var legend = document.createElement('div')
				legend.className = 'devmenu__legend'
				legend.textContent = groupDef[0]
				group.appendChild(legend)

				groupDef[1].forEach(function (field) {
					var row = document.createElement('div')
					row.className = 'devmenu__row'

					var label = document.createElement('label')
					label.textContent = field.label

					var input = document.createElement('input')
					input.type = field.type === 'list' ? 'text' : field.type
					if (field.min !== undefined) input.min = field.min
					if (field.max !== undefined) input.max = field.max
					if (field.maxPath) input.max = getPath(config, field.maxPath)
					if (field.step !== undefined) input.step = field.step
					writeInput(field, input, getPath(config, field.path))
					input.addEventListener('change', apply)

					label.htmlFor = input.id = 'devmenu-' + field.path.replace(/\./g, '-')
					inputs.push({ field: field, input: input })
					row.append(label, input)
					group.appendChild(row)

					if (field.hint) {
						var note = document.createElement('p')
						note.className = 'devmenu__fieldhint'
						note.textContent = field.hint
						group.appendChild(note)
					}
				})

				body.appendChild(group)
			})

			var hint = document.createElement('p')
			hint.className = 'devmenu__hint'
			hint.textContent = 'Зміни зберігаються лише в цьому браузері (localStorage). Щоб опублікувати їх на сайті — натисніть "Скачати" і замініть config.json на хостингу.'
			body.appendChild(hint)

			status = document.createElement('p')
			status.className = 'devmenu__status'
			status.textContent = local ? 'діють локальні зміни' : 'очікування'
			body.appendChild(status)

			var foot = document.createElement('div')
			foot.className = 'devmenu__foot'

			var button = function (text, primary, handler) {
				var element = document.createElement('button')
				element.type = 'button'
				element.textContent = text
				if (primary) element.className = 'is--primary'
				element.addEventListener('click', handler)
				foot.appendChild(element)
				return element
			}

			button('Перезапуск', true, function () { onApply(config) })

			button('Скачати', false, function () {
				var url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, '\t')], { type: 'application/json' }))
				var link = document.createElement('a')
				link.href = url
				link.download = 'config.json'
				link.click()
				setTimeout(function () { URL.revokeObjectURL(url) }, 0)
			})

			button('Скинути локальні зміни', false, function () {
				LC.clearLocalConfig()
				fetchServerConfig(LC.normalizeConfig({})).then(function (serverRaw) {
					raw = serverRaw
					config = LC.normalizeConfig(raw)
					sync(config)
					onApply(config)
					setStatus('локальні зміни скинуто', 'ok')
				})
			})

			panel.append(head, body, foot)
			document.body.appendChild(panel)

			return { sync: sync }
		})
	}

	window.LandingDevMenu = { initDevMenu: initDevMenu }
})()
