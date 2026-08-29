/**
 * Traccar command types, and what a VL863P actually does with each one.
 *
 * Shared by the Command module and the Saved Commands page so the two name the same command the
 * same way.
 *
 * VL863P_ENCODING is not decoration. Traccar's typed commands are protocol-neutral names — the
 * device never sees "engineStop", it sees `RELAY,1,10#`, because Vl863pProtocolEncoder rewrites
 * it on the way out. Showing that string next to the picker means an operator can tell what is
 * about to reach the vehicle, and can recognise the reply when it comes back. The strings here
 * are the encoder's own, so they stay true as long as the fork's encoder does.
 *
 * Only commands VL863P registers as supported carry an encoding; anything else in the list comes
 * from Traccar's full catalogue and will be refused for this protocol.
 */

export const TYPE_LABELS = {
    custom: 'Custom',
    deviceIdentification: 'Device Identification',
    identification: 'Query Parameters',
    positionSingle: 'Position Single',
    positionPeriodic: 'Position Periodic',
    positionStop: 'Position Stop',
    engineStop: 'Engine Stop',
    engineResume: 'Engine Resume',
    alarmArm: 'Arm Alarm',
    alarmDisarm: 'Disarm Alarm',
    alarmDismiss: 'Dismiss Alarm',
    setTimezone: 'Set Timezone',
    requestPhoto: 'Request Photo',
    powerOff: 'Power Off',
    rebootDevice: 'Reboot Device',
    factoryReset: 'Factory Reset',
    sendSms: 'Send SMS',
    sendUssd: 'Send USSD',
    sosNumber: 'SOS Number',
    silenceTime: 'Silence Time',
    setPhonebook: 'Set Phonebook',
    message: 'Message',
    voiceMessage: 'Voice Message',
    outputControl: 'Output Control',
    voiceMonitoring: 'Voice Monitoring',
    setAgps: 'Set AGPS',
    setIndicator: 'Set Indicator',
    configuration: 'Configuration',
    getVersion: 'Get Version',
    firmwareUpdate: 'Firmware Update',
    setConnection: 'Set Connection',
    setOdometer: 'Set Odometer',
    getModemStatus: 'Get Modem Status',
    getDeviceStatus: 'Get Device Status',
    setSpeedLimit: 'Set Speed Limit',
    modePowerSaving: 'Power Saving Mode',
    modeDeepSleep: 'Deep Sleep Mode',
    videoStart: 'Video Start',
    videoStop: 'Video Stop',
    alarmGeofence: 'Set Geofence Alarm',
    alarmBattery: 'Set Battery Alarm',
    alarmSos: 'Set SOS Alarm',
    alarmRemove: 'Set Remove Alarm',
    alarmClock: 'Set Clock Alarm',
    alarmSpeed: 'Set Speed Alarm',
    alarmFall: 'Set Fall Alarm',
    alarmVibration: 'Set Vibration Alarm',
};

function humanize(type) {
    if (!type) return '';
    return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

export const typeLabel = (type) => TYPE_LABELS[type] || humanize(type);

/** The ASCII the VL863P encoder puts on the wire for each typed command. */
export const VL863P_ENCODING = {
    engineStop:      'RELAY,1,10#',
    engineResume:    'RELAY,0,10#',
    rebootDevice:    'RESET#',
    factoryReset:    'FACTORY#',
    alarmDisarm:     'DSRESET#',
    getVersion:      'VERSION#',
    getDeviceStatus: 'STATUS#',
    identification:  'PARAM#',
    getModemStatus:  'GPRSSET#',
    positionSingle:  'WHERE#',
    positionPeriodic:'TIMER,n,n#',
    setTimezone:     'GMT,E|W,hh,mm#',
    setSpeedLimit:   'SPEED,ON,0,n,10#',
    setOdometer:     'MILEAGE,ON,n,1000#',
    setConnection:   'SERVER,0|1,host,port#',
    sosNumber:       'SOS,A,number#',
    voiceMonitoring: 'MONITOR,number#',
    setAgps:         'AGPS,ON|OFF#',
    setIndicator:    'LEDSW,ON|OFF#',
    modePowerSaving: 'LPMODE,0|1#',
    outputControl:   'VOUTPUT,port,1,level,1#',
};

/**
 * The attributes each typed command needs, so the form can ask for them.
 *
 * Keys are Traccar's own attribute names — they are what the encoder reads — so these must not be
 * renamed for readability. A type absent from this map takes no parameters.
 */
export const COMMAND_PARAMS = {
    positionPeriodic: [{ key: 'frequency', label: 'Reporting interval (seconds)', type: 'number', min: 5, def: 60 }],
    setTimezone:      [{ key: 'timezone',  label: 'Time zone',                    type: 'text',   def: 'Asia/Manila' }],
    setSpeedLimit:    [{ key: 'data',      label: 'Speed limit (km/h)',           type: 'number', min: 1, def: 80 }],
    setOdometer:      [{ key: 'data',      label: 'Starting mileage (km)',        type: 'number', min: 0, def: 0 }],
    setConnection:    [
        { key: 'server', label: 'Server (IP or hostname)', type: 'text' },
        { key: 'port',   label: 'Port',                    type: 'number', min: 1, def: 5023 },
    ],
    sosNumber:        [{ key: 'phone',  label: 'SOS number',            type: 'text' }],
    voiceMonitoring:  [{ key: 'phone',  label: 'Number to call',        type: 'text' }],
    setAgps:          [{ key: 'enable', label: 'Enable AGPS',           type: 'boolean', def: true }],
    setIndicator:     [{ key: 'enable', label: 'Enable LED indicator',  type: 'boolean', def: true }],
    modePowerSaving:  [{ key: 'enable', label: 'Sleep on power loss',   type: 'boolean', def: true }],
    outputControl:    [
        { key: 'index', label: 'Output port',  type: 'number', min: 1, def: 1 },
        { key: 'data',  label: 'Output level', type: 'number', min: 0, def: 1 },
    ],
};

/**
 * One-click text commands. Deliberately queries only — every one of these asks the device
 * something and changes nothing, so an operator can use them to find out whether the whole
 * send-and-read-the-answer path is working without touching the vehicle's configuration.
 */
export const TEXT_PRESETS = [
    { command: 'STATUS#',  label: 'Device status' },
    { command: 'VERSION#', label: 'Firmware version' },
    { command: 'PARAM#',   label: 'Parameters' },
    { command: 'GPRSSET#', label: 'Network settings' },
    { command: 'WHERE#',   label: 'Location now' },
];

/**
 * Commands that reboot or reset the device instead of answering.
 *
 * The connection drops as they run, so no 0x21 reply is ever coming. Warning up front is the
 * point — otherwise the page waits out a timeout and reports a failure on a command that worked.
 */
export const SILENT_COMMANDS = ['RESET', 'FACTORY'];

/** The keyword before the first comma: "SPEED,ON,0,80,10#" is a SPEED command. */
export const commandKeyword = (content) =>
    String(content || '').trim().toUpperCase().split(/[,#]/)[0];
