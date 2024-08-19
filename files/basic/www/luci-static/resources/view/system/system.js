'use strict';
'require view';
'require poll';
'require ui';
'require uci';
'require fs';
'require rpc';
'require form';
'require tools.widgets as widgets';

var callInitList, callInitAction, callTimezone,
	callGetLocaltime, callSetLocaltime, CBILocalTime;
	
function createElementConfig(classType, idName, envVar, defaultValue = '', allowEmpty = false) {
	return {
		idSelector: `${classType}[id*="${idName}"]`,
		envVar: envVar,
		defaultValue: defaultValue,
		allowEmpty: allowEmpty
	};
}

var elements = [
	createElementConfig('.cbi-input-text', 'hostname', 'hostname', 'prx126-sfp-pon'),
	createElementConfig('.cbi-input-select', 'zonename', 'timezone', 'UTC'),
	createElementConfig('.cbi-input-select', '_lang', 'syslang', 'auto'),
	// createElementConfig('.cbi-input-text', 'description', 'description', '', true),  // allowEmpty: true
	// Add more..
];

callInitList = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: [ 'name' ],
	expect: { '': {} },
	filter: function(res) {
		for (var k in res)
			return +res[k].enabled;
		return null;
	}
});

callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

callGetLocaltime = rpc.declare({
	object: 'system',
	method: 'info',
	expect: { localtime: 0 }
});

callSetLocaltime = rpc.declare({
	object: 'luci',
	method: 'setLocaltime',
	params: [ 'localtime' ],
	expect: { result: 0 }
});

callTimezone = rpc.declare({
	object: 'luci',
	method: 'getTimezones',
	expect: { '': {} }
});

function formatTime(epoch) {
	var date = new Date(epoch * 1000);

	return '%04d-%02d-%02d %02d:%02d:%02d'.format(
		date.getUTCFullYear(),
		date.getUTCMonth() + 1,
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds()
	);
}

CBILocalTime = form.DummyValue.extend({
	renderWidget: function(section_id, option_id, cfgvalue) {
		return E([], [
			E('input', {
				'id': 'localtime',
				'type': 'text',
				'readonly': true,
				'value': formatTime(cfgvalue)
			}),
			E('br'),
			E('span', { 'class': 'control-group' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, function() {
						return callSetLocaltime(Math.floor(Date.now() / 1000));
					}),
					'disabled': (this.readonly != null) ? this.readonly : this.map.readonly
				}, _('Sync with browser')),
				' ',
				this.ntpd_support ? E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, function() {
						return callInitAction('sysntpd', 'restart');
					}),
					'disabled': (this.readonly != null) ? this.readonly : this.map.readonly
				}, _('Sync with NTP-Server')) : ''
			])
		]);
	},
});

return view.extend({
	load: function() {
		return Promise.all([
			callInitList('sysntpd'),
			callTimezone(),
			callGetLocaltime(),
			uci.load('luci'),
			uci.load('system')
		]);/*.then(async (rpc_replies) => {
			let configValues = {};
			for (let i = 0; i < elements.length; i++) {
				let envVar = elements[i].envVar;

				try {
					let result = (await fs.exec("/usr/sbin/fwenv_get", ["--8311", `${envVar}`])).stdout;

					console.log(`fwenv_get --8311 '${envVar}':`, result);
					if (result != null && typeof result === 'string') {
						configValues[envVar] = result.trim();
					} else {
						console.warn(`No value retrieved for ${envVar}, using default value.`);
						configValues[envVar] = elements[i].defaultValue;
					}
				} catch (error) {
					console.warn(`Failed to retrieve value for ${envVar}:`, error);
					configValues[envVar] = elements[i].defaultValue;
				}
			}
			return [...rpc_replies, configValues];
		});*/ // WIP
	},

	render: function(rpc_replies) {
		var ntpd_enabled = rpc_replies[0],
		    timezones = rpc_replies[1],
			localtime = rpc_replies[2],
			// configValues = rpc_replies[5],
		    m, s, o;

		m = new form.Map('system',
			_('System'),
			_('Here you can configure the basic aspects of your device like its hostname or the timezone.'));

		m.chain('luci');

		s = m.section(form.TypedSection, 'system', _('System Properties'));
		s.anonymous = true;
		s.addremove = false;

		s.tab('general', _('General Settings'));
		// s.tab('logging', _('Logging'));
		// s.tab('timesync', _('Time Synchronization'));
		s.tab('language', _('Language and Style'));

		/*
		 * System Properties
		 */

		o = s.taboption('general', CBILocalTime, '_systime', _('Local Time'));
		o.cfgvalue = function() { return localtime };
		o.ntpd_support = ntpd_enabled;

		o = s.taboption('general', form.Value, 'hostname', _('Hostname'));
		o.datatype = 'hostname';

		/* could be used also as a default for LLDP, SNMP "system description" in the future 
		o = s.taboption('general', form.Value, 'description', _('Description'), _('An optional, short description for this device'));
		o.optional = true;

		o = s.taboption('general', form.TextValue, 'notes', _('Notes'), _('Optional, free-form notes about this device'));
		o.optional = true;*/

		o = s.taboption('general', form.ListValue, 'zonename', _('Timezone'));
		o.value('UTC');

		var zones = Object.keys(timezones || {}).sort();
		for (var i = 0; i < zones.length; i++)
			o.value(zones[i]);

		o.write = function(section_id, formvalue) {
			var tz = timezones[formvalue] ? timezones[formvalue].tzstring : null;
			uci.set('system', section_id, 'zonename', formvalue);
			uci.set('system', section_id, 'timezone', tz);
		};

		/*
		 * Logging
		 

		o = s.taboption('logging', form.Value, 'log_size', _('System log buffer size'), "kiB")
		o.optional    = true
		o.placeholder = 16
		o.datatype    = 'uinteger'

		o = s.taboption('logging', form.Value, 'log_ip', _('External system log server'))
		o.optional    = true
		o.placeholder = '0.0.0.0'
		o.datatype    = 'host'

		o = s.taboption('logging', form.Value, 'log_port', _('External system log server port'))
		o.optional    = true
		o.placeholder = 514
		o.datatype    = 'port'

		o = s.taboption('logging', form.ListValue, 'log_proto', _('External system log server protocol'))
		o.value('udp', 'UDP')
		o.value('tcp', 'TCP')

		o = s.taboption('logging', form.Value, 'log_file', _('Write system log to file'))
		o.optional    = true
		o.placeholder = '/tmp/system.log'

		o = s.taboption('logging', form.ListValue, 'conloglevel', _('Log output level'))
		o.value(8, _('Debug'))
		o.value(7, _('Info'))
		o.value(6, _('Notice'))
		o.value(5, _('Warning'))
		o.value(4, _('Error'))
		o.value(3, _('Critical'))
		o.value(2, _('Alert'))
		o.value(1, _('Emergency'))

		o = s.taboption('logging', form.ListValue, 'cronloglevel', _('Cron Log Level'))
		o.default = 8
		o.value(5, _('Debug'))
		o.value(8, _('Normal'))
		o.value(9, _('Warning'))
		*/
		/*
		 * Zram Properties
		 */

		if (L.hasSystemFeature('zram')) {
			s.tab('zram', _('ZRam Settings'));

			o = s.taboption('zram', form.Value, 'zram_size_mb', _('ZRam Size'), _('Size of the ZRam device in megabytes'));
			o.optional    = true;
			o.placeholder = 16;
			o.datatype    = 'uinteger';

			o = s.taboption('zram', form.ListValue, 'zram_comp_algo', _('ZRam Compression Algorithm'));
			o.optional    = true;
			o.default     = 'lzo';
			o.value('lzo', 'lzo');
			o.value('lz4', 'lz4');
			o.value('zstd', 'zstd');
		}

		/*
		 * Language & Style
		 */

		o = s.taboption('language', form.ListValue, '_lang', _('Language'))
		o.uciconfig = 'luci';
		o.ucisection = 'main';
		o.ucioption = 'lang';
		o.value('auto');

		var l = Object.assign({ en: 'English' }, uci.get('luci', 'languages')),
		    k = Object.keys(l).sort();
		for (var i = 0; i < k.length; i++)
			if (k[i].charAt(0) != '.')
				o.value(k[i], l[k[i]]);

		o = s.taboption('language', form.ListValue, '_mediaurlbase', _('Design'))
		o.uciconfig = 'luci';
		o.ucisection = 'main';
		o.ucioption = 'mediaurlbase';

		var k = Object.keys(uci.get('luci', 'themes') || {}).sort();
		for (var i = 0; i < k.length; i++)
			if (k[i].charAt(0) != '.')
				o.value(uci.get('luci', 'themes', k[i]), k[i]);

		/*
		 * NTP
		 

		if (L.hasSystemFeature('sysntpd')) {
			var default_servers = [
				'0.openwrt.pool.ntp.org', '1.openwrt.pool.ntp.org',
				'2.openwrt.pool.ntp.org', '3.openwrt.pool.ntp.org'
			];

			o = s.taboption('timesync', form.Flag, 'enabled', _('Enable NTP client'));
			o.rmempty = false;
			o.ucisection = 'ntp';
			o.default = o.disabled;
			o.write = function(section_id, value) {
				ntpd_enabled = +value;

				if (ntpd_enabled && !uci.get('system', 'ntp')) {
					uci.add('system', 'timeserver', 'ntp');
					uci.set('system', 'ntp', 'server', default_servers);
				}

				if (!ntpd_enabled)
					uci.set('system', 'ntp', 'enabled', 0);
				else
					uci.unset('system', 'ntp', 'enabled');

				return callInitAction('sysntpd', 'enable');
			};
			o.load = function(section_id) {
				return (ntpd_enabled == 1 &&
				        uci.get('system', 'ntp') != null &&
				        uci.get('system', 'ntp', 'enabled') != 0) ? '1' : '0';
			};

			o = s.taboption('timesync', form.Flag, 'enable_server', _('Provide NTP server'));
			o.ucisection = 'ntp';
			o.depends('enabled', '1');

			o = s.taboption('timesync', widgets.NetworkSelect, 'interface',
				_('Bind NTP server'),
				_('Provide the NTP server to the selected interface or, if unspecified, to all interfaces'));
			o.ucisection = 'ntp';
			o.depends('enable_server', '1');
			o.multiple = false;
			o.nocreate = true;
			o.optional = true;

			o = s.taboption('timesync', form.Flag, 'use_dhcp', _('Use DHCP advertised servers'));
			o.ucisection = 'ntp';
			o.default = o.enabled;
			o.depends('enabled', '1');

			o = s.taboption('timesync', form.DynamicList, 'server', _('NTP server candidates'));
			o.datatype = 'host(0)';
			o.ucisection = 'ntp';
			o.depends('enabled', '1');
			o.load = function(section_id) {
				return uci.get('system', 'ntp', 'server');
			};
		}*/

		return m.render().then(function(mapEl) {
			poll.add(function() {
				return callGetLocaltime().then(function(t) {
					mapEl.querySelector('#localtime').value = formatTime(t);
				});
			});

			return mapEl;
		});
	},

	handleSaveApply: async function (ev) {
		await this.__base__.handleSaveApply(ev);
		try {
			for (let i = 0; i < elements.length; i++) {
				var el = document.querySelector(elements[i].idSelector);
				var value = el ? el.value : elements[i].defaultValue;

				if (value || elements[i].allowEmpty) {
					var envVar = elements[i].envVar;
					var cmdArgs = ["--8311", `${envVar}`, `${value}`];
					await fs.exec("/usr/sbin/fwenv_set", cmdArgs);
					console.log(`fwenv_set ${cmdArgs.join(' ')}`);
				} else {
					console.warn(`Failed to retrieve value: ${envVar}`);
				}
			}
			ui.addNotification(null, E('p', _('[8311] Save cfg to uboot.')), 'info');
		} catch (error) {
			console.warn(error);
		}
	},
	handleSave: null
});
